import bcrypt from "bcryptjs";
import {
    acceptChapterInviteSchema,
    acceptWorkspaceInviteSchema,
    loginSchema,
    passwordResetConfirmSchema,
    passwordResetRequestSchema,
    refreshTokenSchema,
} from "@biddly/contracts";
import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { env } from "../lib/env.js";
import { normalizePhone } from "../lib/phone.js";
import { createUniqueChapterSlug } from "../lib/slug.js";
import {
    issueSession,
    revokeRefreshToken,
    rotateRefreshToken,
} from "../lib/sessions.js";
import { createOpaqueToken, hashToken } from "../lib/tokens.js";

export async function authRoutes(app: FastifyInstance) {
    app.post(
        "/auth/login",
        { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
        async (request, reply) => {
            const parsed = loginSchema.safeParse(request.body);

            if (!parsed.success) {
                return reply.code(400).send({ error: "Invalid login request" });
            }

            const user = await prisma.user.findUnique({
                where: { email: parsed.data.email },
            });

            if (!user || !user.isActive || !user.emailVerified) {
                return reply
                    .code(401)
                    .send({ error: "Invalid email or password" });
            }

            const validPassword = await bcrypt.compare(
                parsed.data.password,
                user.passwordHash,
            );

            if (!validPassword) {
                return reply
                    .code(401)
                    .send({ error: "Invalid email or password" });
            }

            return issueSession(app, user.id);
        },
    );

    app.post("/auth/refresh", async (request, reply) => {
        const parsed = refreshTokenSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.code(400).send({ error: "Invalid refresh request" });
        }

        const session = await rotateRefreshToken(app, parsed.data.refreshToken);

        if (!session) {
            return reply
                .code(401)
                .send({ error: "Refresh token is invalid or expired" });
        }

        return session;
    });

    app.post("/auth/logout", async (request, reply) => {
        const parsed = refreshTokenSchema.safeParse(request.body);

        if (parsed.success) {
            await revokeRefreshToken(parsed.data.refreshToken);
        }

        return reply.code(204).send();
    });

    app.get("/auth/workspace-invites/:token", async (request, reply) => {
        const { token } = request.params as { token: string };
        const invite = await prisma.workspaceInvite.findUnique({
            where: { tokenHash: hashToken(token) },
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        shortName: true,
                        primaryColor: true,
                        secondaryColor: true,
                        accentColor: true,
                        logoUrl: true,
                        crestUrl: true,
                    },
                },
                university: {
                    select: {
                        id: true,
                        name: true,
                        shortName: true,
                        city: true,
                        state: true,
                    },
                },
            },
        });

        if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
            return reply
                .code(404)
                .send({ error: "Invite is invalid or expired" });
        }

        return {
            email: invite.email,
            organization: invite.organization,
            university: invite.university,
            chapterName: invite.chapterName,
            expiresAt: invite.expiresAt,
        };
    });

    app.post("/auth/workspace-invites/accept", async (request, reply) => {
        const parsed = acceptWorkspaceInviteSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: "Invalid workspace setup request" });
        }

        const tokenHash = hashToken(parsed.data.token);
        const invite = await prisma.workspaceInvite.findUnique({
            where: { tokenHash },
        });

        if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
            return reply
                .code(404)
                .send({ error: "Invite is invalid or expired" });
        }

        if (
            invite.organizationId &&
            invite.organizationId !== parsed.data.organizationId
        ) {
            return reply.code(400).send({
                error: "This invite is locked to a different organization",
            });
        }

        if (
            invite.universityId &&
            invite.universityId !== parsed.data.universityId
        ) {
            return reply.code(400).send({
                error: "This invite is locked to a different university",
            });
        }

        const [organization, university, existingChapter, existingUser] =
            await Promise.all([
                prisma.organization.findFirst({
                    where: { id: parsed.data.organizationId, isActive: true },
                    select: { id: true, name: true, shortName: true },
                }),
                prisma.university.findFirst({
                    where: { id: parsed.data.universityId, isActive: true },
                    select: { id: true, name: true, shortName: true },
                }),
                prisma.chapter.findUnique({
                    where: {
                        organizationId_universityId: {
                            organizationId: parsed.data.organizationId,
                            universityId: parsed.data.universityId,
                        },
                    },
                    select: { id: true },
                }),
                prisma.user.findUnique({
                    where: { email: invite.email },
                    include: { membership: true },
                }),
            ]);

        if (!organization || !university) {
            return reply
                .code(404)
                .send({ error: "Organization or university not found" });
        }

        if (existingChapter) {
            return reply.code(409).send({
                error: "A chapter workspace already exists for this organization at this university",
            });
        }

        if (existingUser?.membership) {
            return reply
                .code(409)
                .send({ error: "This account already belongs to a chapter" });
        }

        if (existingUser) {
            const validPassword = await bcrypt.compare(
                parsed.data.password,
                existingUser.passwordHash,
            );
            if (!validPassword) {
                return reply.code(401).send({
                    error: "An account already exists for this email. Use its current password.",
                });
            }
        }

        const passwordHash = existingUser
            ? null
            : await bcrypt.hash(parsed.data.password, 12);
        const slug = await createUniqueChapterSlug(
            `${organization.shortName ?? organization.name}-${university.shortName ?? university.name}`,
        );

        const result = await prisma.$transaction(async (tx) => {
            const user = existingUser
                ? await tx.user.update({
                      where: { id: existingUser.id },
                      data: {
                          firstName: parsed.data.firstName,
                          lastName: parsed.data.lastName,
                          emailVerified: true,
                      },
                  })
                : await tx.user.create({
                      data: {
                          email: invite.email,
                          firstName: parsed.data.firstName,
                          lastName: parsed.data.lastName,
                          passwordHash: passwordHash!,
                          emailVerified: true,
                      },
                  });

            const chapter = await tx.chapter.create({
                data: {
                    organizationId: organization.id,
                    universityId: university.id,
                    name: parsed.data.chapterName,
                    slug,
                    settings: { create: {} },
                    branding: { create: {} },
                    memberships: {
                        create: {
                            userId: user.id,
                            role: "CHAPTER_ADMIN",
                        },
                    },
                },
            });

            await tx.workspaceInvite.update({
                where: { id: invite.id },
                data: {
                    acceptedAt: new Date(),
                    acceptedUserId: user.id,
                    acceptedChapterId: chapter.id,
                },
            });

            await writeAudit(tx, {
                chapterId: chapter.id,
                actorId: user.id,
                action: "CHAPTER_CREATED",
                targetType: "Chapter",
                targetId: chapter.id,
                metadata: {
                    organizationId: organization.id,
                    universityId: university.id,
                },
            });

            return { user, chapter };
        });

        return reply.code(201).send({
            chapter: result.chapter,
            session: await issueSession(app, result.user.id),
        });
    });

    app.get("/auth/chapter-invites/:token", async (request, reply) => {
        const { token } = request.params as { token: string };
        const invite = await prisma.chapterInvite.findUnique({
            where: { tokenHash: hashToken(token) },
            include: {
                chapter: {
                    include: {
                        organization: {
                            select: {
                                id: true,
                                name: true,
                                shortName: true,
                                primaryColor: true,
                                secondaryColor: true,
                                accentColor: true,
                                logoUrl: true,
                                crestUrl: true,
                            },
                        },
                        university: {
                            select: { id: true, name: true, shortName: true },
                        },
                        branding: {
                            select: {
                                primaryColor: true,
                                secondaryColor: true,
                                accentColor: true,
                                logoUrl: true,
                                crestUrl: true,
                            },
                        },
                    },
                },
            },
        });

        if (!invite) {
            return reply
                .code(404)
                .send({ error: "Invite is invalid or expired" });
        }

        const expired = Boolean(
            invite.expiresAt && invite.expiresAt <= new Date(),
        );
        const exhausted =
            invite.maxUses !== null && invite.useCount >= invite.maxUses;

        if (
            invite.revokedAt ||
            expired ||
            exhausted ||
            (invite.acceptedAt && invite.useCount === 0)
        ) {
            return reply
                .code(404)
                .send({ error: "Invite is invalid or expired" });
        }

        return {
            email: invite.email,
            label: invite.label,
            role: invite.role,
            expiresAt: invite.expiresAt,
            maxUses: invite.maxUses,
            useCount: invite.useCount,
            chapter: {
                id: invite.chapter.id,
                name: invite.chapter.name,
                organization: invite.chapter.organization,
                university: invite.chapter.university,
                branding: invite.chapter.branding,
            },
        };
    });

    app.post("/auth/chapter-invites/accept", async (request, reply) => {
        const parsed = acceptChapterInviteSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: "Invalid invitation request" });
        }

        const invite = await prisma.chapterInvite.findUnique({
            where: { tokenHash: hashToken(parsed.data.token) },
        });

        if (!invite) {
            return reply
                .code(404)
                .send({ error: "Invite is invalid or expired" });
        }

        const expired = Boolean(
            invite.expiresAt && invite.expiresAt <= new Date(),
        );
        const exhausted =
            invite.maxUses !== null && invite.useCount >= invite.maxUses;

        if (
            invite.revokedAt ||
            expired ||
            exhausted ||
            (invite.acceptedAt && invite.useCount === 0)
        ) {
            return reply
                .code(404)
                .send({ error: "Invite is invalid or expired" });
        }

        const email = invite.email ?? parsed.data.email;

        if (!email) {
            return reply
                .code(400)
                .send({ error: "Email is required for this invitation" });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email },
            include: { membership: true },
        });

        if (existingUser?.membership) {
            return reply
                .code(409)
                .send({ error: "This account already belongs to a chapter" });
        }

        if (existingUser) {
            const validPassword = await bcrypt.compare(
                parsed.data.password,
                existingUser.passwordHash,
            );
            if (!validPassword) {
                return reply.code(401).send({
                    error: "An account already exists for this email. Use its current password.",
                });
            }
        }

        const passwordHash = existingUser
            ? null
            : await bcrypt.hash(parsed.data.password, 12);

        const user = await prisma.$transaction(async (tx) => {
            const currentInvite = await tx.chapterInvite.findUnique({
                where: { id: invite.id },
            });

            if (
                !currentInvite ||
                currentInvite.revokedAt ||
                (currentInvite.expiresAt &&
                    currentInvite.expiresAt <= new Date()) ||
                (currentInvite.maxUses !== null &&
                    currentInvite.useCount >= currentInvite.maxUses)
            ) {
                throw new Error("Invite is no longer available");
            }

            const acceptedUser = existingUser
                ? await tx.user.update({
                      where: { id: existingUser.id },
                      data: {
                          firstName: parsed.data.firstName,
                          lastName: parsed.data.lastName,
                          emailVerified: true,
                      },
                  })
                : await tx.user.create({
                      data: {
                          email,
                          firstName: parsed.data.firstName,
                          lastName: parsed.data.lastName,
                          passwordHash: passwordHash!,
                          emailVerified: true,
                      },
                  });

            await tx.chapterMembership.create({
                data: {
                    userId: acceptedUser.id,
                    chapterId: invite.chapterId,
                    role: invite.role,
                },
            });

            await tx.chapterInviteUse.create({
                data: {
                    inviteId: invite.id,
                    userId: acceptedUser.id,
                },
            });

            await tx.chapterInvite.update({
                where: { id: invite.id },
                data: { useCount: { increment: 1 } },
            });

            return acceptedUser;
        });

        return reply
            .code(201)
            .send({ session: await issueSession(app, user.id) });
    });

    app.post(
        "/auth/password-reset/request",
        { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
        async (request, reply) => {
            const parsed = passwordResetRequestSchema.safeParse(request.body);

            if (!parsed.success) {
                return reply.code(202).send({ accepted: true });
            }

            const user = await prisma.user.findUnique({
                where: { email: parsed.data.email },
            });
            let debugResetUrl: string | undefined;

            if (user?.isActive) {
                const token = createOpaqueToken();
                const expiresAt = new Date(
                    Date.now() + env.PASSWORD_RESET_MINUTES * 60 * 1000,
                );

                await prisma.$transaction([
                    prisma.passwordResetToken.updateMany({
                        where: { userId: user.id, usedAt: null },
                        data: { usedAt: new Date() },
                    }),
                    prisma.passwordResetToken.create({
                        data: {
                            userId: user.id,
                            tokenHash: hashToken(token),
                            expiresAt,
                        },
                    }),
                ]);

                if (env.NODE_ENV !== "production") {
                    debugResetUrl = `${env.APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
                }
            }

            return reply.code(202).send({
                accepted: true,
                ...(debugResetUrl ? { debugResetUrl } : {}),
            });
        },
    );

    app.post("/auth/password-reset/confirm", async (request, reply) => {
        const parsed = passwordResetConfirmSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: "Invalid password reset request" });
        }

        const token = await prisma.passwordResetToken.findUnique({
            where: { tokenHash: hashToken(parsed.data.token) },
        });

        if (!token || token.usedAt || token.expiresAt <= new Date()) {
            return reply
                .code(400)
                .send({ error: "Password reset token is invalid or expired" });
        }

        const passwordHash = await bcrypt.hash(parsed.data.password, 12);

        await prisma.$transaction([
            prisma.user.update({
                where: { id: token.userId },
                data: { passwordHash },
            }),
            prisma.passwordResetToken.update({
                where: { id: token.id },
                data: { usedAt: new Date() },
            }),
            prisma.refreshToken.updateMany({
                where: { userId: token.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            }),
        ]);

        return { reset: true };
    });
}

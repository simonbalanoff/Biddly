import { createWorkspaceInviteSchema, organizationSchema, universitySchema } from "@biddly/contracts";
import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { env } from "../lib/env.js";
import { requirePlatformAdmin } from "../lib/permissions.js";
import { slugify } from "../lib/slug.js";
import { createOpaqueToken, hashToken } from "../lib/tokens.js";

export async function platformRoutes(app: FastifyInstance) {
  app.post(
    "/platform/workspace-invites",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const parsed = createWorkspaceInviteSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user) {
        return reply.code(400).send({ error: "Invalid workspace invite" });
      }

      if (parsed.data.organizationId) {
        const organization = await prisma.organization.findFirst({
          where: { id: parsed.data.organizationId, isActive: true },
          select: { id: true }
        });

        if (!organization) {
          return reply.code(404).send({ error: "Organization not found" });
        }
      }

      if (parsed.data.universityId) {
        const university = await prisma.university.findFirst({
          where: { id: parsed.data.universityId, isActive: true },
          select: { id: true }
        });

        if (!university) {
          return reply.code(404).send({ error: "University not found" });
        }
      }

      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

      const invite = await prisma.workspaceInvite.create({
        data: {
          email: parsed.data.email,
          tokenHash: hashToken(token),
          organizationId: parsed.data.organizationId ?? null,
          universityId: parsed.data.universityId ?? null,
          chapterName: parsed.data.chapterName ?? null,
          createdById: user.id,
          expiresAt
        }
      });

      return reply.code(201).send({
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        inviteUrl: `${env.APP_BASE_URL}/setup?token=${encodeURIComponent(token)}`
      });
    }
  );

  app.get(
    "/platform/workspace-invites",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async () => {
      return prisma.workspaceInvite.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          organization: { select: { id: true, name: true, shortName: true } },
          university: { select: { id: true, name: true, shortName: true } }
        }
      });
    }
  );

  app.delete(
    "/platform/workspace-invites/:inviteId",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const { inviteId } = request.params as { inviteId: string };

      const invite = await prisma.workspaceInvite.findUnique({
        where: { id: inviteId },
        select: { id: true, acceptedAt: true }
      });

      if (!invite) {
        return reply.code(404).send({ error: "Workspace invitation not found" });
      }

      if (invite.acceptedAt) {
        return reply.code(409).send({ error: "Accepted workspace invitations are kept as onboarding history" });
      }

      await prisma.workspaceInvite.delete({ where: { id: invite.id } });
      return reply.code(204).send();
    }
  );

  app.post(
    "/platform/organizations",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const parsed = organizationSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid organization" });
      }

      const slug = slugify(parsed.data.name);

      try {
        const organization = await prisma.organization.create({
          data: {
            name: parsed.data.name,
            shortName: parsed.data.shortName ?? null,
            slug,
            primaryColor: parsed.data.primaryColor ?? null,
            secondaryColor: parsed.data.secondaryColor ?? null,
            accentColor: parsed.data.accentColor ?? null,
            logoUrl: parsed.data.logoUrl ?? null,
            crestUrl: parsed.data.crestUrl ?? null
          }
        });
        return reply.code(201).send(organization);
      } catch {
        return reply.code(409).send({ error: "An organization with that name already exists" });
      }
    }
  );

  app.post(
    "/platform/universities",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const parsed = universitySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid university" });
      }

      try {
        const university = await prisma.university.create({
          data: {
            name: parsed.data.name,
            shortName: parsed.data.shortName ?? null,
            city: parsed.data.city ?? null,
            state: parsed.data.state ?? null,
            country: parsed.data.country
          }
        });
        return reply.code(201).send(university);
      } catch {
        return reply.code(409).send({ error: "A university with that name already exists" });
      }
    }
  );

  app.get(
    "/platform/chapters",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (_request, reply) => {
      try {
        const chapters = await prisma.chapter.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            createdAt: true,
            activeRecruitmentCycleId: true,
            organization: {
              select: { id: true, name: true, shortName: true }
            },
            university: {
              select: { id: true, name: true, shortName: true }
            }
          }
        });

        return Promise.all(
          chapters.map(async (chapter) => {
            const [membershipCount, candidateCount, activeRecruitmentCycle] = await Promise.all([
              prisma.chapterMembership.count({ where: { chapterId: chapter.id } }),
              prisma.candidate.count({ where: { chapterId: chapter.id } }),
              chapter.activeRecruitmentCycleId
                ? prisma.recruitmentCycle.findUnique({
                    where: { id: chapter.activeRecruitmentCycleId },
                    select: { id: true, name: true, status: true }
                  })
                : Promise.resolve(null)
            ]);

            return {
              id: chapter.id,
              name: chapter.name,
              slug: chapter.slug,
              isActive: chapter.isActive,
              createdAt: chapter.createdAt,
              organization: chapter.organization,
              university: chapter.university,
              activeRecruitmentCycle,
              _count: {
                memberships: membershipCount,
                candidates: candidateCount
              }
            };
          })
        );
      } catch (error) {
        app.log.error({ error }, "Unable to load platform chapters");
        return reply.code(500).send({ error: "Unable to load chapter workspaces" });
      }
    }
  );

  app.get(
    "/platform/chapters/:chapterId",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const { chapterId } = request.params as { chapterId: string };

      const chapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        include: {
          organization: true,
          university: true,
          branding: true,
          settings: true,
          activeRecruitmentCycle: {
            select: {
              id: true,
              name: true,
              status: true,
              startsAt: true,
              endsAt: true,
              createdAt: true
            }
          },
          memberships: {
            orderBy: [{ role: "desc" }, { createdAt: "asc" }],
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  isActive: true,
                  emailVerified: true,
                  createdAt: true
                }
              }
            }
          },
          recruitmentCycles: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              status: true,
              startsAt: true,
              endsAt: true,
              createdAt: true,
              _count: {
                select: {
                  candidates: true,
                  evaluations: true,
                  comments: true
                }
              }
            }
          },
          subscriptions: {
            orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
            take: 1
          },
          auditLogs: {
            orderBy: { createdAt: "desc" },
            take: 12,
            include: {
              actor: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          invites: {
            select: {
              id: true,
              email: true,
              label: true,
              expiresAt: true,
              maxUses: true,
              useCount: true,
              revokedAt: true,
              createdAt: true
            }
          },
          _count: {
            select: {
              memberships: true,
              recruitmentCycles: true,
              candidates: true,
              evaluations: true,
              comments: true,
              reports: true,
              invites: true
            }
          }
        }
      });

      if (!chapter) {
        return reply.code(404).send({ error: "Chapter workspace not found" });
      }

      const [activeCandidates, archivedCandidates, candidatePhotos, openReports] = await Promise.all([
        prisma.candidate.count({ where: { chapterId, archivedAt: null } }),
        prisma.candidate.count({ where: { chapterId, archivedAt: { not: null } } }),
        prisma.candidate.count({ where: { chapterId, photoKey: { not: null } } }),
        prisma.moderationReport.count({ where: { chapterId, status: "PENDING" } })
      ]);

      const pendingInvites = chapter.invites.filter((invite) => {
        const expired = Boolean(invite.expiresAt && invite.expiresAt <= new Date());
        const exhausted = invite.maxUses !== null && invite.useCount >= invite.maxUses;
        return !invite.revokedAt && !expired && !exhausted;
      }).length;

      const roleCounts = chapter.memberships.reduce(
        (counts, membership) => {
          counts[membership.role] += 1;
          return counts;
        },
        { MEMBER: 0, MODERATOR: 0, CHAPTER_ADMIN: 0 } as Record<"MEMBER" | "MODERATOR" | "CHAPTER_ADMIN", number>
      );

      return {
        id: chapter.id,
        name: chapter.name,
        slug: chapter.slug,
        isActive: chapter.isActive,
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
        organization: chapter.organization,
        university: chapter.university,
        branding: chapter.branding,
        settings: chapter.settings,
        activeRecruitmentCycle: chapter.activeRecruitmentCycle,
        subscription: chapter.subscriptions[0] ?? null,
        counts: {
          members: chapter._count.memberships,
          chapterAdmins: roleCounts.CHAPTER_ADMIN,
          moderators: roleCounts.MODERATOR,
          activeCandidates,
          archivedCandidates,
          evaluations: chapter._count.evaluations,
          comments: chapter._count.comments,
          recruitmentCycles: chapter._count.recruitmentCycles,
          candidatePhotos,
          openReports,
          chapterInvites: chapter._count.invites,
          pendingInvites
        },
        members: chapter.memberships.map((membership) => ({
          id: membership.id,
          role: membership.role,
          createdAt: membership.createdAt,
          user: membership.user
        })),
        recruitmentCycles: chapter.recruitmentCycles,
        recentActivity: chapter.auditLogs,
        lastActivityAt: chapter.auditLogs[0]?.createdAt ?? chapter.updatedAt
      };
    }
  );

  app.patch(
    "/platform/chapters/:chapterId/status",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const { chapterId } = request.params as { chapterId: string };
      const user = request.authUser;
      const body = request.body as { isActive?: unknown };

      if (!user || typeof body?.isActive !== "boolean") {
        return reply.code(400).send({ error: "A valid workspace status is required" });
      }

      const existing = await prisma.chapter.findUnique({
        where: { id: chapterId },
        select: { id: true, isActive: true }
      });

      if (!existing) {
        return reply.code(404).send({ error: "Chapter workspace not found" });
      }

      if (existing.isActive === body.isActive) {
        return { id: existing.id, isActive: existing.isActive };
      }

      const updated = await prisma.$transaction(async (tx) => {
        const chapter = await tx.chapter.update({
          where: { id: chapterId },
          data: { isActive: body.isActive as boolean },
          select: { id: true, isActive: true }
        });

        await tx.auditLog.create({
          data: {
            chapterId,
            actorId: user.id,
            action: "CHAPTER_UPDATED",
            targetType: "Chapter",
            targetId: chapterId,
            metadata: {
              source: "PLATFORM_ADMIN",
              workspaceStatus: body.isActive ? "ACTIVE" : "SUSPENDED"
            }
          }
        });

        return chapter;
      });

      return updated;
    }
  );

}

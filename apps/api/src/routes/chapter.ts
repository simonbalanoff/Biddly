import {
  chapterBrandingSchema,
  chapterSettingsSchema,
  createChapterInviteSchema,
  paginationQuerySchema,
  updateChapterSchema,
  updateMemberRoleSchema
} from "@biddly/contracts";
import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { env } from "../lib/env.js";
import { sendEmail } from "../lib/email.js";
import { requireChapterRole } from "../lib/permissions.js";
import { createOpaqueToken, hashToken } from "../lib/tokens.js";

function serializeChapter<T extends { storageQuotaBytes: bigint | null }>(chapter: T) {
  return {
    ...chapter,
    storageQuotaBytes: chapter.storageQuotaBytes === null ? null : chapter.storageQuotaBytes.toString()
  };
}

export async function chapterRoutes(app: FastifyInstance) {
  app.get("/chapter", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const user = request.authUser;

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: user.chapterId },
      include: {
        organization: true,
        university: true,
        branding: true,
        settings: true,
        activeRecruitmentCycle: true
      }
    });

    if (!chapter) {
      return reply.code(404).send({ error: "Chapter not found" });
    }

    return serializeChapter(chapter);
  });

  app.patch(
    "/chapter",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = updateChapterSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid chapter update" });
      }

      const chapter = await prisma.$transaction(async (tx) => {
        const updated = await tx.chapter.update({
          where: { id: user.chapterId! },
          data: parsed.data
        });

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CHAPTER_UPDATED",
          targetType: "Chapter",
          targetId: user.chapterId!,
          metadata: parsed.data
        });

        return updated;
      });

      return serializeChapter(chapter);
    }
  );

  app.patch(
    "/chapter/branding",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = chapterBrandingSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid branding" });
      }

      const branding = await prisma.$transaction(async (tx) => {
        const saved = await tx.chapterBranding.upsert({
          where: { chapterId: user.chapterId! },
          create: { chapterId: user.chapterId!, ...parsed.data },
          update: parsed.data
        });

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "BRANDING_UPDATED",
          targetType: "ChapterBranding",
          targetId: saved.id
        });

        return saved;
      });

      return branding;
    }
  );

  app.patch(
    "/chapter/settings",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = chapterSettingsSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid chapter settings" });
      }

      const settings = await prisma.$transaction(async (tx) => {
        const saved = await tx.chapterSettings.upsert({
          where: { chapterId: user.chapterId! },
          create: { chapterId: user.chapterId!, ...parsed.data },
          update: parsed.data
        });

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "SETTINGS_UPDATED",
          targetType: "ChapterSettings",
          targetId: saved.id,
          metadata: parsed.data
        });

        return saved;
      });

      return settings;
    }
  );

  app.get(
    "/chapter/members",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      return prisma.chapterMembership.findMany({
        where: { chapterId: user.chapterId },
        orderBy: [{ role: "desc" }, { user: { lastName: "asc" } }],
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              isActive: true,
              createdAt: true
            }
          }
        }
      });
    }
  );

  app.patch(
    "/chapter/members/:membershipId/role",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = updateMemberRoleSchema.safeParse(request.body);
      const user = request.authUser;
      const { membershipId } = request.params as { membershipId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid member role" });
      }

      const membership = await prisma.chapterMembership.findFirst({
        where: { id: membershipId, chapterId: user.chapterId },
        include: { user: { select: { id: true, email: true } } }
      });

      if (!membership) {
        return reply.code(404).send({ error: "Member not found" });
      }

      if (membership.role === "CHAPTER_ADMIN" && parsed.data.role !== "CHAPTER_ADMIN") {
        const adminCount = await prisma.chapterMembership.count({
          where: { chapterId: user.chapterId, role: "CHAPTER_ADMIN" }
        });

        if (adminCount <= 1) {
          return reply.code(409).send({ error: "A chapter must always have at least one administrator" });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.chapterMembership.update({
          where: { id: membership.id },
          data: { role: parsed.data.role }
        });

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "MEMBER_ROLE_CHANGED",
          targetType: "ChapterMembership",
          targetId: membership.id,
          metadata: {
            memberUserId: membership.userId,
            fromRole: membership.role,
            toRole: parsed.data.role
          }
        });

        return saved;
      });

      return updated;
    }
  );

  app.delete(
    "/chapter/members/:membershipId",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { membershipId } = request.params as { membershipId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const membership = await prisma.chapterMembership.findFirst({
        where: { id: membershipId, chapterId: user.chapterId }
      });

      if (!membership) {
        return reply.code(404).send({ error: "Member not found" });
      }

      if (membership.userId === user.id) {
        return reply.code(409).send({ error: "You cannot remove your own chapter membership" });
      }

      if (membership.role === "CHAPTER_ADMIN") {
        const adminCount = await prisma.chapterMembership.count({
          where: { chapterId: user.chapterId, role: "CHAPTER_ADMIN" }
        });

        if (adminCount <= 1) {
          return reply.code(409).send({ error: "A chapter must always have at least one administrator" });
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.chapterMembership.delete({ where: { id: membership.id } });
        await tx.refreshToken.updateMany({
          where: { userId: membership.userId, revokedAt: null },
          data: { revokedAt: new Date() }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "MEMBER_REMOVED",
          targetType: "User",
          targetId: membership.userId,
          metadata: { previousRole: membership.role }
        });
      });

      return reply.code(204).send();
    }
  );

  app.post(
    "/chapter/invites",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = createChapterInviteSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid chapter invitation" });
      }

      if (parsed.data.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { membership: true }
        });

        if (existingUser?.membership) {
          return reply.code(409).send({ error: "This user already belongs to a chapter" });
        }
      }

      const token = createOpaqueToken();
      const expiresAt = parsed.data.expiresInDays === null
        ? null
        : new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
      const maxUses = parsed.data.email ? 1 : parsed.data.maxUses;

      const invite = await prisma.$transaction(async (tx) => {
        const created = await tx.chapterInvite.create({
          data: {
            chapterId: user.chapterId!,
            email: parsed.data.email ?? null,
            label: parsed.data.label ?? null,
            role: parsed.data.role,
            tokenHash: hashToken(token),
            code: token,
            createdById: user.id,
            expiresAt,
            maxUses
          }
        });

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "MEMBER_INVITED",
          targetType: "ChapterInvite",
          targetId: created.id,
          metadata: {
            email: created.email,
            role: created.role,
            label: created.label,
            maxUses: created.maxUses,
            expiresAt: created.expiresAt
          }
        });

        return created;
      });

      const inviteUrl = `${env.APP_BASE_URL}/join?token=${encodeURIComponent(token)}`;
      const chapter = invite.email
        ? await prisma.chapter.findUnique({ where: { id: user.chapterId }, select: { name: true, university: { select: { name: true } } } })
        : null;
      const delivery = invite.email && chapter
        ? await sendEmail({
            to: invite.email,
            subject: `You're invited to ${chapter.name} on Biddly`,
            title: `Join ${chapter.name}`,
            copy: `You've been invited to the ${chapter.name} recruitment workspace at ${chapter.university.name}.`,
            actionLabel: "Accept invitation",
            actionUrl: inviteUrl
          })
        : { configured: false, sent: false, id: null, error: null };

      return reply.code(201).send({
        id: invite.id,
        email: invite.email,
        label: invite.label,
        role: invite.role,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        useCount: invite.useCount,
        revokedAt: invite.revokedAt,
        inviteUrl,
        delivery
      });
    }
  );

  app.get(
    "/chapter/invites",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const invites = await prisma.chapterInvite.findMany({
        where: { chapterId: user.chapterId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          email: true,
          label: true,
          role: true,
          expiresAt: true,
          maxUses: true,
          useCount: true,
          revokedAt: true,
          acceptedAt: true,
          createdAt: true,
          code: true
        }
      });

      return invites.map((invite) => ({
        ...invite,
        inviteUrl: invite.code ? `${env.APP_BASE_URL}/join?token=${encodeURIComponent(invite.code)}` : null
      }));
    }
  );

  app.delete(
    "/chapter/invites/:inviteId",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { inviteId } = request.params as { inviteId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const invite = await prisma.chapterInvite.findFirst({
        where: { id: inviteId, chapterId: user.chapterId }
      });

      if (!invite) {
        return reply.code(404).send({ error: "Invite not found" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.chapterInvite.update({
          where: { id: invite.id },
          data: { revokedAt: new Date() }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "INVITE_REVOKED",
          targetType: "ChapterInvite",
          targetId: invite.id,
          metadata: { email: invite.email, label: invite.label }
        });
      });

      return reply.code(204).send();
    }
  );

  app.get(
    "/chapter/audit-logs",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = paginationQuerySchema.safeParse(request.query);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid audit log request" });
      }

      const skip = (parsed.data.page - 1) * parsed.data.pageSize;
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { chapterId: user.chapterId },
          orderBy: { createdAt: "desc" },
          skip,
          take: parsed.data.pageSize,
          include: {
            actor: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        }),
        prisma.auditLog.count({ where: { chapterId: user.chapterId } })
      ]);

      return {
        items,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total,
        totalPages: Math.ceil(total / parsed.data.pageSize)
      };
    }
  );

  app.get(
    "/chapter/subscription",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      return prisma.chapterSubscription.findFirst({
        where: { chapterId: user.chapterId },
        orderBy: { periodEnd: "desc" }
      });
    }
  );
}

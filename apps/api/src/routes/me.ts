import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { chapterAccessReason } from "../lib/access.js";
import { subscriptionAccessMode, subscriptionIsActive } from "../lib/subscription-access.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/me/context", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;

    if (!authUser) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        membership: {
          include: {
            chapter: {
              include: {
                organization: true,
                university: true,
                branding: true,
                settings: true,
                activeRecruitmentCycle: true,
                subscriptions: {
                  where: { provider: "stripe" },
                  orderBy: [{ lastSyncedAt: "desc" }, { periodEnd: "desc" }],
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const membership = user.membership;
    const chapter = membership?.chapter;
    const accessReason = chapter
      ? chapterAccessReason({
          chapterActive: chapter.isActive,
          organizationActive: chapter.organization.isActive,
          universityActive: chapter.university.isActive
        })
      : null;
    const chapterAccess = chapter ? { active: accessReason === null, reason: accessReason } : null;
    const currentSubscription = chapter?.subscriptions[0] ?? null;
    const subscriptionActive = subscriptionIsActive(currentSubscription);
    const subscriptionAccess = chapter
      ? {
          active: subscriptionActive,
          mode: subscriptionAccessMode({
            active: subscriptionActive,
            chapterRole: membership?.role ?? null,
            platformRole: user.platformRole
          }),
          status: currentSubscription?.status ?? "NONE",
          periodEnd: currentSubscription?.periodEnd ?? null,
          cancelAtPeriodEnd: currentSubscription?.cancelAtPeriodEnd ?? false
        }
      : null;

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        platformRole: user.platformRole
      },
      membership: membership
        ? {
            id: membership.id,
            role: membership.role
          }
        : null,
      chapter: chapter
        ? {
            id: chapter.id,
            name: chapter.name,
            slug: chapter.slug,
            isActive: chapter.isActive,
            organization: chapter.organization,
            university: chapter.university,
            branding: chapter.branding,
            settings: chapter.settings,
            activeRecruitmentCycle: chapter.activeRecruitmentCycle,
            subscription: currentSubscription
          }
        : null,
      chapterAccess,
      subscriptionAccess
    };
  });

  app.delete(
    "/me/account",
    { preHandler: [app.requireAuth], config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const authUser = request.authUser;
      const body = request.body as { confirm?: unknown };
      if (!authUser || body?.confirm !== "DELETE") return reply.code(400).send({ error: "Account deletion confirmation is required" });
      if (authUser.platformRole === "PLATFORM_ADMIN") return reply.code(409).send({ error: "Platform administrator accounts must be transferred before deletion" });

      const user = await prisma.user.findUnique({ where: { id: authUser.id }, include: { membership: true } });
      if (!user) return reply.code(404).send({ error: "User not found" });

      if (user.membership?.role === "CHAPTER_ADMIN") {
        const otherAdmins = await prisma.chapterMembership.count({
          where: { chapterId: user.membership.chapterId, role: "CHAPTER_ADMIN", user: { isActive: true }, userId: { not: user.id } }
        });
        if (otherAdmins === 0) return reply.code(409).send({ error: "Transfer chapter administrator access before deleting this account" });
      }

      await prisma.$transaction(async (tx) => {
        if (user.membership) await tx.chapterMembership.delete({ where: { id: user.membership.id } });
        await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.user.update({
          where: { id: user.id },
          data: {
            email: `deleted+${user.id}@deleted.biddly.local`,
            firstName: "Deleted",
            lastName: "User",
            emailVerified: false,
            isActive: false
          }
        });
      });

      return reply.code(204).send();
    }
  );
}

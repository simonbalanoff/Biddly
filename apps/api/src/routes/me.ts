import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";

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
                  where: { status: { in: ["TRIAL", "ACTIVE"] } },
                  orderBy: { periodEnd: "desc" },
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
            organization: chapter.organization,
            university: chapter.university,
            branding: chapter.branding,
            settings: chapter.settings,
            activeRecruitmentCycle: chapter.activeRecruitmentCycle,
            subscription: chapter.subscriptions[0] ?? null
          }
        : null
    };
  });
}

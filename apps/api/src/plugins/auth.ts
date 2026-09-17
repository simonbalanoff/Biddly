import jwt from "@fastify/jwt";
import { prisma } from "@biddly/db";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { chapterAccessMessage, chapterAccessReason, type ChapterAccessReason } from "../lib/access.js";
import { env } from "../lib/env.js";
import { subscriptionAccessMode, type SubscriptionAccessMode } from "../lib/subscription-access.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: {
      id: string;
      email: string;
      platformRole: "USER" | "PLATFORM_ADMIN";
      chapterId: string | null;
      chapterRole: "MEMBER" | "MODERATOR" | "CHAPTER_ADMIN" | null;
      chapterActive: boolean | null;
      chapterAccessActive: boolean | null;
      chapterAccessReason: ChapterAccessReason;
      subscriptionActive: boolean | null;
      subscriptionAccessMode: SubscriptionAccessMode | null;
    } | null;
  }
}

export async function authPlugin(app: FastifyInstance) {
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorateRequest("authUser", null);

  app.decorate("requireAuth", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const payload = await request.jwtVerify<{ sub: string }>();
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          membership: {
            include: {
              chapter: {
                select: {
                  isActive: true,
                  organization: { select: { isActive: true } },
                  university: { select: { isActive: true } },
                  subscriptions: {
                    where: {
                      provider: "stripe",
                      providerSubscriptionId: { not: null },
                      status: { in: ["ACTIVE", "TRIAL"] },
                      periodEnd: { gt: new Date() }
                    },
                    select: { id: true },
                    take: 1
                  }
                }
              }
            }
          }
        }
      });

      if (!user || !user.isActive || !user.emailVerified) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const chapter = user.membership?.chapter;
      const accessReason = chapter
        ? chapterAccessReason({
            chapterActive: chapter.isActive,
            organizationActive: chapter.organization.isActive,
            universityActive: chapter.university.isActive
          })
        : null;
      const chapterAccessActive = chapter ? accessReason === null : null;
      const subscriptionActive = chapter ? chapter.subscriptions.length > 0 : null;
      const accessMode = chapter
        ? subscriptionAccessMode({
            active: Boolean(subscriptionActive),
            chapterRole: user.membership?.role ?? null,
            platformRole: user.platformRole
          })
        : null;

      request.authUser = {
        id: user.id,
        email: user.email,
        platformRole: user.platformRole,
        chapterId: user.membership?.chapterId ?? null,
        chapterRole: user.membership?.role ?? null,
        chapterActive: chapter?.isActive ?? null,
        chapterAccessActive,
        chapterAccessReason: accessReason,
        subscriptionActive,
        subscriptionAccessMode: accessMode
      };

      const path = request.url.split("?", 1)[0] ?? "";
      const contextRequest = path.endsWith("/me/context");
      const accountRequest = path.endsWith("/me/account");
      const billingWebhook = path.endsWith("/billing/stripe/webhook");
      const chapterBillingRequest = path.includes("/chapter/billing");
      const platformRequest = user.platformRole === "PLATFORM_ADMIN" && (path === "/platform" || path.includes("/platform/"));

      if (user.membership && chapterAccessActive === false && !contextRequest && !platformRequest && !billingWebhook) {
        return reply.code(403).send({ error: chapterAccessMessage(accessReason), code: accessReason });
      }

      if (
        user.membership &&
        user.platformRole !== "PLATFORM_ADMIN" &&
        chapterAccessActive !== false &&
        accessMode !== "FULL" &&
        !contextRequest &&
        !accountRequest &&
        !chapterBillingRequest &&
        !billingWebhook
      ) {
        if (accessMode === "READ_ONLY" && (request.method === "GET" || request.method === "HEAD")) {
          return;
        }

        if (accessMode === "READ_ONLY") {
          return reply.code(402).send({
            error: "An active Biddly subscription is required to make changes. This workspace is currently read-only.",
            code: "SUBSCRIPTION_READ_ONLY"
          });
        }

        return reply.code(402).send({
          error: "An active Biddly subscription is required to access this workspace.",
          code: "SUBSCRIPTION_REQUIRED"
        });
      }
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}

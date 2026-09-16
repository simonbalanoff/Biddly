import jwt from "@fastify/jwt";
import { prisma } from "@biddly/db";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../lib/env.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: {
      id: string;
      email: string;
      platformRole: "USER" | "PLATFORM_ADMIN";
      chapterId: string | null;
      chapterRole: "MEMBER" | "MODERATOR" | "CHAPTER_ADMIN" | null;
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
        include: { membership: true }
      });

      if (!user || !user.isActive || !user.emailVerified) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      request.authUser = {
        id: user.id,
        email: user.email,
        platformRole: user.platformRole,
        chapterId: user.membership?.chapterId ?? null,
        chapterRole: user.membership?.role ?? null
      };
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}

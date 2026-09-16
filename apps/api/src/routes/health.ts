import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ok" };
    } catch {
      return reply.code(503).send({ status: "degraded", database: "unavailable" });
    }
  });
}

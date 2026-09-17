import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { stripeConfigured } from "../lib/billing.js";
import { emailConfigured } from "../lib/email.js";
import { storageConfigured } from "../lib/storage.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        database: "ok",
        optionalServices: {
          storage: storageConfigured(),
          email: emailConfigured(),
          stripe: stripeConfigured()
        }
      };
    } catch {
      return reply.code(503).send({ status: "degraded", database: "unavailable" });
    }
  });
}

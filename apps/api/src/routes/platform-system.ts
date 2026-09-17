import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { stripeConfigured } from "../lib/billing.js";
import { emailConfigured } from "../lib/email.js";
import { env } from "../lib/env.js";
import { monitoringSnapshot } from "../lib/monitoring.js";
import { requirePlatformAdmin } from "../lib/permissions.js";
import { storageConfigured } from "../lib/storage.js";

export async function platformSystemRoutes(app: FastifyInstance) {
  app.get(
    "/platform/system",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (_request, reply) => {
      let database = "ok";
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = "unavailable";
      }
      const memory = process.memoryUsage();
      return reply.code(database === "ok" ? 200 : 503).send({
        status: database === "ok" ? "ok" : "degraded",
        environment: env.NODE_ENV,
        database,
        services: {
          storage: storageConfigured(),
          email: emailConfigured(),
          stripe: stripeConfigured(),
          errorReporting: Boolean(env.ERROR_REPORT_WEBHOOK_URL)
        },
        process: {
          node: process.version,
          uptimeSeconds: Math.floor(process.uptime()),
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed
        },
        traffic: monitoringSnapshot()
      });
    }
  );
}

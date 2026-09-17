import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./lib/env.js";
import { recordRequest, reportError } from "./lib/monitoring.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { candidateRoutes } from "./routes/candidates.js";
import { catalogRoutes } from "./routes/catalog.js";
import { chapterRoutes } from "./routes/chapter.js";
import { dataRoutes } from "./routes/data.js";
import { discussionRoutes } from "./routes/discussion.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { platformRoutes } from "./routes/platform.js";
import { platformBillingRoutes } from "./routes/platform-billing.js";
import { platformStorageRoutes } from "./routes/platform-storage.js";
import { platformSystemRoutes } from "./routes/platform-system.js";
import { publicFormRoutes } from "./routes/public-forms.js";
import { recruitmentCycleRoutes } from "./routes/recruitment-cycles.js";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: import("fastify").preHandlerHookHandler;
  }
}

const requestStartedAt = new WeakMap<object, number>();

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.APP_ORIGIN,
    credentials: true
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute"
  });
  await authPlugin(app);

  app.addHook("onRequest", async (request, reply) => {
    requestStartedAt.set(request, performance.now());
    reply.header("X-Request-Id", request.id);
  });

  app.addHook("onResponse", async (request, reply) => {
    const started = requestStartedAt.get(request) ?? performance.now();
    recordRequest(reply.statusCode, performance.now() - started);
    requestStartedAt.delete(request);
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: "Route not found" });
  });

  app.setErrorHandler(async (error: any, request, reply) => {
    request.log.error(error);

    if (reply.sent) return;

    const statusCode = typeof error.statusCode === "number" && error.statusCode < 500 ? error.statusCode : 500;
    if (statusCode >= 500) {
      await reportError({
        requestId: request.id,
        method: request.method,
        path: request.url.split("?", 1)[0] ?? request.url,
        statusCode,
        message: error instanceof Error ? error.name : "Error"
      });
    }

    return reply.code(statusCode).send({
      error: statusCode === 500 ? "Internal server error" : error.message,
      requestId: request.id
    });
  });

  await healthRoutes(app);

  await app.register(
    async (v1) => {
      await catalogRoutes(v1);
      await authRoutes(v1);
      await billingRoutes(v1);
      await meRoutes(v1);
      await platformRoutes(v1);
      await platformBillingRoutes(v1);
      await platformStorageRoutes(v1);
      await platformSystemRoutes(v1);
      await chapterRoutes(v1);
      await recruitmentCycleRoutes(v1);
      await candidateRoutes(v1);
      await discussionRoutes(v1);
      await dataRoutes(v1);
      await publicFormRoutes(v1);
    },
    { prefix: "/v1" }
  );

  return app;
}

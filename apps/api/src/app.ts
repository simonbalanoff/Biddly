import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./lib/env.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { candidateRoutes } from "./routes/candidates.js";
import { catalogRoutes } from "./routes/catalog.js";
import { chapterRoutes } from "./routes/chapter.js";
import { dataRoutes } from "./routes/data.js";
import { discussionRoutes } from "./routes/discussion.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { platformRoutes } from "./routes/platform.js";
import { publicFormRoutes } from "./routes/public-forms.js";
import { recruitmentCycleRoutes } from "./routes/recruitment-cycles.js";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: import("fastify").preHandlerHookHandler;
  }
}

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

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: "Route not found" });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (reply.sent) {
      return;
    }

    const statusCode = typeof error.statusCode === "number" && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "Internal server error" : error.message
    });
  });

  await healthRoutes(app);

  await app.register(
    async (v1) => {
      await catalogRoutes(v1);
      await authRoutes(v1);
      await meRoutes(v1);
      await platformRoutes(v1);
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

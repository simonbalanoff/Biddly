import { prisma } from "@biddly/db";
import { buildApp } from "./app.js";
import { env } from "./lib/env.js";

const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({
  port: env.PORT,
  host: "0.0.0.0"
});

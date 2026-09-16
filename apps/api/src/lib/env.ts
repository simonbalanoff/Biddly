import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(currentDirectory, "../../../../.env"), override: false });

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  INVITE_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  PASSWORD_RESET_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  R2_ACCOUNT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_BUCKET_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
  R2_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional())
});

export const env = envSchema.parse(process.env);

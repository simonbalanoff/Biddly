import { z } from "zod";
import { emailSchema, hexColorSchema } from "./common.js";

export const createWorkspaceInviteSchema = z.object({
  email: emailSchema,
  organizationId: z.string().min(1).nullable().optional(),
  universityId: z.string().min(1).nullable().optional(),
  chapterName: z.string().trim().min(1).max(120).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(90).default(7)
});

export const organizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  shortName: z.string().trim().min(1).max(60).nullable().optional(),
  primaryColor: hexColorSchema.nullable().optional(),
  secondaryColor: hexColorSchema.nullable().optional(),
  accentColor: hexColorSchema.nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  crestUrl: z.string().url().nullable().optional()
});

export const universitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  shortName: z.string().trim().min(1).max(60).nullable().optional(),
  city: z.string().trim().min(1).max(100).nullable().optional(),
  state: z.string().trim().min(1).max(80).nullable().optional(),
  country: z.string().trim().min(2).max(80).default("US")
});

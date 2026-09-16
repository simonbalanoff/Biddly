import { z } from "zod";
import { emailSchema, hexColorSchema } from "./common.js";

export const chapterSettingsSchema = z
  .object({
    commentsEnabled: z.boolean(),
    repliesEnabled: z.boolean(),
    reactionsEnabled: z.boolean(),
    scoreMin: z.number().finite().min(0).max(100),
    scoreMax: z.number().finite().min(1).max(100),
    scoreStep: z.number().finite().positive().max(100)
  })
  .refine((value) => value.scoreMax > value.scoreMin, {
    message: "scoreMax must be greater than scoreMin"
  })
  .refine((value) => value.commentsEnabled || (!value.repliesEnabled && !value.reactionsEnabled), {
    message: "Replies and reactions require comments"
  });

export const updateChapterSchema = z.object({
  name: z.string().trim().min(1).max(120).optional()
});

export const chapterBrandingSchema = z.object({
  primaryColor: hexColorSchema.nullable().optional(),
  secondaryColor: hexColorSchema.nullable().optional(),
  accentColor: hexColorSchema.nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  crestUrl: z.string().url().nullable().optional()
});

export const createChapterInviteSchema = z.object({
  label: z.string().trim().min(1).max(80).nullable().optional(),
  email: z.preprocess((value) => value === "" ? undefined : value, emailSchema.optional()),
  role: z.enum(["MEMBER", "MODERATOR", "CHAPTER_ADMIN"]).default("MEMBER"),
  maxUses: z.number().int().min(1).max(10000).nullable().default(null),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(7)
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["MEMBER", "MODERATOR", "CHAPTER_ADMIN"])
});

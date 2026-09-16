import { z } from "zod";
import { emailSchema, passwordSchema } from "./common.js";

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(40).max(512)
});

export const acceptWorkspaceInviteSchema = z.object({
  token: z.string().min(40).max(512),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: passwordSchema,
  organizationId: z.string().min(1),
  universityId: z.string().min(1),
  chapterName: z.string().trim().min(1).max(120)
});

export const acceptChapterInviteSchema = z.object({
  token: z.string().min(40).max(512),
  email: emailSchema.optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: passwordSchema
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(40).max(512),
  password: passwordSchema
});

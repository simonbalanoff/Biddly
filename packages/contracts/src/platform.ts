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

export const platformChapterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  organizationId: z.string().min(1).optional(),
  universityId: z.string().min(1).optional(),
  supportNotes: z.string().trim().max(5000).nullable().optional(),
  storageQuotaBytes: z.union([z.string().regex(/^\d+$/), z.null()]).optional()
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const platformMemberUpdateSchema = z.object({
  role: z.enum(["MEMBER", "MODERATOR", "CHAPTER_ADMIN"]).optional(),
  isActive: z.boolean().optional()
}).refine((value) => value.role !== undefined || value.isActive !== undefined, { message: "At least one field is required" });

export const platformSubscriptionSchema = z.object({
  term: z.enum(["SEMESTER", "ACADEMIC_YEAR"]),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"]),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  provider: z.string().trim().max(80).nullable().optional()
}).refine((value) => value.periodEnd > value.periodStart, { message: "periodEnd must be after periodStart" });

export const catalogStatusSchema = z.object({
  isActive: z.boolean()
});

export const storageDeleteSchema = z.object({
  keys: z.array(z.string().min(1).max(1024)).min(1).max(100),
  confirm: z.literal("DELETE")
});

export const storageCleanupSchema = z.object({
  workspaceId: z.string().min(1).nullable().optional(),
  olderThanDays: z.number().int().min(0).max(3650).default(7),
  confirm: z.literal("DELETE ORPHANS")
});

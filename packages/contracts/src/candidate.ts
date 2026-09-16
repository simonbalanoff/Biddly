import { z } from "zod";

export const createCandidateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(3).max(32).nullable().optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).default({})
});

export const updateCandidateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(3).max(32).nullable().optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional()
});

export const createEvaluationSchema = z.object({
  score: z.number().finite()
});

export const changeCandidateStatusSchema = z.object({
  statusId: z.string().min(1)
});

export const candidateListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cycleId: z.string().min(1).optional(),
  statusId: z.string().min(1).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  sort: z.enum(["recent", "name", "score_desc", "score_asc", "status"]).default("status"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export const candidatePhotoRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteLength: z.number().int().positive().max(2_000_000)
});

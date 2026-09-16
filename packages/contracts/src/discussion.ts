import { z } from "zod";

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentId: z.string().min(1).nullable().optional()
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(24)
});

export const moderateCommentSchema = z.object({
  action: z.enum(["HIDE", "RESTORE", "REMOVE"]),
  reason: z.string().trim().max(500).nullable().optional()
});

export const reportCommentSchema = z.object({
  reason: z.enum(["INAPPROPRIATE", "PERSONAL_ATTACK", "SENSITIVE_INFORMATION", "SPAM", "OTHER"]),
  details: z.string().trim().max(1000).nullable().optional()
});

export const resolveReportSchema = z.object({
  resolution: z.enum(["DISMISS", "ACTION"]),
  action: z.enum(["HIDE", "REMOVE"]).optional(),
  note: z.string().trim().max(1000).nullable().optional()
});

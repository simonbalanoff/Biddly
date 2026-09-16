import { z } from "zod";

const publicFieldModeSchema = z.enum(["HIDDEN", "OPTIONAL", "REQUIRED"]);

export const publicFormSettingsSchema = z.object({
  isOpen: z.boolean(),
  title: z.string().trim().max(120).nullable().optional(),
  introText: z.string().trim().max(3000).nullable().optional(),
  confirmationMessage: z.string().trim().max(1000).nullable().optional(),
  emailMode: publicFieldModeSchema,
  phoneMode: publicFieldModeSchema,
  photoMode: publicFieldModeSchema
});

export const publicFormSubmissionSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(3).max(32).nullable().optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  photo: z
    .object({
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      byteLength: z.number().int().positive().max(2_000_000)
    })
    .nullable()
    .optional()
});

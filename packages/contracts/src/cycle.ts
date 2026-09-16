import { z } from "zod";

const recruitmentCycleBaseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional()
});

export const createRecruitmentCycleSchema = recruitmentCycleBaseSchema.refine(
  (value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
  { message: "endsAt must be after startsAt" }
);

export const updateRecruitmentCycleSchema = recruitmentCycleBaseSchema.partial().refine(
  (value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
  { message: "endsAt must be after startsAt" }
);

export const candidateStatusSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  isTerminal: z.boolean().default(false)
});

export const reorderStatusesSchema = z.object({
  statusIds: z.array(z.string().min(1)).min(1).max(50)
});

const candidateFieldBaseSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,49}$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum([
    "SHORT_TEXT",
    "LONG_TEXT",
    "NUMBER",
    "EMAIL",
    "PHONE",
    "DATE",
    "YEAR",
    "SELECT",
    "MULTI_SELECT",
    "BOOLEAN"
  ]),
  required: z.boolean().default(false),
  visibleOnPublicForm: z.boolean().default(false),
  options: z
    .object({
      choices: z.array(z.string().trim().min(1).max(120)).min(1).max(100)
    })
    .nullable()
    .optional(),
  validation: z.record(z.string(), z.unknown()).nullable().optional()
});

export const candidateFieldSchema = candidateFieldBaseSchema.refine(
  (value) =>
    !["SELECT", "MULTI_SELECT"].includes(value.type) ||
    Boolean(value.options && value.options.choices.length > 0),
  { message: "Select fields require options" }
);

export const updateCandidateFieldSchema = candidateFieldBaseSchema.omit({ key: true }).partial();

export const reorderFieldsSchema = z.object({
  fieldIds: z.array(z.string().min(1)).max(100)
});

import { z } from "zod";

export const importCandidatesSchema = z.object({
  csv: z.string().min(1).max(10_000_000),
  mapping: z.record(z.string(), z.string().min(1)).default({})
});

export const exportCandidatesQuerySchema = z.object({
  statusId: z.string().min(1).optional(),
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

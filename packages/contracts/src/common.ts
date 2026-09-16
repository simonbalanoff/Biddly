import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10).max(128);
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const cuidSchema = z.string().min(10).max(64);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

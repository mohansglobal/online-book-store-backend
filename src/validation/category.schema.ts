import { z } from "zod";

export const categoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type CategoryQueryInput = z.infer<typeof categoryQuerySchema>;

export const categorySlugParamSchema = z.object({
  slug: z.string().trim().min(1, "Category slug is required"),
});

export type CategorySlugParamInput = z.infer<typeof categorySlugParamSchema>;

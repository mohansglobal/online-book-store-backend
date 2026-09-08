import { z } from "zod";

export const authorQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  sortBy: z.enum(["name", "birthDate", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type AuthorQueryInput = z.infer<typeof authorQuerySchema>;

export const authorSlugParamSchema = z.object({
  slug: z.string().trim().min(1, "Author slug is required"),
});

export type AuthorSlugParamInput = z.infer<typeof authorSlugParamSchema>;

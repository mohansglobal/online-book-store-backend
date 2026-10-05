import { z } from "zod";

export const categoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().nonnegative().optional(),
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  hasBooks: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .optional(),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type CategoryQueryInput = z.infer<typeof categoryQuerySchema>;

export const categorySlugParamSchema = z.object({
  slug: z.string().trim().min(1, "Category slug is required"),
});

export type CategorySlugParamInput = z.infer<typeof categorySlugParamSchema>;

export const categoryIdParamSchema = z.object({
  id: z.string().trim().min(1, "Category ID is required"),
});

export type CategoryIdParamInput = z.infer<typeof categoryIdParamSchema>;

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name cannot exceed 100 characters"),
  nameBn: z.string().trim().max(100, "Bengali name cannot exceed 100 characters").optional().nullable(),
  slug: z
    .string()
    .trim()
    .max(120, "Slug cannot exceed 120 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").optional().nullable(),
  image: z.string().trim().optional().nullable(),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .optional()
    .default(true),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name cannot be empty")
    .max(100, "Category name cannot exceed 100 characters")
    .optional(),
  nameBn: z.string().trim().max(100, "Bengali name cannot exceed 100 characters").optional().nullable(),
  slug: z
    .string()
    .trim()
    .min(1, "Slug cannot be empty")
    .max(120, "Slug cannot exceed 120 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").optional().nullable(),
  image: z.string().trim().optional().nullable(),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;


import { z } from "zod";

export const authorQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().nonnegative().optional(),
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  sortBy: z.enum(["name", "birthDate", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type AuthorQueryInput = z.infer<typeof authorQuerySchema>;

export const authorSlugParamSchema = z.object({
  slug: z.string().trim().min(1, "Author slug is required"),
});

export type AuthorSlugParamInput = z.infer<typeof authorSlugParamSchema>;

export const authorParamSchema = z.object({
  idOrSlug: z.string().trim().min(1, "Author ID or slug is required"),
});

export type AuthorParamInput = z.infer<typeof authorParamSchema>;

export const authorIdParamSchema = z.object({
  id: z.string().trim().min(1, "Author ID is required"),
});

export type AuthorIdParamInput = z.infer<typeof authorIdParamSchema>;

export const createAuthorSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(150, "Name cannot exceed 150 characters"),
    nameBn: z.string().trim().max(150, "Bengali name cannot exceed 150 characters").optional(),
    bio: z.string().trim().max(5000, "Bio cannot exceed 5000 characters").optional(),
    photo: z.string().trim().optional(),
    birthDate: z.coerce.date().optional(),
    deathDate: z.coerce.date().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (data) => {
      if (data.birthDate && data.deathDate) {
        return data.birthDate <= data.deathDate;
      }
      return true;
    },
    {
      message: "Birth date must be on or before death date",
      path: ["deathDate"],
    },
  )
  .refine(
    (data) => {
      if (data.birthDate) {
        return data.birthDate.getTime() <= Date.now();
      }
      return true;
    },
    {
      message: "Birth date cannot be in the future",
      path: ["birthDate"],
    },
  );

export type CreateAuthorInput = z.infer<typeof createAuthorSchema>;

export const updateAuthorSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(150, "Name cannot exceed 150 characters")
      .optional(),
    nameBn: z.string().trim().max(150, "Bengali name cannot exceed 150 characters").optional(),
    bio: z.string().trim().max(5000, "Bio cannot exceed 5000 characters").optional(),
    photo: z.string().trim().optional(),
    birthDate: z.coerce.date().optional(),
    deathDate: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.birthDate && data.deathDate) {
        return data.birthDate <= data.deathDate;
      }
      return true;
    },
    {
      message: "Birth date must be on or before death date",
      path: ["deathDate"],
    },
  )
  .refine(
    (data) => {
      if (data.birthDate) {
        return data.birthDate.getTime() <= Date.now();
      }
      return true;
    },
    {
      message: "Birth date cannot be in the future",
      path: ["birthDate"],
    },
  );

export type UpdateAuthorInput = z.infer<typeof updateAuthorSchema>;



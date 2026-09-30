import { z } from "zod";

export const authorQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().nonnegative().optional(),
    search: z.string().trim().optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .optional(),
    sortBy: z.enum(["name", "birthDate", "createdAt"]).optional(),
    sortOrder: z.string().trim().optional(),
    order: z.string().trim().optional(),
    sort: z.string().trim().optional(),
    asce: z.union([z.string(), z.boolean()]).optional(),
    homepage: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((val) => val === true || val === "true")
      .optional(),
    shuffle: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((val) => val === true || val === "true")
      .optional(),
  })
  .transform((data) => {
    let sortBy: "name" | "birthDate" | "createdAt" = "createdAt";

    if (data.sortBy) {
      sortBy = data.sortBy;
    } else if (
      data.sort === "name" ||
      data.sort === "birthDate" ||
      data.sort === "createdAt"
    ) {
      sortBy = data.sort;
    }

    const sortOrderParam = data.sortOrder ?? data.order;
    const sortParam = data.sort;

    let rawOrder = "";
    if (sortOrderParam) {
      rawOrder = sortOrderParam.toLowerCase().trim();
    } else if (
      sortParam &&
      sortParam !== "name" &&
      sortParam !== "birthDate" &&
      sortParam !== "createdAt"
    ) {
      rawOrder = sortParam.toLowerCase().trim();
    }

    const hasAsceFlag =
      data.asce !== undefined &&
      data.asce !== "false" &&
      data.asce !== false;

    const isAscendingRequested =
      rawOrder === "asc" ||
      rawOrder === "asce" ||
      rawOrder === "ascending" ||
      hasAsceFlag;

    const isDescendingRequested =
      rawOrder === "desc" ||
      rawOrder === "desce" ||
      rawOrder === "descending";

    let sortOrder: "asc" | "desc" = "desc";

    if (isAscendingRequested) {
      sortOrder = "asc";
      const hasExplicitSortField =
        Boolean(data.sortBy) ||
        data.sort === "createdAt" ||
        data.sort === "birthDate";

      // If client requested ascending / asce without an explicit field, sort alphabetically by name
      if (!hasExplicitSortField) {
        sortBy = "name";
      }
    } else if (isDescendingRequested) {
      sortOrder = "desc";
    } else if (sortBy === "name") {
      // Sorting by author name defaults to ascending (A-Z)
      sortOrder = "asc";
    }

    return {
      page: data.page,
      limit: data.limit,
      search: data.search,
      isActive: data.isActive,
      sortBy,
      sortOrder,
      homepage: Boolean(data.homepage || data.shuffle),
    };
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



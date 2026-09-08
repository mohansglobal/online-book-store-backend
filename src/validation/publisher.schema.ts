import { z } from "zod";

export const publisherQuerySchema = z.object({
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

export type PublisherQueryInput = z.infer<typeof publisherQuerySchema>;

export const publisherParamSchema = z.object({
  idOrSlug: z.string().trim().min(1, "Publisher ID or slug is required"),
});

export type PublisherParamInput = z.infer<typeof publisherParamSchema>;

export const createPublisherSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(150, "Name cannot exceed 150 characters"),
  nameBn: z.string().trim().max(150).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .optional(),
  phone: z
    .string()
    .trim()
    .min(7, "Phone number must be at least 7 characters")
    .max(20, "Phone number cannot exceed 20 characters")
    .regex(/^[0-9+\s()-]{7,20}$/, "Invalid phone number format")
    .optional(),
  website: z.string().trim().url("Invalid website URL").optional(),
  logo: z.string().trim().optional(),
  description: z.string().trim().max(5000).optional(),
});

export type CreatePublisherInput = z.infer<typeof createPublisherSchema>;

export const updatePublisherSchema = createPublisherSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdatePublisherInput = z.infer<typeof updatePublisherSchema>;

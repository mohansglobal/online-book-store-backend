import { z } from "zod";
import { BOOK_FORMATS, BOOK_STATUSES } from "../models/book.model.js";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const bookQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  category: z.string().trim().regex(objectIdRegex, "Invalid category ID").optional(),
  author: z.string().trim().regex(objectIdRegex, "Invalid author ID").optional(),
  publisher: z.string().trim().regex(objectIdRegex, "Invalid publisher ID").optional(),
  language: z.string().trim().optional(),
  status: z.enum(BOOK_STATUSES).optional(),
  sortBy: z.enum(["title", "createdAt", "publicationDate"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type BookQueryInput = z.infer<typeof bookQuerySchema>;

export const bookParamSchema = z.object({
  idOrSlug: z.string().trim().min(1, "Book ID or slug is required"),
});

export type BookParamInput = z.infer<typeof bookParamSchema>;

export const createBookSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(250, "Title cannot exceed 250 characters"),
  titleBn: z.string().trim().max(250).optional(),
  legacyId: z.string().trim().optional(),
  legacyBookId: z.string().trim().optional(),
  isbn: z
    .string()
    .trim()
    .min(5, "ISBN must be at least 5 characters")
    .max(50, "ISBN cannot exceed 50 characters")
    .optional(),
  description: z.string().trim().min(1, "Description is required"),
  authors: z
    .array(z.string().trim().regex(objectIdRegex, "Invalid author ID format"))
    .min(1, "A book must have at least one author"),
  publisher: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid publisher ID format"),
  categories: z
    .array(z.string().trim().regex(objectIdRegex, "Invalid category ID format"))
    .min(1, "A book must belong to at least one category"),
  language: z.string().trim().optional().default("English"),
  searchTags: z.array(z.string().trim()).optional().default([]),
  format: z.enum(BOOK_FORMATS).optional().default("PAPERBACK"),
  edition: z.string().trim().optional(),
  pages: z.number().int().positive("Pages must be a positive integer").optional(),
  publicationDate: z.coerce.date().optional(),
  coverImage: z.string().trim().min(1, "Cover image is required"),
  images: z.array(z.string().trim()).optional().default([]),
  status: z.enum(BOOK_STATUSES).optional().default("ACTIVE"),
  translation: z
    .object({
      originalTitle: z.string().trim().optional(),
      originalLanguage: z.string().trim().optional(),
      translator: z.string().trim().optional(),
    })
    .optional(),
});

export type CreateBookInput = z.input<typeof createBookSchema>;

export const updateBookSchema = createBookSchema.partial();

export type UpdateBookInput = z.input<typeof updateBookSchema>;

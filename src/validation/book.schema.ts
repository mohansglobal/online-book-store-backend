import { z } from "zod";
import { BOOK_FORMATS, BOOK_STATUSES } from "../models/book.model.js";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const commaSeparatedListSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    const rawItems = Array.isArray(val)
      ? val.flatMap((s) => s.split(","))
      : val.split(",");

    const cleaned = rawItems
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return cleaned.length > 0 ? cleaned : undefined;
  });

export const bookQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    category: commaSeparatedListSchema,
    categories: commaSeparatedListSchema,
    author: commaSeparatedListSchema,
    authors: commaSeparatedListSchema,
    publisher: commaSeparatedListSchema,
    publishers: commaSeparatedListSchema,
    language: z.string().trim().optional(),
    status: z.enum(BOOK_STATUSES).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    priceMin: z.coerce.number().nonnegative().optional(),
    priceMax: z.coerce.number().nonnegative().optional(),
    minPriceIn: z.coerce.number().nonnegative().optional(),
    maxPriceIn: z.coerce.number().nonnegative().optional(),
    priceInMin: z.coerce.number().nonnegative().optional(),
    priceInMax: z.coerce.number().nonnegative().optional(),
    sortBy: z
      .enum([
        "title",
        "createdAt",
        "publicationDate",
        "price",
        "priceIn",
        "price_asc",
        "price_desc",
        "price-asc",
        "price-desc",
        "price_low_to_high",
        "price_high_to_low",
        "price-low-to-high",
        "price-high-to-low",
        "lowToHigh",
        "highToLow",
        "priceIn_asc",
        "priceIn_desc",
        "priceIn-asc",
        "priceIn-desc",
        "priceIn_low_to_high",
        "priceIn_high_to_low",
        "priceIn-low-to-high",
        "priceIn-high-to-low",
        "newest",
        "oldest",
      ])
      .default("createdAt"),
    sortOrder: z
      .enum(["asc", "desc", "lowToHigh", "highToLow", "1", "-1"])
      .default("desc"),
  })
  .transform((data) => {
    const categories = Array.from(
      new Set([...(data.category ?? []), ...(data.categories ?? [])]),
    );
    const authors = Array.from(
      new Set([...(data.author ?? []), ...(data.authors ?? [])]),
    );
    const publishers = Array.from(
      new Set([...(data.publisher ?? []), ...(data.publishers ?? [])]),
    );

    let sortBy:
      | "title"
      | "createdAt"
      | "publicationDate"
      | "price"
      | "priceIn" = "createdAt";

    let sortOrder: "asc" | "desc" =
      data.sortOrder === "lowToHigh" || data.sortOrder === "1"
        ? "asc"
        : data.sortOrder === "highToLow" || data.sortOrder === "-1"
          ? "desc"
          : data.sortOrder;

    const rawSortBy = data.sortBy;
    if (
      rawSortBy === "price_asc" ||
      rawSortBy === "price-asc" ||
      rawSortBy === "price_low_to_high" ||
      rawSortBy === "price-low-to-high" ||
      rawSortBy === "lowToHigh"
    ) {
      sortBy = "price";
      sortOrder = "asc";
    } else if (
      rawSortBy === "price_desc" ||
      rawSortBy === "price-desc" ||
      rawSortBy === "price_high_to_low" ||
      rawSortBy === "price-high-to-low" ||
      rawSortBy === "highToLow"
    ) {
      sortBy = "price";
      sortOrder = "desc";
    } else if (
      rawSortBy === "priceIn_asc" ||
      rawSortBy === "priceIn-asc" ||
      rawSortBy === "priceIn_low_to_high" ||
      rawSortBy === "priceIn-low-to-high"
    ) {
      sortBy = "priceIn";
      sortOrder = "asc";
    } else if (
      rawSortBy === "priceIn_desc" ||
      rawSortBy === "priceIn-desc" ||
      rawSortBy === "priceIn_high_to_low" ||
      rawSortBy === "priceIn-high-to-low"
    ) {
      sortBy = "priceIn";
      sortOrder = "desc";
    } else if (rawSortBy === "newest") {
      sortBy = "createdAt";
      sortOrder = "desc";
    } else if (rawSortBy === "oldest") {
      sortBy = "createdAt";
      sortOrder = "asc";
    } else if (
      rawSortBy === "title" ||
      rawSortBy === "createdAt" ||
      rawSortBy === "publicationDate" ||
      rawSortBy === "price" ||
      rawSortBy === "priceIn"
    ) {
      sortBy = rawSortBy;
    }

    const minPrice = data.minPrice ?? data.priceMin;
    const maxPrice = data.maxPrice ?? data.priceMax;
    const minPriceIn = data.minPriceIn ?? data.priceInMin;
    const maxPriceIn = data.maxPriceIn ?? data.priceInMax;

    return {
      page: data.page,
      limit: data.limit,
      search: data.search,
      category: categories.length > 0 ? categories : undefined,
      author: authors.length > 0 ? authors : undefined,
      publisher: publishers.length > 0 ? publishers : undefined,
      language: data.language,
      status: data.status,
      minPrice,
      maxPrice,
      minPriceIn,
      maxPriceIn,
      sortBy,
      sortOrder,
    };
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
  price: z.number().nonnegative("Price cannot be negative").optional(),
  priceIn: z.number().nonnegative("Price cannot be negative").optional(),
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

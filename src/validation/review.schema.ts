import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createReviewSchema = z
  .object({
    bookId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book ID format")
      .optional(),
    bookListingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book listing ID format")
      .optional(),
    sellerId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid seller ID format")
      .optional(),
    orderId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid order ID format")
      .optional(),
    rating: z.coerce
      .number()
      .int("Rating must be an integer")
      .min(1, "Rating must be between 1 and 5")
      .max(5, "Rating must be between 1 and 5"),
    title: z
      .string()
      .trim()
      .max(120, "Title cannot exceed 120 characters")
      .optional(),
    review: z
      .string()
      .trim()
      .min(2, "Review must be at least 2 characters")
      .max(2000, "Review cannot exceed 2000 characters"),
    images: z
      .union([z.array(z.string().url("Invalid image URL")), z.string().url("Invalid image URL")])
      .optional()
      .transform((val) => {
        if (!val) return [];
        if (typeof val === "string") return [val];
        return val;
      }),
  })
  .refine((data) => Boolean(data.bookId || data.bookListingId), {
    message: "Either bookId or bookListingId must be provided",
    path: ["bookId"],
  });

export const updateReviewSchema = z.object({
  rating: z.coerce
    .number()
    .int("Rating must be an integer")
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5")
    .optional(),
  title: z
    .string()
    .trim()
    .max(120, "Title cannot exceed 120 characters")
    .optional(),
  review: z
    .string()
    .trim()
    .min(2, "Review must be at least 2 characters")
    .max(2000, "Review cannot exceed 2000 characters")
    .optional(),
  existingImages: z
    .union([z.array(z.string().url("Invalid image URL")), z.string().url("Invalid image URL")])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (typeof val === "string") return [val];
      return val;
    }),
});

export const bookReviewsQuerySchema = z.object({
  bookId: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid book ID format")
    .optional(),
  bookListingId: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid book listing ID format")
    .optional(),
  id: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid ID format")
    .optional(),
  sellerId: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid seller ID format")
    .optional(),
  rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional(),
  hasImages: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      return val === true || val === "true" || val === "1";
    }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z
    .enum(["newest", "oldest", "highest_rating", "lowest_rating", "most_helpful"])
    .default("newest"),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type BookReviewsQueryInput = z.infer<typeof bookReviewsQuerySchema>;

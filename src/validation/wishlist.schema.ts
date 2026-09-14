import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const addToWishlistSchema = z
  .object({
    book: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book ID format")
      .optional(),
    bookId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book ID format")
      .optional(),
    id: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid ID format")
      .optional(),
    bookListingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid listing ID format")
      .optional(),
    listingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid listing ID format")
      .optional(),
  })
  .transform((data) => {
    const rawId =
      data.book ||
      data.bookId ||
      data.id ||
      data.bookListingId ||
      data.listingId;
    return {
      bookId: rawId!,
    };
  })
  .refine((data) => !!data.bookId, {
    message: "Book ID is required ('book', 'bookId', 'id', or 'bookListingId')",
    path: ["bookId"],
  });

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;

export const syncWishlistItemSchema = z
  .object({
    book: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book ID format")
      .optional(),
    bookId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book ID format")
      .optional(),
    id: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid ID format")
      .optional(),
    bookListingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid listing ID format")
      .optional(),
    listingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid listing ID format")
      .optional(),
  })
  .transform((data) => {
    const rawId =
      data.book ||
      data.bookId ||
      data.id ||
      data.bookListingId ||
      data.listingId;
    return {
      bookId: rawId!,
    };
  })
  .refine((data) => !!data.bookId, {
    message: "Book ID is required ('book', 'bookId', 'id', or 'bookListingId')",
    path: ["bookId"],
  });

export type SyncWishlistItemInput = z.infer<typeof syncWishlistItemSchema>;

export const syncWishlistSchema = z
  .union([
    z.array(syncWishlistItemSchema),
    z.object({
      items: z.array(syncWishlistItemSchema),
    }),
  ])
  .transform((data) => {
    if (Array.isArray(data)) {
      return { items: data };
    }
    return data;
  });

export type SyncWishlistInput = z.infer<typeof syncWishlistSchema>;

export const wishlistParamSchema = z
  .object({
    bookId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book ID format")
      .optional(),
    id: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid ID format")
      .optional(),
  })
  .transform((data) => ({
    bookId: (data.bookId || data.id)!,
  }))
  .refine((data) => !!data.bookId, {
    message: "Valid book ID is required in URL parameter",
    path: ["bookId"],
  });

export type WishlistParamInput = z.infer<typeof wishlistParamSchema>;

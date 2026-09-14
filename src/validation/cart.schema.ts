import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const addToCartSchema = z
  .object({
    bookListing: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book listing ID format")
      .optional(),
    bookListingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book listing ID format")
      .optional(),
    listingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book listing ID format")
      .optional(),
    quantity: z.coerce
      .number()
      .int("Quantity must be an integer")
      .positive("Quantity must be at least 1")
      .default(1),
  })
  .transform((data) => {
    const listingId = data.bookListing || data.bookListingId || data.listingId;
    return {
      bookListing: listingId!,
      quantity: data.quantity,
    };
  })
  .refine((data) => !!data.bookListing, {
    message: "Book listing ID is required ('bookListing', 'bookListingId', or 'listingId')",
    path: ["bookListing"],
  });

export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const syncCartItemSchema = z
  .object({
    bookListing: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book listing ID format")
      .optional(),
    bookListingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book listing ID format")
      .optional(),
    listingId: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book listing ID format")
      .optional(),
    quantity: z.coerce
      .number()
      .int("Quantity must be an integer")
      .positive("Quantity must be at least 1")
      .default(1),
  })
  .transform((data) => {
    const listingId = data.bookListing || data.bookListingId || data.listingId;
    return {
      bookListing: listingId!,
      quantity: data.quantity,
    };
  })
  .refine((data) => !!data.bookListing, {
    message: "Book listing ID is required ('bookListing', 'bookListingId', or 'listingId')",
    path: ["bookListing"],
  });

export type SyncCartItemInput = z.infer<typeof syncCartItemSchema>;

export const syncCartSchema = z
  .union([
    z.array(syncCartItemSchema),
    z.object({
      items: z.array(syncCartItemSchema),
    }),
  ])
  .transform((data) => {
    if (Array.isArray(data)) {
      return { items: data };
    }
    return data;
  });

export type SyncCartInput = z.infer<typeof syncCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce
    .number()
    .int("Quantity must be an integer")
    .positive("Quantity must be at least 1"),
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const cartParamSchema = z
  .object({
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
  })
  .transform((data) => ({
    bookListingId: (data.bookListingId || data.id)!,
  }))
  .refine((data) => !!data.bookListingId, {
    message: "Valid listing ID is required in URL parameter",
    path: ["bookListingId"],
  });

export type CartParamInput = z.infer<typeof cartParamSchema>;



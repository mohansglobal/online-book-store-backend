import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const bookListingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  book: z.string().trim().regex(objectIdRegex, "Invalid book ID").optional(),
  seller: z.string().trim().regex(objectIdRegex, "Invalid seller ID").optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  sortBy: z
    .enum(["sellingPriceInPaise", "stock", "createdAt"])
    .default("sellingPriceInPaise"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type BookListingQueryInput = z.infer<typeof bookListingQuerySchema>;

export const bookListingParamSchema = z.object({
  id: z.string().trim().regex(objectIdRegex, "Invalid listing ID"),
});

export type BookListingParamInput = z.infer<typeof bookListingParamSchema>;

export const createBookListingSchema = z
  .object({
    book: z
      .string()
      .trim()
      .regex(objectIdRegex, "Invalid book ID format"),
    mrpInPaise: z
      .number()
      .int("MRP must be a whole number in paise")
      .nonnegative("MRP cannot be negative"),
    sellingPriceInPaise: z
      .number()
      .int("Selling price must be a whole number in paise")
      .nonnegative("Selling price cannot be negative"),
    stock: z
      .number()
      .int("Stock must be an integer")
      .nonnegative("Stock cannot be negative")
      .optional()
      .default(0),
    sku: z.string().trim().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.sellingPriceInPaise <= data.mrpInPaise, {
    message: "Selling price cannot exceed MRP",
    path: ["sellingPriceInPaise"],
  });

export type CreateBookListingInput = z.input<typeof createBookListingSchema>;

export const updateBookListingSchema = z
  .object({
    mrpInPaise: z
      .number()
      .int("MRP must be a whole number in paise")
      .nonnegative("MRP cannot be negative")
      .optional(),
    sellingPriceInPaise: z
      .number()
      .int("Selling price must be a whole number in paise")
      .nonnegative("Selling price cannot be negative")
      .optional(),
    stock: z
      .number()
      .int("Stock must be an integer")
      .nonnegative("Stock cannot be negative")
      .optional(),
    sku: z.string().trim().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (
        data.mrpInPaise !== undefined &&
        data.sellingPriceInPaise !== undefined
      ) {
        return data.sellingPriceInPaise <= data.mrpInPaise;
      }
      return true;
    },
    {
      message: "Selling price cannot exceed MRP",
      path: ["sellingPriceInPaise"],
    },
  );

export type UpdateBookListingInput = z.input<typeof updateBookListingSchema>;

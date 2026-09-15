import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const checkoutSummaryQuerySchema = z.object({
  shippingAddressId: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid shipping address ID format")
    .optional(),
  billingAddressId: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid billing address ID format")
    .optional(),
  billingSameAsShipping: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  couponCode: z
    .string()
    .trim()
    .max(30, "Coupon code cannot exceed 30 characters")
    .optional(),
  bookListingId: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid book listing ID format")
    .optional(),
  quantity: z.coerce
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(20, "Quantity cannot exceed 20")
    .optional(),
});

export type CheckoutSummaryQuery = z.infer<typeof checkoutSummaryQuerySchema>;


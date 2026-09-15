import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const shippingAddressSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  mobileNumber: z.string().trim().min(5, "Mobile number is required"),
  street: z.string().trim().min(1, "Street address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().min(1, "Postal code is required"),
  country: z.string().trim().min(1, "Country is required"),
});

export const checkoutItemSchema = z
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
    quantity: z.coerce
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .max(20, "Quantity cannot exceed 20")
      .default(1),
  })
  .refine((data) => Boolean(data.bookListing || data.bookListingId), {
    message: "Either bookListing or bookListingId must be provided",
    path: ["bookListingId"],
  });



export const createOrderSchema = z
  .object({
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
    billingSameAsShipping: z.boolean().default(true),
    paymentMethod: z
      .enum(["ONLINE_PAY", "CASH_ON_DELIVERY"])
      .default("ONLINE_PAY"),
    couponCode: z.string().trim().max(30).optional(),
    // Razorpay payment details (optional for COD or pending online payment)
    paymentId: z.string().trim().optional(),
    razorpayPaymentId: z.string().trim().optional(),
    razorpayOrderId: z.string().trim().optional(),
    razorpaySignature: z.string().trim().optional(),
    // Legacy support for direct address payload and direct items
    shippingAddress: shippingAddressSchema.optional(),
    items: z.array(checkoutItemSchema).optional(),
  })
  .refine(
    (data) => Boolean(data.shippingAddressId || data.shippingAddress),
    {
      message: "Either shippingAddressId or shippingAddress must be provided",
      path: ["shippingAddressId"],
    },
  );

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// Alias for backwards compatibility
export const checkoutSchema = createOrderSchema;
export type CheckoutInput = CreateOrderInput;

export const verifyPaymentSchema = z.object({
  razorpayPaymentId: z.string().trim().min(1, "razorpayPaymentId is required"),
  razorpayOrderId: z.string().trim().optional(),
  razorpaySignature: z.string().trim().optional(),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const initiateRazorpayOrderSchema = z.object({
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
  billingSameAsShipping: z.boolean().default(true),
  couponCode: z.string().trim().max(30).optional(),
  items: z.array(checkoutItemSchema).optional(),
});

export type InitiateRazorpayOrderInput = z.infer<typeof initiateRazorpayOrderSchema>;

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  dateRange: z.string().trim().optional(),
});

export type OrderQueryInput = z.infer<typeof orderQuerySchema>;

export const orderParamSchema = z.object({
  id: z.string().trim().regex(objectIdRegex, "Invalid order ID format"),
});

export type OrderParamInput = z.infer<typeof orderParamSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").optional(),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;



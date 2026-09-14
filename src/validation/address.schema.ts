import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const ADDRESS_TYPES = ["BILLING", "SHIPPING"] as const;

export const createAddressSchema = z.object({
  addressType: z
    .enum(["BILLING", "SHIPPING", "billing", "shipping"])
    .default("SHIPPING")
    .transform((val) => val.toUpperCase() as "BILLING" | "SHIPPING"),

  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name cannot exceed 100 characters"),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address"),

  mobileNumber: z
    .string()
    .trim()
    .min(7, "Mobile number must be at least 7 characters")
    .max(20, "Mobile number cannot exceed 20 characters")
    .regex(/^[0-9+\s()-]{7,20}$/, "Invalid mobile number format"),

  country: z
    .string()
    .trim()
    .min(2, "Country is required"),

  countryRef: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid country ID format")
    .optional(),

  state: z
    .string()
    .trim()
    .min(1, "State / Division is required"),

  city: z
    .string()
    .trim()
    .min(1, "City / Town is required"),

  postalCode: z
    .string()
    .trim()
    .min(2, "PIN / Postcode is required"),

  streetAddress: z
    .string()
    .trim()
    .min(3, "Street address is required"),

  apartment: z
    .string()
    .trim()
    .optional()
    .default(""),

  isDefault: z
    .boolean()
    .optional()
    .default(false),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const addressQuerySchema = z.object({
  type: z
    .enum(["BILLING", "SHIPPING", "billing", "shipping"])
    .optional()
    .transform((val) => (val ? (val.toUpperCase() as "BILLING" | "SHIPPING") : undefined)),
  addressType: z
    .enum(["BILLING", "SHIPPING", "billing", "shipping"])
    .optional()
    .transform((val) => (val ? (val.toUpperCase() as "BILLING" | "SHIPPING") : undefined)),
}).transform((data) => ({
  addressType: data.addressType || data.type,
}));

export type AddressQueryInput = z.infer<typeof addressQuerySchema>;

export const addressParamSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(objectIdRegex, "Invalid address ID format"),
});

export type AddressParamInput = z.infer<typeof addressParamSchema>;

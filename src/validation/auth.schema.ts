import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot exceed 100 characters"),

  mobileNumber: z
    .string()
    .trim()
    .min(7, "Mobile number must be at least 7 characters")
    .max(20, "Mobile number cannot exceed 20 characters")
    .regex(/^[0-9+\s()-]{7,20}$/, "Invalid mobile number format"),

  country: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid country ID format")
    .optional(),

  postalCode: z.string().trim().max(20).optional(),

  profilePicture: z.string().trim().url("Invalid profile picture URL").optional(),

  role: z.enum(["BUYER", "SELLER"]).default("BUYER"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  mobileNumber: z
    .string()
    .trim()
    .min(7, "Mobile number is required")
    .max(20, "Mobile number cannot exceed 20 characters")
    .regex(/^[0-9+\s()-]{7,20}$/, "Invalid mobile number format"),

  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

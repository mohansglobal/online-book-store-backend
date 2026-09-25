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

export const sendOtpSchema = z.object({
  mobileNumber: z
    .string()
    .trim()
    .min(7, "Mobile number must be at least 7 characters")
    .max(20, "Mobile number cannot exceed 20 characters")
    .regex(/^[0-9+\s()-]{7,20}$/, "Invalid mobile number format")
    .optional(),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export const verifyOtpSchema = z.object({
  mobileNumber: z
    .string()
    .trim()
    .min(7, "Mobile number must be at least 7 characters")
    .max(20, "Mobile number cannot exceed 20 characters")
    .regex(/^[0-9+\s()-]{7,20}$/, "Invalid mobile number format")
    .optional(),
  otp: z
    .string()
    .trim()
    .min(4, "OTP must be at least 4 digits")
    .max(8, "OTP cannot exceed 8 digits"),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Email or mobile number is required")
    .max(100, "Identifier cannot exceed 100 characters"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const verifyPasswordResetOtpSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Email or mobile number is required")
    .max(100, "Identifier cannot exceed 100 characters"),
  otp: z
    .string()
    .trim()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must contain only numbers"),
});

export type VerifyPasswordResetOtpInput = z.infer<typeof verifyPasswordResetOtpSchema>;

export const resetPasswordSchema = z.object({
  resetToken: z
    .string()
    .trim()
    .min(1, "Reset token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot exceed 100 characters"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(100, "New password cannot exceed 100 characters"),
    confirmPassword: z
      .string()
      .min(1, "Confirm password is required")
      .optional(),
  })
  .refine(
    (data) => !data.confirmPassword || data.newPassword === data.confirmPassword,
    {
      message: "New password and confirm password do not match",
      path: ["confirmPassword"],
    },
  );

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export const updatePasswordSchema = changePasswordSchema;
export type UpdatePasswordInput = ChangePasswordInput;

export const confirmAccountDeletionSchema = z.object({
  otp: z
    .string()
    .trim()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must contain only numbers"),
  confirmation: z
    .string()
    .trim()
    .refine(
      (val) => val === "DELETE",
      "You must type 'DELETE' exactly to confirm account deletion",
    ),
  reason: z
    .string()
    .trim()
    .max(500, "Reason cannot exceed 500 characters")
    .optional(),
});

export type ConfirmAccountDeletionInput = z.infer<typeof confirmAccountDeletionSchema>;

export const restoreAccountSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Email or mobile number is required")
    .max(100, "Identifier cannot exceed 100 characters"),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type RestoreAccountInput = z.infer<typeof restoreAccountSchema>;



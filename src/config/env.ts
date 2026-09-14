import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters long"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters long"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  RAZORPAY_KEY_ID: z.string().min(1, "RAZORPAY_KEY_ID cannot be empty").optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1, "RAZORPAY_KEY_SECRET cannot be empty").optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME cannot be empty").optional(),
  CLOUDINARY_NAME: z.string().min(1, "CLOUDINARY_NAME cannot be empty").optional(),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY cannot be empty").optional(),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET cannot be empty").optional(),
  CLOUDINARY_URL: z.string().min(1, "CLOUDINARY_URL cannot be empty").optional(),
  SMS_KEY: z.string().min(1, "SMS_KEY cannot be empty").optional(),
  SMS_CLIENT_ID: z.string().min(1, "SMS_CLIENT_ID cannot be empty").optional(),
  SMS_SENDER_ID: z.string().default("GEISIL"),
  SMS_BASE_URL: z.string().default("https://api.mylogin.co.in"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;

import { z } from "zod";

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/; // e.g. "2026-09"

export const sellerDashboardRecentOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(5),
  status: z
    .enum([
      "PENDING",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ])
    .transform((val) => val.toUpperCase())
    .optional(),
  month: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val || val === "all") return true;
        const isYearMonth = monthRegex.test(val);
        const isMonthNum =
          !isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= 12;
        return isYearMonth || isMonthNum;
      },
      {
        message:
          "Month must be in 'YYYY-MM' format (e.g. '2026-09') or month number (1-12)",
      },
    )
    .optional(),
  year: z.coerce
    .number()
    .int()
    .min(2000, "Year must be 2000 or later")
    .max(2100, "Year must be 2100 or earlier")
    .optional(),
});

export type SellerDashboardRecentOrdersQueryInput = z.infer<
  typeof sellerDashboardRecentOrdersQuerySchema
>;

export const sellerRevenueAnalyticsQuerySchema = z.object({
  timeframe: z
    .enum(["weekly", "monthly", "yearly", "WEEKLY", "MONTHLY", "YEARLY"])
    .default("monthly")
    .transform((val) => val.toLowerCase() as "weekly" | "monthly" | "yearly"),
  year: z.coerce
    .number()
    .int()
    .min(2000, "Year must be 2000 or later")
    .max(2100, "Year must be 2100 or earlier")
    .optional(),
  month: z.coerce
    .number()
    .int()
    .min(1, "Month must be between 1 and 12")
    .max(12, "Month must be between 1 and 12")
    .optional(),
});

export type SellerRevenueAnalyticsQueryInput = z.infer<
  typeof sellerRevenueAnalyticsQuerySchema
>;

export const dailyOrdersAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  sellerId: z.string().trim().optional(),
});

export type DailyOrdersAnalyticsQueryInput = z.infer<
  typeof dailyOrdersAnalyticsQuerySchema
>;

export const categoryBreakdownAnalyticsQuerySchema = z.object({
  timeframe: z
    .enum(["all", "weekly", "monthly", "yearly", "ALL", "WEEKLY", "MONTHLY", "YEARLY"])
    .default("all")
    .transform((val) => val.toLowerCase() as "all" | "weekly" | "monthly" | "yearly"),
  sellerId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(3),
  year: z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional(),
  month: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .optional(),
});

export type CategoryBreakdownAnalyticsQueryInput = z.infer<
  typeof categoryBreakdownAnalyticsQuerySchema
>;

export const topAuthorsAnalyticsQuerySchema = z.object({
  timeframe: z
    .enum(["all", "weekly", "monthly", "yearly", "ALL", "WEEKLY", "MONTHLY", "YEARLY"])
    .default("all")
    .transform((val) => val.toLowerCase() as "all" | "weekly" | "monthly" | "yearly"),
  sellerId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  year: z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional(),
  month: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .optional(),
});

export type TopAuthorsAnalyticsQueryInput = z.infer<typeof topAuthorsAnalyticsQuerySchema>;
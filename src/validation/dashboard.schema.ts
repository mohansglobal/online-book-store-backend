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
      "PARTIALLY_SHIPPED",
      "SHIPPED",
      "DELIVERED",
      "PARTIALLY_CANCELLED",
      "CANCELLED",
      "pending",
      "confirmed",
      "processing",
      "partially_shipped",
      "shipped",
      "delivered",
      "partially_cancelled",
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
  sellerId: z.string().trim().optional(),
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
  sellerId: z.string().trim().optional(),
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

export const topSellersAnalyticsQuerySchema = z.object({
  timeframe: z
    .enum(["all", "weekly", "monthly", "yearly", "ALL", "WEEKLY", "MONTHLY", "YEARLY"])
    .default("all")
    .transform((val) => val.toLowerCase() as "all" | "weekly" | "monthly" | "yearly"),
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

export type TopSellersAnalyticsQueryInput = z.infer<
  typeof topSellersAnalyticsQuerySchema
>;

export const topSellingBooksAnalyticsQuerySchema = z.object({
  timeframe: z
    .enum(["1w", "1m", "1y", "5y", "all", "weekly", "monthly", "yearly", "5years", "1W", "1M", "1Y", "5Y", "ALL", "WEEKLY", "MONTHLY", "YEARLY", "5YEARS"])
    .default("all")
    .transform((val) => {
      const lower = val.toLowerCase();
      if (lower === "weekly" || lower === "1w") return "1w";
      if (lower === "monthly" || lower === "1m") return "1m";
      if (lower === "yearly" || lower === "1y") return "1y";
      if (lower === "5years" || lower === "5y") return "5y";
      return "all";
    }),
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

export type TopSellingBooksAnalyticsQueryInput = z.infer<
  typeof topSellingBooksAnalyticsQuerySchema
>;

export const orderHealthAnalyticsQuerySchema = z.object({
  timeframe: z
    .enum([
      "all",
      "7d",
      "30d",
      "this_month",
      "last_month",
      "yearly",
      "ALL",
      "7D",
      "30D",
      "THIS_MONTH",
      "LAST_MONTH",
      "YEARLY",
    ])
    .default("all")
    .transform((val) => val.toLowerCase() as "all" | "7d" | "30d" | "this_month" | "last_month" | "yearly"),
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

export type OrderHealthAnalyticsQueryInput = z.infer<
  typeof orderHealthAnalyticsQuerySchema
>;
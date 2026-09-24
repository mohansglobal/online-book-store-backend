import { Router } from "express";

import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sellerDashboardRecentOrdersQuerySchema,
  sellerRevenueAnalyticsQuerySchema,
  dailyOrdersAnalyticsQuerySchema,
  categoryBreakdownAnalyticsQuerySchema,
  topAuthorsAnalyticsQuerySchema,
} from "../validation/dashboard.schema.js";
import {
  getSellerRecentOrders,
  getSellerRevenueAnalytics,
  getDailyOrdersAnalytics,
  getCategoryBreakdownAnalytics,
  getTopAuthorsAnalytics,
} from "../controllers/dashboard.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize("SELLER", "ADMIN"));

router.get(
  "/recent-orders",
  validate(sellerDashboardRecentOrdersQuerySchema, "query"),
  getSellerRecentOrders,
);

router.get(
  "/seller/recent-orders",
  validate(sellerDashboardRecentOrdersQuerySchema, "query"),
  getSellerRecentOrders,
);

router.get(
  "/revenue-analytics",
  validate(sellerRevenueAnalyticsQuerySchema, "query"),
  getSellerRevenueAnalytics,
);

router.get(
  "/seller/revenue-analytics",
  validate(sellerRevenueAnalyticsQuerySchema, "query"),
  getSellerRevenueAnalytics,
);

router.get(
  "/daily-orders",
  validate(dailyOrdersAnalyticsQuerySchema, "query"),
  getDailyOrdersAnalytics,
);

router.get(
  "/seller/daily-orders",
  validate(dailyOrdersAnalyticsQuerySchema, "query"),
  getDailyOrdersAnalytics,
);

router.get(
  "/average-daily-orders",
  validate(dailyOrdersAnalyticsQuerySchema, "query"),
  getDailyOrdersAnalytics,
);

router.get(
  "/seller/average-daily-orders",
  validate(dailyOrdersAnalyticsQuerySchema, "query"),
  getDailyOrdersAnalytics,
);

router.get(
  "/category-breakdown",
  validate(categoryBreakdownAnalyticsQuerySchema, "query"),
  getCategoryBreakdownAnalytics,
);

router.get(
  "/genre-breakdown",
  validate(categoryBreakdownAnalyticsQuerySchema, "query"),
  getCategoryBreakdownAnalytics,
);

router.get(
  "/seller/category-breakdown",
  validate(categoryBreakdownAnalyticsQuerySchema, "query"),
  getCategoryBreakdownAnalytics,
);

router.get(
  "/seller/genre-breakdown",
  validate(categoryBreakdownAnalyticsQuerySchema, "query"),
  getCategoryBreakdownAnalytics,
);

router.get(
  "/top-authors",
  validate(topAuthorsAnalyticsQuerySchema, "query"),
  getTopAuthorsAnalytics,
);

router.get(
  "/top-authors-volume",
  validate(topAuthorsAnalyticsQuerySchema, "query"),
  getTopAuthorsAnalytics,
);

router.get(
  "/seller/top-authors",
  validate(topAuthorsAnalyticsQuerySchema, "query"),
  getTopAuthorsAnalytics,
);

router.get(
  "/seller/top-authors-volume",
  validate(topAuthorsAnalyticsQuerySchema, "query"),
  getTopAuthorsAnalytics,
);



export default router;




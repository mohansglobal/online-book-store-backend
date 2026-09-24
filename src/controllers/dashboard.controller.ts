import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getSellerRecentOrdersDashboardService,
  getSellerRevenueAnalyticsService,
  getDailyOrdersAnalyticsDashboardService,
  getCategoryBreakdownAnalyticsDashboardService,
  getTopAuthorsAnalyticsDashboardService,
} from "../services/dashboard.service.js";
import type {
  SellerDashboardRecentOrdersQueryInput,
  SellerRevenueAnalyticsQueryInput,
  DailyOrdersAnalyticsQueryInput,
  CategoryBreakdownAnalyticsQueryInput,
  TopAuthorsAnalyticsQueryInput,
} from "../validation/dashboard.schema.js";

export const getSellerRecentOrders = asyncHandler(async (req, res) => {
  const sellerId = req.user!.id;
  const query = req.query as unknown as SellerDashboardRecentOrdersQueryInput;

  const { summary, recentOrders, meta } =
    await getSellerRecentOrdersDashboardService(sellerId, query);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Dashboard recent orders retrieved successfully",
    {
      summary,
      recentOrders,
    },
    meta,
  );
});

export const getSellerRevenueAnalytics = asyncHandler(async (req, res) => {
  const sellerId = req.user!.id;
  const query = req.query as unknown as SellerRevenueAnalyticsQueryInput;

  const data = await getSellerRevenueAnalyticsService(sellerId, query);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Seller revenue analytics retrieved successfully",
    data,
  );
});

export const getDailyOrdersAnalytics = asyncHandler(async (req, res) => {
  const userContext = req.user!;
  const query = req.query as unknown as DailyOrdersAnalyticsQueryInput;

  const data = await getDailyOrdersAnalyticsDashboardService(
    userContext,
    query,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Average daily orders analytics retrieved successfully",
    data,
  );
});

export const getCategoryBreakdownAnalytics = asyncHandler(async (req, res) => {
  const userContext = req.user!;
  const query = req.query as unknown as CategoryBreakdownAnalyticsQueryInput;

  const data = await getCategoryBreakdownAnalyticsDashboardService(
    userContext,
    query,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Category breakdown analytics retrieved successfully",
    data,
  );
});

export const getTopAuthorsAnalytics = asyncHandler(async (req, res) => {
  const userContext = req.user!;
  const query = req.query as unknown as TopAuthorsAnalyticsQueryInput;

  const data = await getTopAuthorsAnalyticsDashboardService(
    userContext,
    query,
  );
  
  
  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Top authors analytics retrieved successfully",
    data,
  );
});





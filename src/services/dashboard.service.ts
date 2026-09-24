import mongoose from "mongoose";

import { OrderModel } from "../models/order.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import { BookModel } from "../models/book.model.js";
import { logger } from "../utils/logger.js";
import type {
  SellerDashboardRecentOrdersQueryInput,
  SellerRevenueAnalyticsQueryInput,
  DailyOrdersAnalyticsQueryInput,
  CategoryBreakdownAnalyticsQueryInput,
  TopAuthorsAnalyticsQueryInput,
} from "../validation/dashboard.schema.js";


interface MonthRange {
  startOfMonth: Date;
  endOfMonth: Date;
  monthLabel: string;
}

const calculateMonthDateRange = (
  monthInput?: string,
  yearInput?: number,
): MonthRange | null => {
  if (monthInput === "all") {
    return null;
  }

  const now = new Date();
  let targetYear = yearInput ?? now.getFullYear();
  let targetMonth = now.getMonth(); // 0 = Jan, 11 = Dec

  if (monthInput) {
    if (monthInput.includes("-")) {
      const parts = monthInput.split("-");
      const yearPart = Number(parts[0]);
      const monthPart = Number(parts[1]);

      if (!isNaN(yearPart) && !isNaN(monthPart) && monthPart >= 1 && monthPart <= 12) {
        targetYear = yearPart;
        targetMonth = monthPart - 1;
      }
    } else {
      const parsedMonth = Number(monthInput);
      if (!isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
        targetMonth = parsedMonth - 1;
      }
    }
  }

  const startOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0));
  const endOfMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999),
  );

  const formattedMonth = String(targetMonth + 1).padStart(2, "0");
  const monthLabel = `${targetYear}-${formattedMonth}`;

  return {
    startOfMonth,
    endOfMonth,
    monthLabel,
  };
};

export const getSellerRecentOrdersDashboardService = async (
  sellerId: string,
  query: SellerDashboardRecentOrdersQueryInput,
) => {
  const page = query.page || 1;
  const limit = query.limit || 5;
  const skip = (page - 1) * limit;

  // 1. Resolve target month boundary
  const monthRange = calculateMonthDateRange(query.month, query.year);

  // 2. Build MongoDB query filter
  const filter: Record<string, unknown> = {
    "items.seller": sellerId,
  };

  if (query.status) {
    filter.orderStatus = query.status;
  }

  if (monthRange) {
    filter.createdAt = {
      $gte: monthRange.startOfMonth,
      $lte: monthRange.endOfMonth,
    };
  }

  // 3. Query orders with populated buyer details
  const [orders, totalOrdersCount] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("buyer", "name email profilePicture mobileNumber")
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  // 4. Extract seller-specific items and compute individual seller order total
  const recentOrders = orders.map((order) => {
    const buyer = (order.buyer || {}) as {
      _id?: unknown;
      name?: string;
      email?: string;
      profilePicture?: string;
    };

    const customerName =
      buyer.name || order.shippingAddress?.fullName || "Anonymous";
    const customerEmail = buyer.email || order.shippingAddress?.email || "-";
    const customerProfilePicture = buyer.profilePicture || "";

    // Keep only items that belong to the current seller
    const sellerItems = (order.items || []).filter((item) => {
      const itemSellerId = item.seller ? item.seller.toString() : "";
      return itemSellerId === sellerId;
    });

    let sellerOrderTotalInPaise = 0;
    let sellerItemCount = 0;

    const formattedItems = sellerItems.map((item) => {
      const priceInPaise = item.priceInPaise;
      const quantity = item.quantity;
      const subtotalInPaise = item.subtotalInPaise || priceInPaise * quantity;

      sellerOrderTotalInPaise += subtotalInPaise;
      sellerItemCount += quantity;

      const priceInRupees = Math.round(priceInPaise / 100);
      const subtotalInRupees = Math.round(subtotalInPaise / 100);

      return {
        bookListingId: item.bookListing ? item.bookListing.toString() : "",
        bookId: item.book ? item.book.toString() : "",
        title: item.title,
        coverImage: item.coverImage || "",
        priceInPaise,
        priceInRupees,
        quantity,
        subtotalInPaise,
        subtotalInRupees,
      };
    });

    const sellerTotalInRupees = Math.round(sellerOrderTotalInPaise / 100);

    return {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      customer: {
        id: buyer._id ? buyer._id.toString() : "",
        name: customerName,
        email: customerEmail,
        profilePicture: customerProfilePicture,
      },
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      sellerTotalInPaise: sellerOrderTotalInPaise,
      sellerTotalInRupees,
      sellerItemCount,
      items: formattedItems,
    };
  });

  // 5. Aggregate overall monthly earnings for the seller
  let totalSellerEarningsInPaise = 0;

  if (monthRange) {
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
    const monthlyAggregation = await OrderModel.aggregate([
      {
        $match: {
          "items.seller": sellerObjectId,
          createdAt: {
            $gte: monthRange.startOfMonth,
            $lte: monthRange.endOfMonth,
          },
          ...(query.status ? { orderStatus: query.status } : {}),
        },
      },
      { $unwind: "$items" },
      {
        $match: {
          "items.seller": sellerObjectId,
        },
      },
      {
        $group: {
          _id: null,
          totalEarningsInPaise: { $sum: "$items.subtotalInPaise" },
        },
      },
    ]);

    if (monthlyAggregation.length > 0) {
      totalSellerEarningsInPaise =
        monthlyAggregation[0].totalEarningsInPaise || 0;
    }
  } else {
    // If no month filter, calculate sum across current page's orders
    for (const order of recentOrders) {
      totalSellerEarningsInPaise += order.sellerTotalInPaise;
    }
  }

  const totalSellerEarningsInRupees = Math.round(
    totalSellerEarningsInPaise / 100,
  );

  logger.info(
    {
      sellerId,
      month: monthRange ? monthRange.monthLabel : "all",
      ordersReturned: recentOrders.length,
      totalOrdersCount,
      totalSellerEarningsInRupees,
    },
    "Seller dashboard recent orders retrieved successfully",
  );

  return {
    summary: {
      month: monthRange ? monthRange.monthLabel : "all",
      totalOrdersInMonth: totalOrdersCount,
      totalSellerEarningsInRupees,
      totalSellerEarningsInPaise,
    },
    recentOrders,
    meta: {
      page,
      limit,
      total: totalOrdersCount,
      totalPages: Math.ceil(totalOrdersCount / limit),
    },
  };
};

const formatIndianRupeeCompact = (amountInRupees: number): string => {
  if (amountInRupees >= 10000000) {
    const cr = amountInRupees / 10000000;
    return `₹${cr.toFixed(2).replace(/\.00$/, "")}Cr`;
  }
  if (amountInRupees >= 100000) {
    const lakh = amountInRupees / 100000;
    return `₹${lakh.toFixed(2).replace(/\.00$/, "")}L`;
  }
  if (amountInRupees >= 1000) {
    const k = amountInRupees / 1000;
    return `₹${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `₹${amountInRupees.toLocaleString("en-IN")}`;
};

const aggregateSellerStats = async (
  sellerObjectId: mongoose.Types.ObjectId | null,
  startDate: Date,
  endDate: Date,
) => {
  const matchConditions: Record<string, unknown> = {
    orderStatus: { $nin: ["CANCELLED"] },
    paymentStatus: { $ne: "FAILED" },
    createdAt: { $gte: startDate, $lte: endDate },
  };

  if (sellerObjectId) {
    matchConditions["items.seller"] = sellerObjectId;
  }

  const pipeline: any[] = [{ $match: matchConditions }, { $unwind: "$items" }];

  if (sellerObjectId) {
    pipeline.push({
      $match: {
        "items.seller": sellerObjectId,
      },
    });
  }

  pipeline.push(
    {
      $group: {
        _id: "$_id",
        orderRevenue: { $sum: "$items.subtotalInPaise" },
        orderItems: { $sum: "$items.quantity" },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenueInPaise: { $sum: "$orderRevenue" },
        totalOrders: { $sum: 1 },
        totalItemsSold: { $sum: "$orderItems" },
      },
    },
  );

  const result = await OrderModel.aggregate(pipeline);

  if (result.length === 0) {
    return {
      revenueInPaise: 0,
      totalOrders: 0,
      totalItemsSold: 0,
    };
  }

  return {
    revenueInPaise: result[0].totalRevenueInPaise || 0,
    totalOrders: result[0].totalOrders || 0,
    totalItemsSold: result[0].totalItemsSold || 0,
  };
};


export const getSellerRevenueAnalyticsService = async (
  sellerId: string,
  query: SellerRevenueAnalyticsQueryInput,
) => {
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
  const timeframe = query.timeframe || "monthly";
  const now = new Date();

  let currentStartDate: Date;
  let currentEndDate: Date;
  let previousStartDate: Date;
  let previousEndDate: Date;
  let comparisonPeriodName = "last month";

  const targetYear = query.year ?? now.getUTCFullYear();
  const targetMonth =
    query.month !== undefined ? query.month - 1 : now.getUTCMonth();

  if (timeframe === "weekly") {
    currentEndDate = new Date(now);
    currentStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    previousEndDate = new Date(currentStartDate);
    previousStartDate = new Date(
      currentStartDate.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    comparisonPeriodName = "last week";
  } else if (timeframe === "yearly") {
    currentStartDate = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0, 0));
    currentEndDate = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));

    previousStartDate = new Date(Date.UTC(targetYear - 1, 0, 1, 0, 0, 0, 0));
    previousEndDate = new Date(
      Date.UTC(targetYear - 1, 11, 31, 23, 59, 59, 999),
    );
    comparisonPeriodName = "last year";
  } else {
    // monthly
    currentStartDate = new Date(
      Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0),
    );
    currentEndDate = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999),
    );

    const prevMonthDate = new Date(
      Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0, 0),
    );
    const prevYear = prevMonthDate.getUTCFullYear();
    const prevMonth = prevMonthDate.getUTCMonth();

    previousStartDate = new Date(Date.UTC(prevYear, prevMonth, 1, 0, 0, 0, 0));
    previousEndDate = new Date(
      Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59, 999),
    );
    comparisonPeriodName = "last month";
  }

  // Today's Window
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  // Run aggregations
  const [currentStats, prevStats, todayStats] = await Promise.all([
    aggregateSellerStats(sellerObjectId, currentStartDate, currentEndDate),
    aggregateSellerStats(sellerObjectId, previousStartDate, previousEndDate),
    aggregateSellerStats(sellerObjectId, startOfToday, endOfToday),
  ]);

  // Main calculations
  const totalRevenueInPaise = currentStats.revenueInPaise;
  const totalRevenueInRupees = Math.round(totalRevenueInPaise / 100);

  const previousPeriodRevenueInPaise = prevStats.revenueInPaise;
  const previousPeriodRevenueInRupees = Math.round(previousPeriodRevenueInPaise / 100);

  const differenceInPaise = totalRevenueInPaise - previousPeriodRevenueInPaise;
  const differenceInRupees = Math.round(Math.abs(differenceInPaise) / 100);
  const isGrowthPositive = differenceInPaise >= 0;

  let growthPercentage = 0;
  if (previousPeriodRevenueInPaise > 0) {
    growthPercentage = Number(
      (
        ((totalRevenueInPaise - previousPeriodRevenueInPaise) /
          previousPeriodRevenueInPaise) *
        100
      ).toFixed(1),
    );
  } else if (totalRevenueInPaise > 0) {
    growthPercentage = 100.0;
  }

  const comparisonVerb = isGrowthPositive ? "more" : "less";
  const comparisonText = `₹${differenceInRupees.toLocaleString("en-IN")} ${comparisonVerb} than ${comparisonPeriodName}`;

  // Today stats
  const todayRevenueInPaise = todayStats.revenueInPaise;
  const todayRevenueInRupees = Math.round(todayRevenueInPaise / 100);
  const todayOrdersCount = todayStats.totalOrders;

  // Middle Row Metrics
  const totalOrders = currentStats.totalOrders;
  const totalItemsSold = currentStats.totalItemsSold;

  const avgOrderValueInPaise =
    totalOrders > 0 ? Math.round(totalRevenueInPaise / totalOrders) : 0;
  const avgOrderValueInRupees = Math.round(avgOrderValueInPaise / 100);

  const netRevenueInPaise = Math.round(totalRevenueInPaise * 0.88);
  const netRevenueInRupees = Math.round(netRevenueInPaise / 100);
  const formattedNetRevenue = formatIndianRupeeCompact(netRevenueInRupees);

  // Trend graph points
  const trendPoints: Array<{
    label: string;
    date: string;
    revenueInRupees: number;
    revenueInPaise: number;
    orders: number;
  }> = [];

  let trendTotalInPaise = 0;

  if (timeframe === "yearly") {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    for (let m = 0; m < 12; m++) {
      const mStart = new Date(Date.UTC(targetYear, m, 1, 0, 0, 0, 0));
      const mEnd = new Date(Date.UTC(targetYear, m + 1, 0, 23, 59, 59, 999));

      const mStats = await aggregateSellerStats(
        sellerObjectId,
        mStart,
        mEnd,
      );
      const mRevRupees = Math.round(mStats.revenueInPaise / 100);

      trendTotalInPaise += mStats.revenueInPaise;

      trendPoints.push({
        label: monthNames[m],
        date: `${targetYear}-${String(m + 1).padStart(2, "0")}`,
        revenueInRupees: mRevRupees,
        revenueInPaise: mStats.revenueInPaise,
        orders: mStats.totalOrders,
      });
    }
  } else {
    // 7 days breakdown for Weekly / Monthly (matching "Revenue trend Last 7 days" card in UI)
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let d = 6; d >= 0; d--) {
      const dayDate = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      const dayStart = new Date(dayDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayDate);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const dStats = await aggregateSellerStats(
        sellerObjectId,
        dayStart,
        dayEnd,
      );
      const dRevRupees = Math.round(dStats.revenueInPaise / 100);

      trendTotalInPaise += dStats.revenueInPaise;

      const dayLabel = dayNames[dayDate.getUTCDay()];
      const formattedDate = dayDate.toISOString().split("T")[0];

      trendPoints.push({
        label: dayLabel,
        date: formattedDate,
        revenueInRupees: dRevRupees,
        revenueInPaise: dStats.revenueInPaise,
        orders: dStats.totalOrders,
      });
    }
  }

  const trendTotalInRupees = Math.round(trendTotalInPaise / 100);
  const trendGrowthPercentage = growthPercentage;

  logger.info(
    {
      sellerId,
      timeframe,
      totalRevenueInRupees,
      todayRevenueInRupees,
      totalOrders,
    },
    "Seller revenue analytics computed successfully",
  );

  return {
    timeframe,
    currency: "INR",
    main: {
      totalRevenueInRupees,
      totalRevenueInPaise,
      growthPercentage,
      differenceInRupees,
      differenceInPaise: Math.abs(differenceInPaise),
      isGrowthPositive,
      comparisonText,
      previousPeriodRevenueInRupees,
      previousPeriodRevenueInPaise,
    },
    today: {
      todayRevenueInRupees,
      todayRevenueInPaise,
      todayOrdersCount,
    },
    metrics: {
      netRevenueInRupees,
      netRevenueInPaise,
      formattedNetRevenue,
      avgOrderValueInRupees,
      avgOrderValueInPaise,
      totalOrders,
      totalItemsSold,
    },
    trend: {
      title: "Revenue trend",
      subtitle: timeframe === "yearly" ? `${targetYear}` : "Last 7 days",
      trendTotalInRupees,
      trendTotalInPaise,
      trendGrowthPercentage,
      isTrendGrowthPositive: isGrowthPositive,
      points: trendPoints,
    },
  };
};

export const getDailyOrdersAnalyticsDashboardService = async (
  userContext: { id: string; role: string },
  query: DailyOrdersAnalyticsQueryInput,
) => {
  let sellerObjectId: mongoose.Types.ObjectId | null = null;

  if (userContext.role === "SELLER") {
    sellerObjectId = new mongoose.Types.ObjectId(userContext.id);
  } else if (query.sellerId && mongoose.Types.ObjectId.isValid(query.sellerId)) {
    sellerObjectId = new mongoose.Types.ObjectId(query.sellerId);
  }

  const now = new Date();
  const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayNamesFull = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const daysCount = query.days ?? 7;
  const days: Array<{
    day: string;
    dayFull: string;
    date: string;
    orders: number;
    shipments: number;
    revenueInRupees: number;
    revenueInPaise: number;
    isPeak: boolean;
  }> = [];

  let maxOrders = -1;
  let peakDayIndex = 0;

  let currentTotalOrders = 0;
  let currentTotalShipments = 0;
  let currentTotalRevenueInPaise = 0;

  for (let d = daysCount - 1; d >= 0; d--) {
    const dayDate = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const dayStart = new Date(dayDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const stats = await aggregateSellerStats(sellerObjectId, dayStart, dayEnd);
    const revRupees = Math.round(stats.revenueInPaise / 100);

    const dayLabel = dayNamesShort[dayDate.getUTCDay()];
    const dayFull = dayNamesFull[dayDate.getUTCDay()];
    const formattedDate = dayDate.toISOString().split("T")[0];

    currentTotalOrders += stats.totalOrders;
    currentTotalShipments += stats.totalItemsSold;
    currentTotalRevenueInPaise += stats.revenueInPaise;

    if (stats.totalOrders > maxOrders) {
      maxOrders = stats.totalOrders;
      peakDayIndex = days.length;
    }

    days.push({
      day: dayLabel,
      dayFull,
      date: formattedDate,
      orders: stats.totalOrders,
      shipments: stats.totalItemsSold,
      revenueInRupees: revRupees,
      revenueInPaise: stats.revenueInPaise,
      isPeak: false,
    });
  }

  if (days.length > 0 && maxOrders > 0) {
    days[peakDayIndex].isPeak = true;
  }

  const currentAverageDailyOrders = Number(
    (currentTotalOrders / daysCount).toFixed(1),
  );
  const currentTotalRevenueInRupees = Math.round(
    currentTotalRevenueInPaise / 100,
  );

  // Previous period (same length: e.g. 7 days before current 7 days)
  const prevPeriodEnd = new Date(
    now.getTime() - daysCount * 24 * 60 * 60 * 1000,
  );
  prevPeriodEnd.setUTCHours(23, 59, 59, 999);
  const prevPeriodStart = new Date(
    now.getTime() - (2 * daysCount - 1) * 24 * 60 * 60 * 1000,
  );
  prevPeriodStart.setUTCHours(0, 0, 0, 0);

  const prevStats = await aggregateSellerStats(
    sellerObjectId,
    prevPeriodStart,
    prevPeriodEnd,
  );
  const previousTotalOrders = prevStats.totalOrders;
  const previousAverageDailyOrders = Number(
    (previousTotalOrders / daysCount).toFixed(1),
  );
  const previousTotalShipments = prevStats.totalItemsSold;
  const previousTotalRevenueInPaise = prevStats.revenueInPaise;
  const previousTotalRevenueInRupees = Math.round(
    previousTotalRevenueInPaise / 100,
  );

  // Growth & Comparison
  const differenceInOrders = currentTotalOrders - previousTotalOrders;
  const differenceInDailyAverage = Number(
    (currentAverageDailyOrders - previousAverageDailyOrders).toFixed(1),
  );
  const isGrowthPositive = differenceInOrders >= 0;

  let growthPercentage = 0;
  if (previousTotalOrders > 0) {
    growthPercentage = Number(
      (
        ((currentTotalOrders - previousTotalOrders) / previousTotalOrders) *
        100
      ).toFixed(1),
    );
  } else if (currentTotalOrders > 0) {
    growthPercentage = 100.0;
  }

  const formattedGrowth = `${isGrowthPositive && growthPercentage > 0 ? "+" : ""}${growthPercentage}%`;

  let growthRate = 0;
  if (previousTotalOrders > 0) {
    growthRate = Math.round((currentTotalOrders / previousTotalOrders) * 100);
  } else if (currentTotalOrders > 0) {
    growthRate = 100;
  }
  const growthBadge = `${growthRate}%`;

  const comparisonVerb = isGrowthPositive ? "more" : "less";
  const comparisonText = `${Math.abs(growthPercentage)}% ${comparisonVerb} than previous 7 days`;

  const peakDay = days[peakDayIndex] || days[days.length - 1];
  const peakInfo = {
    day: peakDay ? peakDay.day : "-",
    date: peakDay ? peakDay.date : "",
    orders: peakDay ? peakDay.orders : 0,
    badge: peakDay ? `Peak: ${peakDay.day} (${peakDay.orders})` : "Peak: - (0)",
  };

  const currentStartDateStr = days[0]?.date || "";
  const currentEndDateStr = days[days.length - 1]?.date || "";
  const prevStartDateStr = prevPeriodStart.toISOString().split("T")[0];
  const prevEndDateStr = prevPeriodEnd.toISOString().split("T")[0];

  logger.info(
    {
      role: userContext.role,
      sellerId: sellerObjectId ? sellerObjectId.toString() : "all",
      currentTotalOrders,
      currentAverageDailyOrders,
      growthPercentage,
    },
    "Daily orders analytics retrieved successfully",
  );

  return {
    title: "Orders This Week",
    subtitle: "Average daily orders",
    periodLabel: `Last ${daysCount} Days`,
    main: {
      averageDailyOrders: currentAverageDailyOrders,
      growthPercentage,
      formattedGrowth,
      isGrowthPositive,
      growthBadge,
      totalOrders: currentTotalOrders,
      totalShipments: currentTotalShipments,
      totalRevenueInRupees: currentTotalRevenueInRupees,
      totalRevenueInPaise: currentTotalRevenueInPaise,
    },
    peak: peakInfo,
    currentPeriod: {
      startDate: currentStartDateStr,
      endDate: currentEndDateStr,
      totalOrders: currentTotalOrders,
      averageDailyOrders: currentAverageDailyOrders,
      totalShipments: currentTotalShipments,
      totalRevenueInRupees: currentTotalRevenueInRupees,
      totalRevenueInPaise: currentTotalRevenueInPaise,
      days,
    },
    previousPeriod: {
      startDate: prevStartDateStr,
      endDate: prevEndDateStr,
      totalOrders: previousTotalOrders,
      averageDailyOrders: previousAverageDailyOrders,
      totalShipments: previousTotalShipments,
      totalRevenueInRupees: previousTotalRevenueInRupees,
      totalRevenueInPaise: previousTotalRevenueInPaise,
    },
    comparison: {
      differenceInOrders,
      differenceInDailyAverage,
      growthPercentage,
      isGrowthPositive,
      comparisonText,
    },
  };
};

export const getCategoryBreakdownAnalyticsDashboardService = async (
  userContext: { id: string; role: string },
  query: CategoryBreakdownAnalyticsQueryInput,
) => {
  let sellerObjectId: mongoose.Types.ObjectId | null = null;

  if (userContext.role === "SELLER") {
    sellerObjectId = new mongoose.Types.ObjectId(userContext.id);
  } else if (query.sellerId && mongoose.Types.ObjectId.isValid(query.sellerId)) {
    sellerObjectId = new mongoose.Types.ObjectId(query.sellerId);
  }

  const timeframe = query.timeframe ?? "all";
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (timeframe === "weekly") {
    endDate = new Date(now);
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeframe === "yearly") {
    const targetYear = query.year ?? now.getUTCFullYear();
    startDate = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));
  } else if (timeframe === "monthly") {
    const targetYear = query.year ?? now.getUTCFullYear();
    const targetMonth =
      query.month !== undefined ? query.month - 1 : now.getUTCMonth();
    startDate = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0));
    endDate = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999),
    );
  }

  const matchFilter: Record<string, unknown> = {
    orderStatus: { $nin: ["CANCELLED"] },
    paymentStatus: { $ne: "FAILED" },
  };

  if (sellerObjectId) {
    matchFilter["items.seller"] = sellerObjectId;
  }

  if (startDate && endDate) {
    matchFilter.createdAt = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  const pipeline: any[] = [
    { $match: matchFilter },
    { $unwind: "$items" },
  ];

  if (sellerObjectId) {
    pipeline.push({
      $match: { "items.seller": sellerObjectId },
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: "books",
        localField: "items.book",
        foreignField: "_id",
        as: "bookDoc",
      },
    },
    {
      $unwind: { path: "$bookDoc", preserveNullAndEmptyArrays: true },
    },
    {
      $unwind: { path: "$bookDoc.categories", preserveNullAndEmptyArrays: true },
    },
    {
      $lookup: {
        from: "categories",
        localField: "bookDoc.categories",
        foreignField: "_id",
        as: "categoryDoc",
      },
    },
    {
      $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true },
    },
    {
      $group: {
        _id: { $ifNull: ["$categoryDoc._id", "uncategorized"] },
        categoryId: { $first: { $ifNull: ["$categoryDoc._id", null] } },
        name: { $first: { $ifNull: ["$categoryDoc.name", "General / Other"] } },
        nameBn: { $first: { $ifNull: ["$categoryDoc.nameBn", ""] } },
        slug: { $first: { $ifNull: ["$categoryDoc.slug", "other"] } },
        booksSold: { $sum: "$items.quantity" },
        revenueInPaise: { $sum: "$items.subtotalInPaise" },
        orderCount: { $sum: 1 },
      },
    },
    {
      $sort: { booksSold: -1 },
    },
  );

  const rawCategories = await OrderModel.aggregate(pipeline);

  let totalBooksSold = 0;
  let totalRevenueInPaise = 0;

  for (const cat of rawCategories) {
    totalBooksSold += cat.booksSold;
    totalRevenueInPaise += cat.revenueInPaise;
  }

  const totalRevenueInRupees = Math.round(totalRevenueInPaise / 100);

  const COLOR_PALETTE = [
    "#D95328", // Rust / Terracotta Orange (Fiction Novels)
    "#00B074", // Emerald Green (Academic)
    "#4B6BFB", // Cobalt / Blue (Poetry & Classic)
    "#8E95A5", // Neutral Slate / Others
    "#F59E0B", // Amber
    "#8B5CF6", // Purple
    "#EC4899", // Pink
  ];

  const topLimit = query.limit ?? 3;
  const items: Array<{
    categoryId: string | null;
    name: string;
    nameBn: string;
    slug: string;
    booksSold: number;
    percentage: number;
    formattedPercentage: string;
    revenueInRupees: number;
    revenueInPaise: number;
    color: string;
    isOthers: boolean;
  }> = [];

  const topCategories = rawCategories.slice(0, topLimit);

  for (let i = 0; i < topCategories.length; i++) {
    const cat = topCategories[i];
    const catBooksSold = cat.booksSold;
    const catRevPaise = cat.revenueInPaise;
    const catRevRupees = Math.round(catRevPaise / 100);

    const percentage =
      totalBooksSold > 0
        ? Number(((catBooksSold / totalBooksSold) * 100).toFixed(1))
        : 0;

    items.push({
      categoryId: cat.categoryId ? cat.categoryId.toString() : null,
      name: cat.name,
      nameBn: cat.nameBn,
      slug: cat.slug,
      booksSold: catBooksSold,
      percentage,
      formattedPercentage: `${percentage}%`,
      revenueInRupees: catRevRupees,
      revenueInPaise: catRevPaise,
      color: COLOR_PALETTE[i % COLOR_PALETTE.length],
      isOthers: false,
    });
  }

  let othersCategory: (typeof items)[number] | null = null;

  if (rawCategories.length > topLimit) {
    let othersBooksSold = 0;
    let othersRevenueInPaise = 0;

    for (let i = topLimit; i < rawCategories.length; i++) {
      othersBooksSold += rawCategories[i].booksSold;
      othersRevenueInPaise += rawCategories[i].revenueInPaise;
    }

    const othersPercentage =
      totalBooksSold > 0
        ? Number(((othersBooksSold / totalBooksSold) * 100).toFixed(1))
        : 0;

    othersCategory = {
      categoryId: "others",
      name: "Others",
      nameBn: "অন্যান্য",
      slug: "others",
      booksSold: othersBooksSold,
      percentage: othersPercentage,
      formattedPercentage: `${othersPercentage}%`,
      revenueInRupees: Math.round(othersRevenueInPaise / 100),
      revenueInPaise: othersRevenueInPaise,
      color: COLOR_PALETTE[3], // Slate
      isOthers: true,
    };

    items.push(othersCategory);
  }

  logger.info(
    {
      role: userContext.role,
      sellerId: sellerObjectId ? sellerObjectId.toString() : "all",
      timeframe,
      totalBooksSold,
      categoriesCount: items.length,
    },
    "Category breakdown analytics retrieved successfully",
  );

  return {
    title: "Genre Breakdown",
    subtitle: "Books Sold",
    timeframe,
    totalBooksSold,
    formattedTotalBooksSold: totalBooksSold.toLocaleString("en-IN"),
    totalRevenueInRupees,
    totalRevenueInPaise,
    totalCategories: rawCategories.length,
    items,
    others: othersCategory,
  };
};

export const getTopAuthorsAnalyticsDashboardService = async (
  userContext: { id: string; role: string },
  query: TopAuthorsAnalyticsQueryInput,
) => {
  let sellerObjectId: mongoose.Types.ObjectId | null = null;

  if (userContext.role === "SELLER") {
    sellerObjectId = new mongoose.Types.ObjectId(userContext.id);
  } else if (query.sellerId && mongoose.Types.ObjectId.isValid(query.sellerId)) {
    sellerObjectId = new mongoose.Types.ObjectId(query.sellerId);
  }

  const timeframe = query.timeframe ?? "all";
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (timeframe === "weekly") {
    endDate = new Date(now);
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeframe === "yearly") {
    const targetYear = query.year ?? now.getUTCFullYear();
    startDate = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));
  } else if (timeframe === "monthly") {
    const targetYear = query.year ?? now.getUTCFullYear();
    const targetMonth =
      query.month !== undefined ? query.month - 1 : now.getUTCMonth();
    startDate = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0));
    endDate = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999),
    );
  }

  // 1. Calculate Active Authors in Catalog
  let activeAuthorsInCatalogCount = 0;

  if (sellerObjectId) {
    const sellerListings = await BookListingModel.find(
      { seller: sellerObjectId, isActive: true },
      { book: 1 },
    ).lean();

    const bookIds = sellerListings.map((listing) => listing.book);

    if (bookIds.length > 0) {
      const activeBooks = await BookModel.find(
        { _id: { $in: bookIds }, status: "ACTIVE" },
        { authors: 1 },
      ).lean();

      const uniqueAuthorIdSet = new Set<string>();

      for (const book of activeBooks) {
        if (Array.isArray(book.authors)) {
          for (const authorId of book.authors) {
            if (authorId) {
              uniqueAuthorIdSet.add(authorId.toString());
            }
          }
        }
      }

      activeAuthorsInCatalogCount = uniqueAuthorIdSet.size;
    }
  } else {
    const distinctAuthorIds = await BookModel.distinct("authors", {
      status: "ACTIVE",
    });
    activeAuthorsInCatalogCount = distinctAuthorIds.length;
  }

  // 2. Build MongoDB Order Aggregation Pipeline
  const matchFilter: Record<string, unknown> = {
    orderStatus: { $nin: ["CANCELLED"] },
    paymentStatus: { $ne: "FAILED" },
  };

  if (sellerObjectId) {
    matchFilter["items.seller"] = sellerObjectId;
  }

  if (startDate && endDate) {
    matchFilter.createdAt = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  const pipeline: any[] = [
    { $match: matchFilter },
    { $unwind: "$items" },
  ];

  if (sellerObjectId) {
    pipeline.push({
      $match: { "items.seller": sellerObjectId },
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: "books",
        localField: "items.book",
        foreignField: "_id",
        as: "bookDoc",
      },
    },
    {
      $unwind: { path: "$bookDoc", preserveNullAndEmptyArrays: true },
    },
    {
      $unwind: { path: "$bookDoc.authors", preserveNullAndEmptyArrays: true },
    },
    {
      $lookup: {
        from: "authors",
        localField: "bookDoc.authors",
        foreignField: "_id",
        as: "authorDoc",
      },
    },
    {
      $unwind: { path: "$authorDoc", preserveNullAndEmptyArrays: true },
    },
    {
      $group: {
        _id: { $ifNull: ["$authorDoc._id", "unknown"] },
        authorId: { $first: { $ifNull: ["$authorDoc._id", null] } },
        name: { $first: { $ifNull: ["$authorDoc.name", "Unknown Author"] } },
        nameBn: { $first: { $ifNull: ["$authorDoc.nameBn", ""] } },
        slug: { $first: { $ifNull: ["$authorDoc.slug", "unknown"] } },
        photo: { $first: { $ifNull: ["$authorDoc.photo", ""] } },
        bio: { $first: { $ifNull: ["$authorDoc.bio", ""] } },
        booksSold: { $sum: "$items.quantity" },
        revenueInPaise: { $sum: "$items.subtotalInPaise" },
        orderCount: { $sum: 1 },
      },
    },
    {
      $sort: { booksSold: -1 },
    },
  );

  const rawAuthors = await OrderModel.aggregate(pipeline);

  let totalCopiesSold = 0;
  let totalRevenueInPaise = 0;

  for (const authorItem of rawAuthors) {
    totalCopiesSold += authorItem.booksSold;
    totalRevenueInPaise += authorItem.revenueInPaise;
  }

  const totalRevenueInRupees = Math.round(totalRevenueInPaise / 100);

  const topLimit = query.limit ?? 5;
  const topRawAuthors = rawAuthors.slice(0, topLimit);

  const items = topRawAuthors.map((authorItem, index) => {
    const rank = index + 1;
    const authorId = authorItem.authorId
      ? authorItem.authorId.toString()
      : "";
    const name = authorItem.name;
    const nameBn = authorItem.nameBn || "";
    const slug = authorItem.slug || "";
    const photo = authorItem.photo || "";
    const booksSold = authorItem.booksSold;
    const revenueInPaise = authorItem.revenueInPaise;
    const revenueInRupees = Math.round(revenueInPaise / 100);

    const percentage =
      totalCopiesSold > 0
        ? Number(((booksSold / totalCopiesSold) * 100).toFixed(1))
        : 0;

    return {
      rank,
      authorId,
      name,
      nameBn,
      slug,
      photo,
      booksSold,
      formattedBooksSold: `${booksSold.toLocaleString("en-IN")} sold`,
      percentage,
      formattedPercentage: `${percentage}%`,
      revenueInRupees,
      revenueInPaise,
    };
  });

  logger.info(
    {
      role: userContext.role,
      sellerId: sellerObjectId ? sellerObjectId.toString() : "all",
      timeframe,
      totalCopiesSold,
      activeAuthorsInCatalogCount,
      topAuthorsReturned: items.length,
    },
    "Top authors volume analytics computed successfully",
  );

  return {
    title: `Top ${topLimit} Authors by Sales`,
    subtitle: "TOP AUTHOR VOLUME",
    timeframe,
    limit: topLimit,
    activeAuthorsInCatalogCount,
    totalCopiesSold,
    formattedTotalCopiesSold: `${totalCopiesSold.toLocaleString("en-IN")} Total Copies Sold`,
    totalRevenueInRupees,
    totalRevenueInPaise,
    totalAuthorsWithSales: rawAuthors.length,
    items,
  };
};





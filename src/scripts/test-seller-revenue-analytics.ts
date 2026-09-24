import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import {
  UserModel,
  BookModel,
  BookListingModel,
  AuthorModel,
  PublisherModel,
  CategoryModel,
  OrderModel,
} from "../models/index.js";
import { logger } from "../utils/logger.js";
import { generateAccessToken } from "../utils/jwt.js";

const makeRequest = async (
  port: number,
  path: string,
  method = "GET",
  body?: Record<string, unknown>,
  token?: string,
) => {
  const payload = body ? JSON.stringify(body) : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (payload) {
    headers["Content-Length"] = Buffer.byteLength(payload).toString();
  }

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers,
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : null;
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: rawData });
          }
        });
      },
    );

    req.on("error", (err) => reject(err));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
};

const runRevenueAnalyticsTests = async () => {
  let server: http.Server | null = null;
  const cleanupUserIds: mongoose.Types.ObjectId[] = [];
  const cleanupListingIds: mongoose.Types.ObjectId[] = [];
  const cleanupBookIds: mongoose.Types.ObjectId[] = [];
  const cleanupAuthorIds: mongoose.Types.ObjectId[] = [];
  const cleanupPublisherIds: mongoose.Types.ObjectId[] = [];
  const cleanupCategoryIds: mongoose.Types.ObjectId[] = [];
  const cleanupOrderIds: mongoose.Types.ObjectId[] = [];

  try {
    console.log("\n=======================================================");
    console.log("   TEST SELLER MONEY ANALYTICS & REVENUE CARD API");
    console.log("=======================================================");

    logger.info("Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine server port");
    }
    const port = address.port;
    logger.info(`Test server listening on port ${port}`);

    const timestamp = Date.now();

    // 1. Create Test Users
    const sellerA = await UserModel.create({
      name: `Seller Alpha ${timestamp}`,
      email: `seller_rev_a_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(sellerA._id);

    const sellerB = await UserModel.create({
      name: `Seller Beta ${timestamp}`,
      email: `seller_rev_b_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(sellerB._id);

    const buyer = await UserModel.create({
      name: `Customer ${timestamp}`,
      email: `buyer_rev_${timestamp}@example.com`,
      password: "Password123!",
      role: "BUYER",
      isActive: true,
    });
    cleanupUserIds.push(buyer._id);

    const sellerAToken = generateAccessToken({
      sub: sellerA._id.toString(),
      role: "SELLER",
    });
    const buyerToken = generateAccessToken({
      sub: buyer._id.toString(),
      role: "BUYER",
    });

    // 2. Create catalog items
    const author = await AuthorModel.create({
      name: `Author ${timestamp}`,
      bio: "Analytics test author",
    });
    cleanupAuthorIds.push(author._id);

    const publisher = await PublisherModel.create({
      name: `Publisher ${timestamp}`,
      slug: `pub-${timestamp}`,
    });
    cleanupPublisherIds.push(publisher._id);

    const category = await CategoryModel.create({
      name: `Category ${timestamp}`,
      slug: `cat-${timestamp}`,
    });
    cleanupCategoryIds.push(category._id);

    // Book A (Seller A): 500 Rs
    const bookA = await BookModel.create({
      title: `Book Alpha ${timestamp}`,
      slug: `book-alpha-${timestamp}`,
      description: "Test description for Book Alpha",
      price: 500,
      priceIn: 500,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/alpha.jpg",
      createdBy: sellerA._id,
    });
    cleanupBookIds.push(bookA._id);

    const listingA = await BookListingModel.create({
      book: bookA._id,
      seller: sellerA._id,
      mrpInPaise: 60000,
      sellingPriceInPaise: 50000, // 500 Rs
      stock: 100,
      isActive: true,
    });
    cleanupListingIds.push(listingA._id);

    // Book B (Seller B): 1000 Rs
    const bookB = await BookModel.create({
      title: `Book Beta ${timestamp}`,
      slug: `book-beta-${timestamp}`,
      description: "Test description for Book Beta",
      price: 1000,
      priceIn: 1000,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/beta.jpg",
      createdBy: sellerB._id,
    });
    cleanupBookIds.push(bookB._id);

    const listingB = await BookListingModel.create({
      book: bookB._id,
      seller: sellerB._id,
      mrpInPaise: 120000,
      sellingPriceInPaise: 100000, // 1000 Rs
      stock: 100,
      isActive: true,
    });
    cleanupListingIds.push(listingB._id);

    // 3. Create Orders across time
    const now = new Date();

    // Order 1: TODAY (Multi-vendor: Seller A has 3 copies = 1500 Rs, Seller B has 2 copies = 2000 Rs -> Total = 3500 Rs)
    const todayOrder = await OrderModel.create({
      orderNumber: `ORD-${timestamp}-TODAY`,
      buyer: buyer._id,
      items: [
        {
          bookListing: listingA._id,
          book: bookA._id,
          seller: sellerA._id,
          title: bookA.title,
          coverImage: bookA.coverImage,
          priceInPaise: 50000,
          quantity: 3,
          subtotalInPaise: 150000, // Rs 1500 for Seller A
        },
        {
          bookListing: listingB._id,
          book: bookB._id,
          seller: sellerB._id,
          title: bookB.title,
          coverImage: bookB.coverImage,
          priceInPaise: 100000,
          quantity: 2,
          subtotalInPaise: 200000, // Rs 2000 for Seller B
        },
      ],
      subtotalInPaise: 350000,
      deliveryChargeInPaise: 0,
      couponDiscountInPaise: 0,
      totalAmountInPaise: 350000,
      paymentMethod: "ONLINE_PAY",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: buyer.name,
        mobileNumber: "9876543210",
        street: "123 Street",
        city: "Dhaka",
        postalCode: "1200",
        country: "Bangladesh",
      },
      createdAt: now,
    });
    cleanupOrderIds.push(todayOrder._id);

    // Order 2: PREVIOUS MONTH (Seller A: 2 copies = 1000 Rs)
    const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12, 0, 0));
    const prevMonthOrder = await OrderModel.create({
      orderNumber: `ORD-${timestamp}-PREVMONTH`,
      buyer: buyer._id,
      items: [
        {
          bookListing: listingA._id,
          book: bookA._id,
          seller: sellerA._id,
          title: bookA.title,
          coverImage: bookA.coverImage,
          priceInPaise: 50000,
          quantity: 2,
          subtotalInPaise: 100000, // Rs 1000 for Seller A
        },
      ],
      subtotalInPaise: 100000,
      deliveryChargeInPaise: 0,
      couponDiscountInPaise: 0,
      totalAmountInPaise: 100000,
      paymentMethod: "ONLINE_PAY",
      orderStatus: "DELIVERED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: buyer.name,
        mobileNumber: "9876543210",
        street: "123 Street",
        city: "Dhaka",
        postalCode: "1200",
        country: "Bangladesh",
      },
      createdAt: prevMonthDate,
    });
    cleanupOrderIds.push(prevMonthOrder._id);

    // =======================================================
    // Test 1: Unauthenticated request -> 401
    // =======================================================
    console.log("\n[Test 1] GET /api/v1/dashboard/revenue-analytics without token -> Expect 401");
    const res1 = await makeRequest(port, "/api/v1/dashboard/revenue-analytics", "GET");
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 401) {
      throw new Error(`Expected 401, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthenticated request rejected with 401");

    // =======================================================
    // Test 2: BUYER role -> 403 Forbidden
    // =======================================================
    console.log("\n[Test 2] GET /api/v1/dashboard/revenue-analytics with BUYER token -> Expect 403");
    const res2 = await makeRequest(
      port,
      "/api/v1/dashboard/revenue-analytics",
      "GET",
      undefined,
      buyerToken,
    );
    console.log(`Status: ${res2.status}`);
    if (res2.status !== 403) {
      throw new Error(`Expected 403, got ${res2.status}`);
    }
    console.log("✅ Test 2 Passed: BUYER token rejected with 403");

    // =======================================================
    // Test 3: Seller A Monthly Analytics Verification
    // Current month revenue: 1500 Rs, Previous month: 1000 Rs
    // Difference: +500 Rs, Growth: +50.0%
    // =======================================================
    console.log("\n[Test 3] GET /api/v1/dashboard/revenue-analytics?timeframe=monthly as Seller A");
    const res3 = await makeRequest(
      port,
      "/api/v1/dashboard/revenue-analytics?timeframe=monthly",
      "GET",
      undefined,
      sellerAToken,
    );
    console.log(`Status: ${res3.status}`);
    console.log("Response data:", JSON.stringify(res3.body?.data, null, 2));

    if (res3.status !== 200) {
      throw new Error(`Expected 200, got ${res3.status}`);
    }

    const data = res3.body?.data;

    // Check Main Revenue: Must be 1500 Rs (150000 paise) for Seller A (NOT 3500 Rs grand order total)
    if (data.main.totalRevenueInRupees !== 1500 || data.main.totalRevenueInPaise !== 150000) {
      throw new Error(`Expected 1500 Rs total revenue, got ${data.main.totalRevenueInRupees}`);
    }

    // Check Previous Period Revenue: 1000 Rs
    if (data.main.previousPeriodRevenueInRupees !== 1000) {
      throw new Error(`Expected 1000 Rs previous period revenue, got ${data.main.previousPeriodRevenueInRupees}`);
    }

    // Check Growth Percentage: 50.0%
    if (data.main.growthPercentage !== 50.0 || !data.main.isGrowthPositive) {
      throw new Error(`Expected 50% growth, got ${data.main.growthPercentage}`);
    }

    // Check Today Revenue: 1500 Rs
    if (data.today.todayRevenueInRupees !== 1500 || data.today.todayOrdersCount !== 1) {
      throw new Error(`Expected today revenue 1500 Rs and 1 order, got ${JSON.stringify(data.today)}`);
    }

    // Check Metrics (AOV, Total Orders)
    if (data.metrics.totalOrders !== 1 || data.metrics.avgOrderValueInRupees !== 1500) {
      throw new Error(`Expected 1 order with 1500 AOV, got ${JSON.stringify(data.metrics)}`);
    }

    // Check Trend points (7 days)
    if (!Array.isArray(data.trend.points) || data.trend.points.length !== 7) {
      throw new Error(`Expected 7 trend points, got ${data.trend.points?.length}`);
    }

    console.log("✅ Test 3 Passed: Seller A monthly revenue correctly calculated with 50% growth & multi-vendor isolation");

    // =======================================================
    // Test 4: Yearly Timeframe Verification
    // =======================================================
    console.log("\n[Test 4] GET /api/v1/dashboard/revenue-analytics?timeframe=yearly");
    const res4 = await makeRequest(
      port,
      "/api/v1/dashboard/revenue-analytics?timeframe=yearly",
      "GET",
      undefined,
      sellerAToken,
    );
    console.log(`Status: ${res4.status}`);

    if (res4.status !== 200 || res4.body?.data?.trend?.points?.length !== 12) {
      throw new Error("Expected 12 monthly trend points for yearly timeframe");
    }
    console.log("✅ Test 4 Passed: Yearly timeframe returns 12 month trend points");

    // =======================================================
    // Test 5: Weekly Timeframe Verification
    // =======================================================
    console.log("\n[Test 5] GET /api/v1/dashboard/revenue-analytics?timeframe=weekly");
    const res5 = await makeRequest(
      port,
      "/api/v1/dashboard/revenue-analytics?timeframe=weekly",
      "GET",
      undefined,
      sellerAToken,
    );
    console.log(`Status: ${res5.status}`);

    if (res5.status !== 200 || res5.body?.data?.trend?.points?.length !== 7) {
      throw new Error("Expected 7 trend points for weekly timeframe");
    }
    console.log("✅ Test 5 Passed: Weekly timeframe returns 7 daily points");

    console.log("\n=======================================================");
    console.log("   🎉 ALL 5 REVENUE ANALYTICS TESTS PASSED! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Revenue analytics test suite failed");
    console.error("❌ Test error:", error);
    process.exit(1);
  } finally {
    if (cleanupOrderIds.length > 0) {
      await OrderModel.deleteMany({ _id: { $in: cleanupOrderIds } });
    }
    if (cleanupListingIds.length > 0) {
      await BookListingModel.deleteMany({ _id: { $in: cleanupListingIds } });
    }
    if (cleanupBookIds.length > 0) {
      await BookModel.deleteMany({ _id: { $in: cleanupBookIds } });
    }
    if (cleanupAuthorIds.length > 0) {
      await AuthorModel.deleteMany({ _id: { $in: cleanupAuthorIds } });
    }
    if (cleanupPublisherIds.length > 0) {
      await PublisherModel.deleteMany({ _id: { $in: cleanupPublisherIds } });
    }
    if (cleanupCategoryIds.length > 0) {
      await CategoryModel.deleteMany({ _id: { $in: cleanupCategoryIds } });
    }
    if (cleanupUserIds.length > 0) {
      await UserModel.deleteMany({ _id: { $in: cleanupUserIds } });
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void runRevenueAnalyticsTests();

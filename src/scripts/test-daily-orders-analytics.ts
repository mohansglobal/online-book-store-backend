import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import { OrderModel } from "../models/order.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import { BookModel } from "../models/book.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CategoryModel } from "../models/category.model.js";
import { UserModel } from "../models/user.model.js";
import { generateAccessToken } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";

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

const runDailyOrdersAnalyticsTests = async () => {
  let server: http.Server | null = null;
  const cleanupOrderIds: mongoose.Types.ObjectId[] = [];
  const cleanupListingIds: mongoose.Types.ObjectId[] = [];
  const cleanupBookIds: mongoose.Types.ObjectId[] = [];
  const cleanupAuthorIds: mongoose.Types.ObjectId[] = [];
  const cleanupPublisherIds: mongoose.Types.ObjectId[] = [];
  const cleanupCategoryIds: mongoose.Types.ObjectId[] = [];
  const cleanupUserIds: mongoose.Types.ObjectId[] = [];

  try {
   

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

    // Create test IDs and users
    const sellerId = new mongoose.Types.ObjectId();
    const buyerId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();

    cleanupUserIds.push(sellerId, buyerId, adminId);

    const sellerToken = generateAccessToken({
      sub: sellerId.toString(),
      role: "SELLER",
    });
    const buyerToken = generateAccessToken({
      sub: buyerId.toString(),
      role: "BUYER",
    });
    const adminToken = generateAccessToken({
      sub: adminId.toString(),
      role: "ADMIN",
    });

    // Test 1: Unauthenticated request -> Expect 401
    console.log("\n[Test 1] GET /api/v1/dashboard/daily-orders without token -> Expect 401");
    const res1 = await makeRequest(port, "/api/v1/dashboard/daily-orders", "GET");
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 401) {
      throw new Error(`Expected 401, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthenticated request rejected with 401");

    // Test 2: Authenticated with BUYER role -> Expect 403
    console.log("\n[Test 2] GET /api/v1/dashboard/daily-orders with BUYER token -> Expect 403");
    const res2 = await makeRequest(
      port,
      "/api/v1/dashboard/daily-orders",
      "GET",
      undefined,
      buyerToken,
    );
    console.log(`Status: ${res2.status}`);
    if (res2.status !== 403) {
      throw new Error(`Expected 403, got ${res2.status}`);
    }
    console.log("✅ Test 2 Passed: BUYER role rejected with 403");

    // Test 3: Authenticated with SELLER token (empty orders state) -> Expect 200
    console.log("\n[Test 3] GET /api/v1/dashboard/daily-orders with SELLER token (empty state) -> Expect 200");
    const res3 = await makeRequest(
      port,
      "/api/v1/dashboard/daily-orders",
      "GET",
      undefined,
      sellerToken,
    );
    console.log(`Status: ${res3.status}`);
    console.log("Response structure:", res3.body?.data?.main);
    if (res3.status !== 200 || !res3.body?.data) {
      throw new Error(`Expected 200 with data, got ${res3.status}`);
    }
    const emptyData = res3.body.data;
    if (
      emptyData.main.averageDailyOrders !== 0 ||
      emptyData.main.totalOrders !== 0 ||
      emptyData.currentPeriod.days.length !== 7
    ) {
      throw new Error("Empty state response did not match expected structure");
    }
    console.log("✅ Test 3 Passed: Empty state returns correct 7-day structure");

    // Setup dummy book listing for orders
    const author = await AuthorModel.create({
      name: "Daily Orders Author",
      slug: `daily-orders-author-${Date.now()}`,
    });
    cleanupAuthorIds.push(author._id);

    const publisher = await PublisherModel.create({
      name: "Daily Orders Publisher",
      slug: `daily-orders-publisher-${Date.now()}`,
    });
    cleanupPublisherIds.push(publisher._id);

    const category = await CategoryModel.create({
      name: "Daily Orders Category",
      slug: `daily-orders-cat-${Date.now()}`,
    });
    cleanupCategoryIds.push(category._id);

    const book = await BookModel.create({
      title: "Daily Orders Book",
      slug: `daily-orders-book-${Date.now()}`,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      description: "Test description",
      coverImage: "https://example.com/cover.jpg",
      createdBy: sellerId,
    });
    cleanupBookIds.push(book._id);

    const listing = await BookListingModel.create({
      book: book._id,
      seller: sellerId,
      mrpInPaise: 50000,
      sellingPriceInPaise: 40000,
      stock: 500,
    });
    cleanupListingIds.push(listing._id);

    // Create test orders:
    // Last 7 days:
    // - 2 days ago: 5 orders (e.g. 5 orders * 40000 = 200000 paise)
    // - 1 day ago: 10 orders (Peak day, 10 orders * 40000 = 400000 paise)
    // - 3 days ago: 3 orders (3 orders * 40000 = 120000 paise)
    // Total last 7 days = 18 orders, Avg daily = 18 / 7 = 2.6
    //
    // Previous 7-day period (8 to 14 days ago):
    // - 9 days ago: 8 orders (8 * 40000 = 320000 paise)
    // Total previous 7 days = 8 orders, Avg daily = 8 / 7 = 1.1
    // Growth = ((18 - 8) / 8) * 100 = +125%

    const now = new Date();

    const createTestOrder = async (daysAgo: number, count: number) => {
      const orderDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      for (let i = 0; i < count; i++) {
        const order = await OrderModel.create({
          orderNumber: `ORD-TEST-${daysAgo}-${i}-${Date.now()}`,
          buyer: buyerId,
          items: [
            {
              bookListing: listing._id,
              book: book._id,
              seller: sellerId,
              title: book.title,
              priceInPaise: 40000,
              quantity: 1,
              subtotalInPaise: 40000,
            },
          ],
          totalAmountInPaise: 40000,
          paymentStatus: "PAID",
          orderStatus: "DELIVERED",
          paymentMethod: "ONLINE_PAY",
          shippingAddress: {
            fullName: "Test Customer",
            email: "customer@example.com",
            mobileNumber: "+919876543210",
            addressLine1: "123 Test St",
            city: "Kolkata",
            state: "West Bengal",
            postalCode: "700001",
            country: "India",
          },
          createdAt: orderDate,
          updatedAt: orderDate,
        });
        cleanupOrderIds.push(order._id);
      }
    };

    console.log("\nSeeding test orders across last 7 days and previous 7 days...");
    await createTestOrder(1, 10); // 1 day ago: 10 orders (Peak)
    await createTestOrder(2, 5);  // 2 days ago: 5 orders
    await createTestOrder(3, 3);  // 3 days ago: 3 orders
    await createTestOrder(9, 8);  // 9 days ago (previous 7-day period): 8 orders
    console.log("Seeded 26 test orders successfully.");

    // Test 4: GET /api/v1/dashboard/daily-orders with SELLER token
    console.log("\n[Test 4] GET /api/v1/dashboard/daily-orders -> Verify calculations");
    const res4 = await makeRequest(
      port,
      "/api/v1/dashboard/daily-orders",
      "GET",
      undefined,
      sellerToken,
    );
    console.log(`Status: ${res4.status}`);
    console.log("Main metrics:", res4.body?.data?.main);
    console.log("Peak info:", res4.body?.data?.peak);
    console.log("Comparison:", res4.body?.data?.comparison);

    if (res4.status !== 200 || !res4.body?.data) {
      throw new Error(`Expected 200 with data, got ${res4.status}`);
    }

    const analytics = res4.body.data;

    // Verify current 7-day total and average
    if (analytics.main.totalOrders !== 18) {
      throw new Error(`Expected totalOrders to be 18, got ${analytics.main.totalOrders}`);
    }

    if (analytics.main.averageDailyOrders !== 2.6) {
      throw new Error(
        `Expected averageDailyOrders to be 2.6, got ${analytics.main.averageDailyOrders}`,
      );
    }

    // Verify previous period
    if (analytics.previousPeriod.totalOrders !== 8) {
      throw new Error(
        `Expected previousPeriod.totalOrders to be 8, got ${analytics.previousPeriod.totalOrders}`,
      );
    }

    // Verify growth percentage: ((18 - 8) / 8) * 100 = 125%
    if (analytics.main.growthPercentage !== 125) {
      throw new Error(
        `Expected growthPercentage to be 125, got ${analytics.main.growthPercentage}`,
      );
    }

    if (analytics.main.isGrowthPositive !== true) {
      throw new Error("Expected isGrowthPositive to be true");
    }

    if (analytics.main.formattedGrowth !== "+125%") {
      throw new Error(
        `Expected formattedGrowth to be "+125%", got "${analytics.main.formattedGrowth}"`,
      );
    }

    // Verify peak day is 10 orders
    if (analytics.peak.orders !== 10) {
      throw new Error(`Expected peak orders to be 10, got ${analytics.peak.orders}`);
    }

    const peakInDays = analytics.currentPeriod.days.find((d: any) => d.isPeak);
    if (!peakInDays || peakInDays.orders !== 10) {
      throw new Error("Peak day flag was not set correctly in days array");
    }

    console.log("✅ Test 4 Passed: 7-day average daily orders, peak day, and growth calculated accurately");

    // Test 5: GET /api/v1/dashboard/average-daily-orders alias
    console.log("\n[Test 5] GET /api/v1/dashboard/average-daily-orders alias -> Expect 200 OK");
    const res5 = await makeRequest(
      port,
      "/api/v1/dashboard/average-daily-orders",
      "GET",
      undefined,
      sellerToken,
    );
    if (res5.status !== 200 || res5.body?.data?.main?.totalOrders !== 18) {
      throw new Error(`Expected status 200 with 18 orders, got ${res5.status}`);
    }
    console.log("✅ Test 5 Passed: Alias route /average-daily-orders works identically");

    console.log("\n=======================================================");
    console.log("   🎉 ALL DAILY ORDERS ANALYTICS TESTS PASSED! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Test suite failed");
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

void runDailyOrdersAnalyticsTests();

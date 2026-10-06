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

const runOrderHealthAnalyticsTests = async () => {
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
    console.log("   TEST ADMIN ORDER HEALTH ANALYTICS API");
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
    const adminUser = await UserModel.create({
      name: `test_admin_${timestamp}`,
      email: `test_admin_${timestamp}@example.com`,
      password: "Password123!",
      role: "ADMIN",
      isActive: true,
    });
    cleanupUserIds.push(adminUser._id);

    const sellerUser = await UserModel.create({
      name: `test_seller_${timestamp}`,
      email: `test_seller_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(sellerUser._id);

    const buyerUser = await UserModel.create({
      name: `test_buyer_${timestamp}`,
      email: `test_buyer_${timestamp}@example.com`,
      password: "Password123!",
      role: "BUYER",
      isActive: true,
    });
    cleanupUserIds.push(buyerUser._id);

    const adminToken = generateAccessToken({
      sub: adminUser._id.toString(),
      role: "ADMIN",
    });

    const sellerToken = generateAccessToken({
      sub: sellerUser._id.toString(),
      role: "SELLER",
    });

    const buyerToken = generateAccessToken({
      sub: buyerUser._id.toString(),
      role: "BUYER",
    });

    // 2. Create catalog items
    const author = await AuthorModel.create({
      name: `test_author_${timestamp}`,
      bio: "Test author bio",
    });
    cleanupAuthorIds.push(author._id);

    const publisher = await PublisherModel.create({
      name: `test_publisher_${timestamp}`,
      slug: `test-publisher-${timestamp}`,
    });
    cleanupPublisherIds.push(publisher._id);

    const category = await CategoryModel.create({
      name: `test_category_${timestamp}`,
      slug: `test-cat-${timestamp}`,
    });
    cleanupCategoryIds.push(category._id);

    const book = await BookModel.create({
      title: `[TEST] Book for Order Health ${timestamp}`,
      slug: `test-book-${timestamp}`,
      description: "Test book description for admin order health",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      language: "English",
      isbn: `978${timestamp.toString().slice(-10)}`,
      createdBy: sellerUser._id,
    });
    cleanupBookIds.push(book._id);

    const listing = await BookListingModel.create({
      book: book._id,
      seller: sellerUser._id,
      mrpInPaise: 50000,
      sellingPriceInPaise: 40000,
      stock: 100,
      isActive: true,
    });
    cleanupListingIds.push(listing._id as mongoose.Types.ObjectId);

    // 3. Create test orders with known metrics
    const now = new Date();

    // Order 1: Delivered, created 5 days ago, shipped 2 days ago (dispatch duration: 3 days)
    const order1CreatedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const order1ShippedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const order1DeliveredAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    const order1 = await OrderModel.create({
      orderNumber: `ORD-TEST-HEALTH-1-${timestamp}`,
      buyer: buyerUser._id,
      items: [
        {
          bookListing: listing._id,
          book: book._id,
          seller: sellerUser._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
          status: "DELIVERED",
          tracking: {
            courier: "BlueDart",
            trackingNumber: `TRK-1-${timestamp}`,
            shippedAt: order1ShippedAt,
            deliveredAt: order1DeliveredAt,
          },
        },
      ],
      totalAmountInPaise: 40000,
      orderStatus: "DELIVERED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: "Test Customer",
        mobileNumber: "9876543210",
        street: "123 Test St",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
      createdAt: order1CreatedAt,
    });
    cleanupOrderIds.push(order1._id);

    // Order 2: Delivered, created 4 days ago, shipped 2 days ago (dispatch duration: 2 days)
    const order2CreatedAt = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    const order2ShippedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const order2 = await OrderModel.create({
      orderNumber: `ORD-TEST-HEALTH-2-${timestamp}`,
      buyer: buyerUser._id,
      items: [
        {
          bookListing: listing._id,
          book: book._id,
          seller: sellerUser._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
          status: "DELIVERED",
          tracking: {
            courier: "Delhivery",
            trackingNumber: `TRK-2-${timestamp}`,
            shippedAt: order2ShippedAt,
            deliveredAt: now,
          },
        },
      ],
      totalAmountInPaise: 40000,
      orderStatus: "DELIVERED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: "Test Customer",
        mobileNumber: "9876543210",
        street: "123 Test St",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
      createdAt: order2CreatedAt,
    });
    cleanupOrderIds.push(order2._id);

    // Order 3: Cancelled, created 3 days ago (in current week)
    const order3CreatedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const order3 = await OrderModel.create({
      orderNumber: `ORD-TEST-HEALTH-3-${timestamp}`,
      buyer: buyerUser._id,
      items: [
        {
          bookListing: listing._id,
          book: book._id,
          seller: sellerUser._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
          status: "CANCELLED",
        },
      ],
      totalAmountInPaise: 40000,
      orderStatus: "CANCELLED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: "Test Customer",
        mobileNumber: "9876543210",
        street: "123 Test St",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
      createdAt: order3CreatedAt,
    });
    cleanupOrderIds.push(order3._id);

    // Order 4: Failed payment, created 2 days ago
    const order4CreatedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const order4 = await OrderModel.create({
      orderNumber: `ORD-TEST-HEALTH-4-${timestamp}`,
      buyer: buyerUser._id,
      items: [
        {
          bookListing: listing._id,
          book: book._id,
          seller: sellerUser._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
          status: "PENDING",
        },
      ],
      totalAmountInPaise: 40000,
      orderStatus: "PENDING",
      paymentStatus: "FAILED",
      shippingAddress: {
        fullName: "Test Customer",
        mobileNumber: "9876543210",
        street: "123 Test St",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
      createdAt: order4CreatedAt,
    });
    cleanupOrderIds.push(order4._id);

    // Order 5: Processing (In-flight), created 1 day ago
    const order5CreatedAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const order5 = await OrderModel.create({
      orderNumber: `ORD-TEST-HEALTH-5-${timestamp}`,
      buyer: buyerUser._id,
      items: [
        {
          bookListing: listing._id,
          book: book._id,
          seller: sellerUser._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
          status: "PROCESSING",
        },
      ],
      totalAmountInPaise: 40000,
      orderStatus: "PROCESSING",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: "Test Customer",
        mobileNumber: "9876543210",
        street: "123 Test St",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
      createdAt: order5CreatedAt,
    });
    cleanupOrderIds.push(order5._id);

    // Order 6: Cancelled, created 10 days ago (prior week window)
    const order6CreatedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const order6 = await OrderModel.create({
      orderNumber: `ORD-TEST-HEALTH-6-${timestamp}`,
      buyer: buyerUser._id,
      items: [
        {
          bookListing: listing._id,
          book: book._id,
          seller: sellerUser._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
          status: "CANCELLED",
        },
      ],
      totalAmountInPaise: 40000,
      orderStatus: "CANCELLED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: "Test Customer",
        mobileNumber: "9876543210",
        street: "123 Test St",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
      },
      createdAt: order6CreatedAt,
    });
    cleanupOrderIds.push(order6._id);

    // 4. Verification Test Cases

    // Test 1: Unauthenticated request should fail with 401
    console.log("\n[Test 1] Testing unauthenticated access rejection...");
    const unauthRes = await makeRequest(
      port,
      "/api/v1/dashboard/admin/order-health",
      "GET",
    );
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
    }
    console.log("✓ Unauthenticated request rejected with 401 Unauthorized");

    // Test 2: Non-admin (Seller) request should fail with 403 Forbidden
    console.log("\n[Test 2] Testing non-admin (Seller) access rejection...");
    const sellerRes = await makeRequest(
      port,
      "/api/v1/dashboard/admin/order-health",
      "GET",
      undefined,
      sellerToken,
    );
    if (sellerRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for Seller, got ${sellerRes.status}`);
    }
    console.log("✓ Non-admin request rejected with 403 Forbidden");

    // Test 3: Non-admin (Buyer) request should fail with 403 Forbidden
    console.log("\n[Test 3] Testing non-admin (Buyer) access rejection...");
    const buyerRes = await makeRequest(
      port,
      "/api/v1/dashboard/admin/order-health",
      "GET",
      undefined,
      buyerToken,
    );
    if (buyerRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for Buyer, got ${buyerRes.status}`);
    }
    console.log("✓ Non-admin (Buyer) request rejected with 403 Forbidden");

    // Test 4: Admin request via /api/v1/dashboard/admin/order-health
    console.log("\n[Test 4] Testing admin order health retrieval...");
    const adminRes = await makeRequest(
      port,
      "/api/v1/dashboard/admin/order-health",
      "GET",
      undefined,
      adminToken,
    );

    if (adminRes.status !== 200) {
      throw new Error(`Expected 200 OK for Admin, got ${adminRes.status}: ${JSON.stringify(adminRes.body)}`);
    }

    const healthData = adminRes.body.data;
    console.log("Received Order Health Data:", JSON.stringify(healthData, null, 2));

    // Assertions on all 6 key metrics
    if (typeof healthData.totalOrders !== "number" || healthData.totalOrders < 6) {
      throw new Error(`Invalid totalOrders: ${healthData.totalOrders}`);
    }
    console.log(`✓ Metric 1: Total Orders verified (${healthData.totalOrders} total orders)`);

    if (
      typeof healthData.delivered.percentage !== "number" ||
      !healthData.delivered.formatted.includes("%")
    ) {
      throw new Error(`Invalid delivered metric: ${JSON.stringify(healthData.delivered)}`);
    }
    console.log(`✓ Metric 2: Delivered rate verified (${healthData.delivered.formatted} delivered)`);

    if (
      typeof healthData.cancelled.percentage !== "number" ||
      !healthData.cancelled.formatted.includes("%")
    ) {
      throw new Error(`Invalid cancelled metric: ${JSON.stringify(healthData.cancelled)}`);
    }
    console.log(`✓ Metric 3: Cancelled rate verified (${healthData.cancelled.formatted} cancelled)`);

    if (
      typeof healthData.failed.percentage !== "number" ||
      !healthData.failed.formatted.includes("%")
    ) {
      throw new Error(`Invalid failed metric: ${JSON.stringify(healthData.failed)}`);
    }
    console.log(`✓ Metric 4: Failed rate verified (${healthData.failed.formatted} failed)`);

    if (
      typeof healthData.avgDispatchTime.days !== "number" ||
      !healthData.avgDispatchTime.formatted.includes("days avg. dispatch time")
    ) {
      throw new Error(`Invalid avgDispatchTime: ${JSON.stringify(healthData.avgDispatchTime)}`);
    }
    console.log(`✓ Metric 5: Avg Dispatch Time verified (${healthData.avgDispatchTime.formatted})`);

    if (
      typeof healthData.cancellationTrend.percentage !== "number" ||
      !healthData.cancellationTrend.formatted.includes("cancellations vs last week")
    ) {
      throw new Error(`Invalid cancellationTrend: ${JSON.stringify(healthData.cancellationTrend)}`);
    }
    console.log(`✓ Metric 6: Cancellation trend verified (${healthData.cancellationTrend.formatted})`);

    // Test 5: Verify route alias /api/v1/dashboard/order-health
    console.log("\n[Test 5] Testing route alias /api/v1/dashboard/order-health...");
    const aliasRes = await makeRequest(
      port,
      "/api/v1/dashboard/order-health",
      "GET",
      undefined,
      adminToken,
    );
    if (aliasRes.status !== 200) {
      throw new Error(`Expected 200 OK on alias route, got ${aliasRes.status}`);
    }
    console.log("✓ Route alias /api/v1/dashboard/order-health verified successfully");

    // Test 6: Verify timeframe query filter (e.g. timeframe=7d)
    console.log("\n[Test 6] Testing timeframe query parameter (timeframe=7d)...");
    const filterRes = await makeRequest(
      port,
      "/api/v1/dashboard/admin/order-health?timeframe=7d",
      "GET",
      undefined,
      adminToken,
    );
    if (filterRes.status !== 200) {
      throw new Error(`Expected 200 OK on timeframe filter, got ${filterRes.status}`);
    }
    if (filterRes.body.data.timeframe !== "7d") {
      throw new Error(`Expected timeframe '7d', got ${filterRes.body.data.timeframe}`);
    }
    console.log("✓ Timeframe filter parameter verified successfully");

    console.log("\n=======================================================");
    console.log("   ALL ORDER HEALTH ANALYTICS TESTS PASSED SUCCESSFULLY!");
    console.log("=======================================================\n");
  } finally {
    console.log("\nCleaning up test data (Rule 33 mandatory cleanup)...");
    if (cleanupOrderIds.length > 0) {
      await OrderModel.deleteMany({ _id: { $in: cleanupOrderIds } });
      console.log(`Deleted ${cleanupOrderIds.length} test orders`);
    }
    if (cleanupListingIds.length > 0) {
      await BookListingModel.deleteMany({ _id: { $in: cleanupListingIds } });
      console.log(`Deleted ${cleanupListingIds.length} test listings`);
    }
    if (cleanupBookIds.length > 0) {
      await BookModel.deleteMany({ _id: { $in: cleanupBookIds } });
      console.log(`Deleted ${cleanupBookIds.length} test books`);
    }
    if (cleanupAuthorIds.length > 0) {
      await AuthorModel.deleteMany({ _id: { $in: cleanupAuthorIds } });
      console.log(`Deleted ${cleanupAuthorIds.length} test authors`);
    }
    if (cleanupPublisherIds.length > 0) {
      await PublisherModel.deleteMany({ _id: { $in: cleanupPublisherIds } });
      console.log(`Deleted ${cleanupPublisherIds.length} test publishers`);
    }
    if (cleanupCategoryIds.length > 0) {
      await CategoryModel.deleteMany({ _id: { $in: cleanupCategoryIds } });
      console.log(`Deleted ${cleanupCategoryIds.length} test categories`);
    }
    if (cleanupUserIds.length > 0) {
      await UserModel.deleteMany({ _id: { $in: cleanupUserIds } });
      console.log(`Deleted ${cleanupUserIds.length} test users`);
    }

    if (server) {
      server.close();
    }
    await mongoose.disconnect();
    console.log("Mongoose disconnected and server closed cleanly.");
  }
};

runOrderHealthAnalyticsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

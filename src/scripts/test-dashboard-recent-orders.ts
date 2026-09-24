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

const runDashboardRecentOrdersTests = async () => {
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
    console.log("   TEST SELLER DASHBOARD RECENT ORDERS API");
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
      email: `seller_a_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(sellerA._id);

    const sellerB = await UserModel.create({
      name: `Seller Beta ${timestamp}`,
      email: `seller_b_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(sellerB._id);

    const buyer = await UserModel.create({
      name: `Alice Reader ${timestamp}`,
      email: `buyer_${timestamp}@example.com`,
      password: "Password123!",
      role: "BUYER",
      profilePicture: "https://example.com/avatar-alice.jpg",
      mobileNumber: `987${timestamp.toString().slice(-7)}`,
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
      bio: "Dashboard test author",
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

    // Book A (Seller A): 200 Rs (20000 paise)
    const bookA = await BookModel.create({
      title: `Seller A Book ${timestamp}`,
      slug: `book-a-${timestamp}`,
      description: "Book for Seller A",
      price: 200,
      priceIn: 200,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/coverA.jpg",
      createdBy: sellerA._id,
    });
    cleanupBookIds.push(bookA._id);

    const listingA = await BookListingModel.create({
      book: bookA._id,
      seller: sellerA._id,
      mrpInPaise: 30000,
      sellingPriceInPaise: 20000, // 200 Rs
      stock: 50,
      isActive: true,
    });
    cleanupListingIds.push(listingA._id);

    // Book B (Seller B): 600 Rs (60000 paise)
    const bookB = await BookModel.create({
      title: `Seller B Book ${timestamp}`,
      slug: `book-b-${timestamp}`,
      description: "Book for Seller B",
      price: 600,
      priceIn: 600,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/coverB.jpg",
      createdBy: sellerB._id,
    });
    cleanupBookIds.push(bookB._id);

    const listingB = await BookListingModel.create({
      book: bookB._id,
      seller: sellerB._id,
      mrpInPaise: 70000,
      sellingPriceInPaise: 60000, // 600 Rs
      stock: 50,
      isActive: true,
    });
    cleanupListingIds.push(listingB._id);

    // 3. Create Multi-vendor Order:
    // Seller A: 2 copies @ 200 Rs = 400 Rs (40000 paise)
    // Seller B: 1 copy @ 600 Rs = 600 Rs (60000 paise)
    // Total Order = 1000 Rs (100000 paise)
    const orderDate = new Date();
    const currentMonthLabel = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, "0")}`;

    const multiVendorOrder = await OrderModel.create({
      orderNumber: `ORD-${timestamp}-MULTI`,
      buyer: buyer._id,
      items: [
        {
          bookListing: listingA._id,
          book: bookA._id,
          seller: sellerA._id,
          title: bookA.title,
          coverImage: bookA.coverImage,
          priceInPaise: 20000,
          quantity: 2,
          subtotalInPaise: 40000, // Rs 400
        },
        {
          bookListing: listingB._id,
          book: bookB._id,
          seller: sellerB._id,
          title: bookB.title,
          coverImage: bookB.coverImage,
          priceInPaise: 60000,
          quantity: 1,
          subtotalInPaise: 60000, // Rs 600
        },
      ],
      subtotalInPaise: 100000,
      deliveryChargeInPaise: 0,
      couponDiscountInPaise: 0,
      totalAmountInPaise: 100000, // Total Rs 1000
      paymentMethod: "ONLINE_PAY",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: buyer.name,
        email: buyer.email,
        mobileNumber: buyer.mobileNumber || "9876543210",
        street: "123 Main St",
        city: "Dhaka",
        postalCode: "1200",
        country: "Bangladesh",
      },
      createdAt: orderDate,
    });
    cleanupOrderIds.push(multiVendorOrder._id);

    // Create a second order with only Seller A's items
    const singleVendorOrder = await OrderModel.create({
      orderNumber: `ORD-${timestamp}-SINGLE`,
      buyer: buyer._id,
      items: [
        {
          bookListing: listingA._id,
          book: bookA._id,
          seller: sellerA._id,
          title: bookA.title,
          coverImage: bookA.coverImage,
          priceInPaise: 20000,
          quantity: 1,
          subtotalInPaise: 20000, // Rs 200
        },
      ],
      subtotalInPaise: 20000,
      deliveryChargeInPaise: 0,
      couponDiscountInPaise: 0,
      totalAmountInPaise: 20000,
      paymentMethod: "CASH_ON_DELIVERY",
      orderStatus: "PROCESSING",
      paymentStatus: "PENDING",
      shippingAddress: {
        fullName: buyer.name,
        email: buyer.email,
        mobileNumber: buyer.mobileNumber || "9876543210",
        street: "123 Main St",
        city: "Dhaka",
        postalCode: "1200",
        country: "Bangladesh",
      },
      createdAt: new Date(orderDate.getTime() + 1000),
    });
    cleanupOrderIds.push(singleVendorOrder._id);

    // =======================================================
    // Test 1: Unauthenticated request -> 401
    // =======================================================
    console.log("\n[Test 1] GET /api/v1/dashboard/recent-orders without token -> Expect 401");
    const res1 = await makeRequest(port, "/api/v1/dashboard/recent-orders", "GET");
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 401) {
      throw new Error(`Expected 401, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthenticated request rejected with 401");

    // =======================================================
    // Test 2: BUYER role -> 403 Forbidden
    // =======================================================
    console.log("\n[Test 2] GET /api/v1/dashboard/recent-orders with BUYER token -> Expect 403");
    const res2 = await makeRequest(
      port,
      "/api/v1/dashboard/recent-orders",
      "GET",
      undefined,
      buyerToken,
    );
    console.log(`Status: ${res2.status}`);
    if (res2.status !== 403) {
      throw new Error(`Expected 403, got ${res2.status}`);
    }
    console.log("✅ Test 2 Passed: BUYER role rejected with 403");

    // =======================================================
    // Test 3: Seller A queries recent orders -> Verify Seller-specific calculation
    // Total order was 1000 Rs, but Seller A must only see 400 Rs!
    // =======================================================
    console.log("\n[Test 3] GET /api/v1/dashboard/recent-orders as Seller A -> Verify Seller-specific amounts");
    const res3 = await makeRequest(
      port,
      "/api/v1/dashboard/recent-orders",
      "GET",
      undefined,
      sellerAToken,
    );
    console.log(`Status: ${res3.status}`);
    console.log("Response summary:", res3.body?.data?.summary);
    console.log("Recent orders count:", res3.body?.data?.recentOrders?.length);

    if (res3.status !== 200) {
      throw new Error(`Expected 200, got ${res3.status}`);
    }

    const orders = res3.body?.data?.recentOrders || [];
    const multiOrderInResponse = orders.find(
      (o: any) => o.orderNumber === `ORD-${timestamp}-MULTI`,
    );

    if (!multiOrderInResponse) {
      throw new Error("Multi-vendor order was not returned for Seller A");
    }

    console.log("Multi-vendor order for Seller A:", {
      orderNumber: multiOrderInResponse.orderNumber,
      sellerTotalInRupees: multiOrderInResponse.sellerTotalInRupees,
      sellerTotalInPaise: multiOrderInResponse.sellerTotalInPaise,
      customer: multiOrderInResponse.customer,
      orderStatus: multiOrderInResponse.orderStatus,
      createdAt: multiOrderInResponse.createdAt,
    });

    // Check Seller A specific total: must be 400 Rs (40000 paise), NOT 1000 Rs
    if (
      multiOrderInResponse.sellerTotalInRupees !== 400 ||
      multiOrderInResponse.sellerTotalInPaise !== 40000
    ) {
      throw new Error(
        `Seller isolation failed! Expected 400 Rs (40000 paise), got ${multiOrderInResponse.sellerTotalInRupees} Rs (${multiOrderInResponse.sellerTotalInPaise} paise)`,
      );
    }

    // Check customer info: profilePicture, name
    if (
      !multiOrderInResponse.customer.name.includes("Alice Reader") ||
      multiOrderInResponse.customer.profilePicture !==
        "https://example.com/avatar-alice.jpg"
    ) {
      throw new Error(
        `Customer profile details mismatch: ${JSON.stringify(multiOrderInResponse.customer)}`,
      );
    }

    // Check order status & timestamp
    if (multiOrderInResponse.orderStatus !== "CONFIRMED" || !multiOrderInResponse.createdAt) {
      throw new Error("Order status or createdAt missing/invalid");
    }

    // Check items returned: only Seller A's items (1 item object with quantity 2)
    if (multiOrderInResponse.items.length !== 1 || multiOrderInResponse.items[0].quantity !== 2) {
      throw new Error(
        `Expected 1 seller item with quantity 2, got ${JSON.stringify(multiOrderInResponse.items)}`,
      );
    }

    console.log("✅ Test 3 Passed: Seller A sees only their ₹400 portion with customer avatar & name");

    // =======================================================
    // Test 4: Month filtering (?month=YYYY-MM)
    // =======================================================
    console.log(`\n[Test 4] Query with current month ?month=${currentMonthLabel}`);
    const res4 = await makeRequest(
      port,
      `/api/v1/dashboard/recent-orders?month=${currentMonthLabel}`,
      "GET",
      undefined,
      sellerAToken,
    );
    console.log(`Status: ${res4.status}`);
    console.log("Summary for current month:", res4.body?.data?.summary);

    if (res4.status !== 200 || res4.body?.data?.summary?.totalOrdersInMonth < 2) {
      throw new Error("Expected at least 2 orders in current month");
    }
    console.log("✅ Test 4 Passed: Month query correctly retrieved current month's orders");

    // =======================================================
    // Test 5: Month filtering for a past month with 0 orders
    // =======================================================
    console.log("\n[Test 5] Query past month ?month=2024-01 -> Expect 0 orders");
    const res5 = await makeRequest(
      port,
      "/api/v1/dashboard/recent-orders?month=2024-01",
      "GET",
      undefined,
      sellerAToken,
    );
    console.log(`Status: ${res5.status}, totalOrdersInMonth: ${res5.body?.data?.summary?.totalOrdersInMonth}`);

    if (res5.status !== 200 || res5.body?.data?.summary?.totalOrdersInMonth !== 0) {
      throw new Error("Expected 0 orders for 2024-01");
    }
    console.log("✅ Test 5 Passed: Past month correctly returns 0 orders");

    // =======================================================
    // Test 6: Route alias /api/v1/orders/seller/recent
    // =======================================================
    console.log("\n[Test 6] GET /api/v1/orders/seller/recent alias route");
    const res6 = await makeRequest(
      port,
      "/api/v1/orders/seller/recent",
      "GET",
      undefined,
      sellerAToken,
    );
    console.log(`Status: ${res6.status}`);
    if (res6.status !== 200 || !res6.body?.data?.recentOrders) {
      throw new Error("Alias route /api/v1/orders/seller/recent failed");
    }
    console.log("✅ Test 6 Passed: /api/v1/orders/seller/recent alias functions identically");

    console.log("\n=======================================================");
    console.log("   🎉 ALL 6 DASHBOARD RECENT ORDERS TESTS PASSED! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Dashboard recent orders test suite failed");
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

void runDashboardRecentOrdersTests();

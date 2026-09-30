import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import {
  UserModel,
  BookModel,
  BookListingModel,
  OrderModel,
  AuthorModel,
  PublisherModel,
  CategoryModel,
} from "../models/index.js";
import { emailQueue } from "../queues/email.queue.js";
import { EMAIL_JOB_NAMES } from "../constants/queues.js";
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

const runTests = async () => {
  let server: http.Server | null = null;
  const createdIds: {
    users: mongoose.Types.ObjectId[];
    books: mongoose.Types.ObjectId[];
    listings: mongoose.Types.ObjectId[];
    orders: mongoose.Types.ObjectId[];
  } = {
    users: [],
    books: [],
    listings: [],
    orders: [],
  };

  try {
    console.log("\n=======================================================");
    console.log("   TEST SELLER ORDER STATUS UPDATE & EMAIL QUEUE JOB");
    console.log("=======================================================\n");

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
    console.log(`Ephemeral test server running on port: ${port}`);

    const testSuffix = Date.now().toString();

    // 1. Create Buyer, Seller A, and Seller B
    const buyer = await UserModel.create({
      name: `Test Buyer ${testSuffix}`,
      email: `buyer_${testSuffix}@example.com`,
      password: "Password123!",
      role: "BUYER",
      isActive: true,
    });
    createdIds.users.push(buyer._id);

    const sellerA = await UserModel.create({
      name: `Seller Alpha ${testSuffix}`,
      email: `seller_a_${testSuffix}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    createdIds.users.push(sellerA._id);

    const sellerB = await UserModel.create({
      name: `Seller Beta ${testSuffix}`,
      email: `seller_b_${testSuffix}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    createdIds.users.push(sellerB._id);

    const sellerAToken = generateAccessToken({
      sub: sellerA._id.toString(),
      role: sellerA.role,
    });

    const sellerBToken = generateAccessToken({
      sub: sellerB._id.toString(),
      role: sellerB.role,
    });

    const buyerToken = generateAccessToken({
      sub: buyer._id.toString(),
      role: buyer.role,
    });

    // 2. Create canonical author, category, publisher, book, and listing for Seller A
    let author = await AuthorModel.findOne();
    if (!author) {
      author = await AuthorModel.create({
        name: "Test Author",
        slug: `test-author-${testSuffix}`,
      });
    }

    let category = await CategoryModel.findOne();
    if (!category) {
      category = await CategoryModel.create({
        name: "Test Category",
        slug: `test-cat-${testSuffix}`,
      });
    }

    let publisher = await PublisherModel.findOne();
    if (!publisher) {
      publisher = await PublisherModel.create({
        name: "Test Publisher",
        slug: `test-pub-${testSuffix}`,
      });
    }

    const testBook = await BookModel.create({
      title: `Node.js & SOLID Architecture ${testSuffix}`,
      slug: `nodejs-solid-architecture-${testSuffix}`,
      description: "A comprehensive guide to SOLID architecture in Node.js",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      createdBy: sellerA._id,
      isbn: `9780${testSuffix.slice(-9)}`,
      edition: "1st Edition",
      format: "PAPERBACK",
      language: "ENGLISH",
      coverImage: "https://example.com/cover.jpg",
      status: "ACTIVE",
    });
    createdIds.books.push(testBook._id as mongoose.Types.ObjectId);

    const testListing = await BookListingModel.create({
      book: testBook._id,
      seller: sellerA._id,
      mrpInPaise: 99900,
      sellingPriceInPaise: 79900,
      stock: 10,
      isActive: true,
    });
    createdIds.listings.push(testListing._id as mongoose.Types.ObjectId);

    // 3. Create test order containing Seller A's listing
    const testOrder = await OrderModel.create({
      orderNumber: `ORD-TEST-${testSuffix}`,
      buyer: buyer._id,
      items: [
        {
          _id: new mongoose.Types.ObjectId(),
          bookListing: testListing._id,
          book: testBook._id,
          seller: sellerA._id,
          title: testBook.title,
          priceInPaise: 79900,
          quantity: 1,
          subtotalInPaise: 79900,
          status: "CONFIRMED",
        },
      ],
      subtotalInPaise: 79900,
      deliveryChargeInPaise: 0,
      totalAmountInPaise: 79900,
      paymentMethod: "ONLINE_PAY",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      shippingAddress: {
        fullName: buyer.name,
        email: buyer.email,
        mobileNumber: "9876543210",
        street: "123 Tech Park",
        city: "Bengaluru",
        postalCode: "560001",
        country: "India",
      },
    });
    createdIds.orders.push(testOrder._id);

    console.log(`[Step 1] Created Order #${testOrder.orderNumber} with initial status CONFIRMED.`);

    // 4. Test Seller A updates status to PROCESSING
    console.log("\n[Step 2] Seller A updates order status to PROCESSING via PATCH /api/v1/orders/:id/status...");
    const processingRes = await makeRequest(
      port,
      `/api/v1/orders/${testOrder._id}/status`,
      "PATCH",
      {
        status: "PROCESSING",
        message: "We are packing your book carefully.",
      },
      sellerAToken,
    );

    console.log(`  - Status: ${processingRes.status}`);
    console.log(`  - Response message: ${processingRes.body?.message}`);
    console.log(`  - New Order Status: ${processingRes.body?.data?.orderStatus}`);

    if (
      processingRes.status !== 200 ||
      processingRes.body?.data?.orderStatus !== "PROCESSING"
    ) {
      throw new Error(`Failed to update status to PROCESSING: ${JSON.stringify(processingRes.body)}`);
    }
    console.log("  -> PASSED: Order status is now PROCESSING.");

    // 5. Test Seller A updates status to SHIPPED with tracking info
    console.log("\n[Step 3] Seller A updates order status to SHIPPED with BlueDart tracking details...");
    const shippedRes = await makeRequest(
      port,
      `/api/v1/orders/${testOrder._id}/status`,
      "PATCH",
      {
        status: "SHIPPED",
        courier: "BlueDart Express",
        trackingNumber: `BD-${testSuffix}`,
        trackingUrl: `https://bluedart.com/track/BD-${testSuffix}`,
        estimatedDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      sellerAToken,
    );

    console.log(`  - Status: ${shippedRes.status}`);
    console.log(`  - Response message: ${shippedRes.body?.message}`);
    console.log(`  - New Order Status: ${shippedRes.body?.data?.orderStatus}`);

    if (
      shippedRes.status !== 200 ||
      shippedRes.body?.data?.orderStatus !== "SHIPPED"
    ) {
      throw new Error(`Failed to update status to SHIPPED: ${JSON.stringify(shippedRes.body)}`);
    }

    const orderInDbAfterShip = await OrderModel.findById(testOrder._id);
    const shippedItem = orderInDbAfterShip?.items[0];
    if (
      shippedItem?.tracking?.courier !== "BlueDart Express" ||
      shippedItem?.tracking?.trackingNumber !== `BD-${testSuffix}`
    ) {
      throw new Error("Tracking details not properly saved on order item!");
    }
    console.log("  -> PASSED: Order status is SHIPPED with complete tracking details.");

    // 6. Test Seller A updates status to DELIVERED using alias endpoint /seller-status
    console.log("\n[Step 4] Seller A updates order status to DELIVERED via alias /seller-status...");
    const deliveredRes = await makeRequest(
      port,
      `/api/v1/orders/${testOrder._id}/seller-status`,
      "PATCH",
      {
        status: "DELIVERED",
      },
      sellerAToken,
    );

    console.log(`  - Status: ${deliveredRes.status}`);
    console.log(`  - Response message: ${deliveredRes.body?.message}`);
    console.log(`  - New Order Status: ${deliveredRes.body?.data?.orderStatus}`);

    if (
      deliveredRes.status !== 200 ||
      deliveredRes.body?.data?.orderStatus !== "DELIVERED"
    ) {
      throw new Error(`Failed to update status to DELIVERED: ${JSON.stringify(deliveredRes.body)}`);
    }

    const orderInDbAfterDelivery = await OrderModel.findById(testOrder._id);
    if (!orderInDbAfterDelivery?.items[0]?.tracking?.deliveredAt) {
      throw new Error("deliveredAt timestamp was not set on order item!");
    }
    console.log("  -> PASSED: Order status is DELIVERED with deliveredAt timestamp.");

    // 7. Test Authorization: Seller B attempts to update Seller A's order
    console.log("\n[Step 5] Verify Seller B is blocked from modifying Seller A's order (Forbidden 403)...");
    const unauthorizedRes = await makeRequest(
      port,
      `/api/v1/orders/${testOrder._id}/status`,
      "PATCH",
      {
        status: "PROCESSING",
      },
      sellerBToken,
    );

    console.log(`  - Status: ${unauthorizedRes.status} (Expected: 403)`);
    console.log(`  - Error message: ${unauthorizedRes.body?.message}`);

    if (unauthorizedRes.status !== 403) {
      throw new Error(`Expected status 403 Forbidden, but got: ${unauthorizedRes.status}`);
    }
    console.log("  -> PASSED: Unauthorized seller access correctly forbidden.");

    // 8. Test Buyer is blocked (Customer role not allowed)
    console.log("\n[Step 6] Verify Customer (buyer) is blocked by role authorization...");
    const customerRes = await makeRequest(
      port,
      `/api/v1/orders/${testOrder._id}/status`,
      "PATCH",
      {
        status: "PROCESSING",
      },
      buyerToken,
    );

    console.log(`  - Status: ${customerRes.status} (Expected: 403)`);
    if (customerRes.status !== 403) {
      throw new Error(`Expected customer access to be forbidden (403), got ${customerRes.status}`);
    }
    console.log("  -> PASSED: Customer access forbidden.");

    // 9. Test Invalid state transition: Trying to modify a DELIVERED order
    console.log("\n[Step 7] Verify modifying a DELIVERED order is rejected (400 Bad Request)...");
    const invalidTransitionRes = await makeRequest(
      port,
      `/api/v1/orders/${testOrder._id}/status`,
      "PATCH",
      {
        status: "PROCESSING",
      },
      sellerAToken,
    );

    console.log(`  - Status: ${invalidTransitionRes.status} (Expected: 400)`);
    console.log(`  - Error message: ${invalidTransitionRes.body?.message}`);

    if (invalidTransitionRes.status !== 400) {
      throw new Error(`Expected status 400 for modifying delivered order, got ${invalidTransitionRes.status}`);
    }
    console.log("  -> PASSED: Modifying delivered order correctly rejected.");

    // 10. Verify BullMQ Queue jobs
    console.log("\n[Step 8] Verifying background email queue jobs...");
    const emailJobs = await emailQueue.getJobs(["waiting", "active", "completed", "delayed"]);
    const statusUpdateJobs = emailJobs.filter(
      (job) =>
        job.name === EMAIL_JOB_NAMES.SEND_ORDER_STATUS_UPDATE &&
        job.data?.orderNumber === testOrder.orderNumber,
    );

    console.log(`  - Found ${statusUpdateJobs.length} order status update email job(s) for Order #${testOrder.orderNumber} in BullMQ.`);
    if (statusUpdateJobs.length === 0) {
      throw new Error(`No SEND_ORDER_STATUS_UPDATE jobs found for Order #${testOrder.orderNumber}!`);
    }

    const latestJob = statusUpdateJobs[statusUpdateJobs.length - 1];
    console.log(`  - Job ID: ${latestJob.id}`);
    console.log(`  - Recipient: ${latestJob.data?.toEmail}`);
    console.log(`  - Order Number: ${latestJob.data?.orderNumber}`);
    console.log(`  - New Status: ${latestJob.data?.newStatus}`);

    if (latestJob.data?.toEmail !== buyer.email) {
      throw new Error(`Recipient mismatch: expected ${buyer.email}, got ${latestJob.data?.toEmail}`);
    }
    console.log("  -> PASSED: Background email job enqueued with correct recipient and payload!");

    console.log("\n=======================================================");
    console.log("   ✅ ALL SELLER ORDER STATUS TESTS PASSED!");
    console.log("=======================================================\n");
  } finally {
    // Cleanup created test records
    console.log("Cleaning up test data...");
    if (createdIds.orders.length > 0) {
      await OrderModel.deleteMany({ _id: { $in: createdIds.orders } });
    }
    if (createdIds.listings.length > 0) {
      await BookListingModel.deleteMany({ _id: { $in: createdIds.listings } });
    }
    if (createdIds.books.length > 0) {
      await BookModel.deleteMany({ _id: { $in: createdIds.books } });
    }
    if (createdIds.users.length > 0) {
      await UserModel.deleteMany({ _id: { $in: createdIds.users } });
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await emailQueue.close();
    await mongoose.connection.close();
    console.log("Teardown completed cleanly.");
  }
};

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });

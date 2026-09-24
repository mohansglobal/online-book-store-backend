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

const runDiscountTests = async () => {
  let server: http.Server | null = null;
  const cleanupUserIds: mongoose.Types.ObjectId[] = [];
  const cleanupListingIds: mongoose.Types.ObjectId[] = [];
  const cleanupBookIds: mongoose.Types.ObjectId[] = [];
  const cleanupAuthorIds: mongoose.Types.ObjectId[] = [];
  const cleanupPublisherIds: mongoose.Types.ObjectId[] = [];
  const cleanupCategoryIds: mongoose.Types.ObjectId[] = [];

  try {
    console.log("\n=======================================================");
    console.log("   TEST DISCOUNT CALCULATION & SELLING PRICE API");
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

    // 1. Create test users
    const seller1 = await UserModel.create({
      name: `Seller One ${timestamp}`,
      email: `seller1_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(seller1._id);

    const seller2 = await UserModel.create({
      name: `Seller Two ${timestamp}`,
      email: `seller2_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(seller2._id);

    const buyer = await UserModel.create({
      name: `Buyer ${timestamp}`,
      email: `buyer_${timestamp}@example.com`,
      password: "Password123!",
      role: "BUYER",
      isActive: true,
    });
    cleanupUserIds.push(buyer._id);

    const admin = await UserModel.create({
      name: `Admin ${timestamp}`,
      email: `admin_${timestamp}@example.com`,
      password: "Password123!",
      role: "ADMIN",
      isActive: true,
    });
    cleanupUserIds.push(admin._id);

    const seller1Token = generateAccessToken({
      sub: seller1._id.toString(),
      role: "SELLER",
    });
    const seller2Token = generateAccessToken({
      sub: seller2._id.toString(),
      role: "SELLER",
    });
    const buyerToken = generateAccessToken({
      sub: buyer._id.toString(),
      role: "BUYER",
    });
    const adminToken = generateAccessToken({
      sub: admin._id.toString(),
      role: "ADMIN",
    });

    // 2. Create sample book and listing with MRP 1000 Rs (100000 paise)
    const author = await AuthorModel.create({
      name: `Author ${timestamp}`,
      bio: "Test Bio",
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

    const masterBook = await BookModel.create({
      title: `Discount Test Book ${timestamp}`,
      slug: `discount-test-book-${timestamp}`,
      description: "Test book for discount calculations",
      price: 1000,
      priceIn: 1000,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/cover.jpg",
      createdBy: seller1._id,
    });
    cleanupBookIds.push(masterBook._id);

    const listing = await BookListingModel.create({
      book: masterBook._id,
      seller: seller1._id,
      mrpInPaise: 100000, // Rs 1000 MRP
      sellingPriceInPaise: 100000, // Initial selling price Rs 1000
      stock: 25,
      isActive: true,
    });
    cleanupListingIds.push(listing._id);

    const listingId = listing._id.toString();

    // Test 1: Unauthenticated request -> 401
    console.log("\n[Test 1] PATCH /api/v1/listings/:id/discount without token -> Expect 401 Unauthorized");
    const res1 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "PERCENTAGE", discountValue: 50 },
    );
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 401) {
      throw new Error(`Expected 401, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthenticated request rejected with 401");

    // Test 2: BUYER role -> 403
    console.log("\n[Test 2] PATCH /api/v1/listings/:id/discount with BUYER token -> Expect 403 Forbidden");
    const res2 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "PERCENTAGE", discountValue: 50 },
      buyerToken,
    );
    console.log(`Status: ${res2.status}`);
    if (res2.status !== 403) {
      throw new Error(`Expected 403, got ${res2.status}`);
    }
    console.log("✅ Test 2 Passed: BUYER token rejected with 403");

    // Test 3: Another seller (seller2) modifying seller1's listing -> 403
    console.log("\n[Test 3] PATCH /api/v1/listings/:id/discount with wrong seller token -> Expect 403 Forbidden");
    const res3 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "PERCENTAGE", discountValue: 50 },
      seller2Token,
    );
    console.log(`Status: ${res3.status}`);
    if (res3.status !== 403) {
      throw new Error(`Expected 403, got ${res3.status}`);
    }
    console.log("✅ Test 3 Passed: Unauthorized seller rejected with 403");

    // Test 4: Invalid discount type -> 400
    console.log("\n[Test 4] PATCH /api/v1/listings/:id/discount with invalid discountType -> Expect 400 Bad Request");
    const res4 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "INVALID_TYPE", discountValue: 50 },
      seller1Token,
    );
    console.log(`Status: ${res4.status}`);
    if (res4.status !== 400) {
      throw new Error(`Expected 400, got ${res4.status}`);
    }
    console.log("✅ Test 4 Passed: Invalid discountType rejected with 400");

    // Test 5: Percentage discount > 100% -> 400
    console.log("\n[Test 5] PATCH /api/v1/listings/:id/discount with percentage 150% -> Expect 400 Bad Request");
    const res5 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "PERCENTAGE", discountValue: 150 },
      seller1Token,
    );
    console.log(`Status: ${res5.status}`);
    if (res5.status !== 400) {
      throw new Error(`Expected 400, got ${res5.status}`);
    }
    console.log("✅ Test 5 Passed: Percentage > 100% rejected with 400");

    // Test 6: Flat discount greater than MRP -> 400
    console.log("\n[Test 6] PATCH /api/v1/listings/:id/discount with flat 1500 Rs discount on 1000 Rs MRP -> Expect 400 Bad Request");
    const res6 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "FLAT", discountValue: 1500 },
      seller1Token,
    );
    console.log(`Status: ${res6.status}`);
    if (res6.status !== 400) {
      throw new Error(`Expected 400, got ${res6.status}`);
    }
    console.log("✅ Test 6 Passed: Flat discount > MRP rejected with 400");

    // Test 7: Apply 50% discount on 1000 Rs MRP -> Expect Selling Price 500 Rs (50000 paise)
    console.log("\n[Test 7] Apply 50% discount on Rs 1000 MRP -> Expect Selling Price Rs 500 (50000 paise)");
    const res7 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "PERCENTAGE", discountValue: 50 },
      seller1Token,
    );
    console.log(`Status: ${res7.status}`);
    console.log(`Data:`, res7.body?.data);

    if (
      res7.status !== 200 ||
      res7.body?.data?.sellingPriceInPaise !== 50000 ||
      res7.body?.data?.price !== 500 ||
      res7.body?.data?.mrp !== 1000
    ) {
      throw new Error(
        `Failed Test 7: Expected sellingPriceInPaise: 50000, price: 500, got ${JSON.stringify(res7.body?.data)}`,
      );
    }
    console.log("✅ Test 7 Passed: 50% discount correctly set selling price to Rs 500 (50000 paise)");

    // Test 8: Apply 20% discount on 1000 Rs MRP -> Expect Selling Price 800 Rs (80000 paise)
    console.log("\n[Test 8] Apply 20% discount on Rs 1000 MRP -> Expect Selling Price Rs 800 (80000 paise)");
    const res8 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "percentage", discountValue: 20 },
      seller1Token,
    );
    console.log(`Status: ${res8.status}`);

    if (
      res8.status !== 200 ||
      res8.body?.data?.sellingPriceInPaise !== 80000 ||
      res8.body?.data?.price !== 800
    ) {
      throw new Error(
        `Failed Test 8: Expected sellingPriceInPaise: 80000, price: 800, got ${JSON.stringify(res8.body?.data)}`,
      );
    }
    console.log("✅ Test 8 Passed: 20% discount correctly set selling price to Rs 800 (80000 paise)");

    // Test 9: Apply FLAT 200 Rs discount on 1000 Rs MRP -> Expect Selling Price 800 Rs (80000 paise)
    console.log("\n[Test 9] Apply FLAT Rs 200 discount on Rs 1000 MRP -> Expect Selling Price Rs 800 (80000 paise)");
    const res9 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "FLAT", discountValue: 200 },
      seller1Token,
    );
    console.log(`Status: ${res9.status}`);

    if (
      res9.status !== 200 ||
      res9.body?.data?.sellingPriceInPaise !== 80000 ||
      res9.body?.data?.price !== 800
    ) {
      throw new Error(
        `Failed Test 9: Expected sellingPriceInPaise: 80000, got ${JSON.stringify(res9.body?.data)}`,
      );
    }
    console.log("✅ Test 9 Passed: FLAT Rs 200 discount correctly set selling price to Rs 800 (80000 paise)");

    // Test 10: Apply FLAT 500 Rs discount with new MRP 1200 Rs -> Expect MRP 1200, Selling Price 700 Rs (70000 paise)
    console.log("\n[Test 10] Apply FLAT Rs 500 discount with new MRP Rs 1200 -> Expect Selling Price Rs 700 (70000 paise)");
    const res10 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { mrp: 1200, discountType: "FLAT", discountValue: 500 },
      seller1Token,
    );
    console.log(`Status: ${res10.status}`);

    if (
      res10.status !== 200 ||
      res10.body?.data?.mrpInPaise !== 120000 ||
      res10.body?.data?.sellingPriceInPaise !== 70000 ||
      res10.body?.data?.price !== 700
    ) {
      throw new Error(
        `Failed Test 10: Expected mrp: 1200, price: 700, got ${JSON.stringify(res10.body?.data)}`,
      );
    }
    console.log("✅ Test 10 Passed: New MRP Rs 1200 and FLAT Rs 500 discount set price to Rs 700");

    // Test 11: Admin can update any listing discount
    console.log("\n[Test 11] ADMIN updates seller listing with 10% discount -> Expect 200 OK");
    const res11 = await makeRequest(
      port,
      `/api/v1/listings/${listingId}/discount`,
      "PATCH",
      { discountType: "PERCENTAGE", discountValue: 10 },
      adminToken,
    );
    console.log(`Status: ${res11.status}`);

    if (res11.status !== 200 || res11.body?.data?.sellingPriceInPaise !== 108000) {
      throw new Error(
        `Failed Test 11: Admin update failed, got ${JSON.stringify(res11.body?.data)}`,
      );
    }
    console.log("✅ Test 11 Passed: Admin successfully updated seller listing discount (10% on 1200 = 1080 Rs)");

    console.log("\n=======================================================");
    console.log("   🎉 ALL 11 DISCOUNT TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Discount test suite failed");
    console.error("❌ Test error:", error);
    process.exit(1);
  } finally {
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

void runDiscountTests();

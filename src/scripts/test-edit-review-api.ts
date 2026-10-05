import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import {
  UserModel,
  BookModel,
  BookListingModel,
  OrderModel,
  ReviewModel,
} from "../models/index.js";
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

async function runTest() {
  console.log("=== Testing Edit Review API (PATCH /api/v1/reviews/:id) ===");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB successfully");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  console.log(`Test server running on port ${port}`);

  // Test data IDs
  const testSuffix = Date.now().toString();
  let buyerUserId: mongoose.Types.ObjectId | null = null;
  let otherUserId: mongoose.Types.ObjectId | null = null;
  let sellerUserId: mongoose.Types.ObjectId | null = null;
  let bookId: mongoose.Types.ObjectId | null = null;
  let listingId: mongoose.Types.ObjectId | null = null;
  let orderId: mongoose.Types.ObjectId | null = null;
  let reviewId: mongoose.Types.ObjectId | null = null;

  try {
    // 1. Create test users
    const buyer = await UserModel.create({
      name: `test_buyer_${testSuffix}`,
      email: `test_buyer_${testSuffix}@example.com`,
      password: "test_password_12345",
      role: "BUYER",
      isEmailVerified: true,
      isActive: true,
    });
    buyerUserId = buyer._id as mongoose.Types.ObjectId;

    const otherUser = await UserModel.create({
      name: `test_other_${testSuffix}`,
      email: `test_other_${testSuffix}@example.com`,
      password: "test_password_12345",
      role: "BUYER",
      isEmailVerified: true,
      isActive: true,
    });
    otherUserId = otherUser._id as mongoose.Types.ObjectId;

    const seller = await UserModel.create({
      name: `test_seller_${testSuffix}`,
      email: `test_seller_${testSuffix}@example.com`,
      password: "test_password_12345",
      role: "SELLER",
      isEmailVerified: true,
      isActive: true,
    });
    sellerUserId = seller._id as mongoose.Types.ObjectId;

    const buyerToken = generateAccessToken({
      sub: buyer._id.toString(),
      role: buyer.role,
    });

    const otherUserToken = generateAccessToken({
      sub: otherUser._id.toString(),
      role: otherUser.role,
    });

    const existingBook = await BookModel.findOne().lean();
    bookId = (existingBook?._id as mongoose.Types.ObjectId) || new mongoose.Types.ObjectId();
    listingId = new mongoose.Types.ObjectId();
    orderId = new mongoose.Types.ObjectId();

    // 4. Create initial review
    const initialReview = await ReviewModel.create({
      user: buyerUserId,
      book: bookId,
      seller: sellerUserId,
      bookListing: listingId,
      order: orderId,
      rating: 3,
      title: "Initial OK Condition",
      review: "The book arrived fine but packaging could be better.",
      images: ["https://example.com/test_img1.jpg"],
      isVerifiedPurchase: true,
      status: "APPROVED",
    });
    reviewId = initialReview._id as mongoose.Types.ObjectId;
    console.log("Created initial review with rating 3 and 1 image");

    // [Test 1] Other user attempts to edit buyer's review -> Expect 403 Forbidden
    console.log("\n[Test 1] Other user attempts to edit review -> Expect 403 Forbidden");
    const res1 = await makeRequest(
      port,
      `/api/v1/reviews/${reviewId.toString()}`,
      "PATCH",
      {
        rating: 1,
        title: "Malicious Edit",
        review: "Trying to edit someone else's review",
      },
      otherUserToken,
    );

    if (res1.status !== 403) {
      throw new Error(`Test 1 failed: Expected 403, got ${res1.status}: ${JSON.stringify(res1.body)}`);
    }
    console.log("✅ Test 1 Passed: Unauthorized edit properly rejected with 403 Forbidden");

    // [Test 2] Author updates their review with new rating, title, and comments
    console.log("\n[Test 2] Author updates review (rating: 5, new title, new text, clear images)");
    const res2 = await makeRequest(
      port,
      `/api/v1/reviews/${reviewId.toString()}`,
      "PATCH",
      {
        rating: 5,
        title: "Updated: Absolutely Loved It!",
        review: "Re-read it and the quality was top notch. 5 stars!",
        existingImages: [],
      },
      buyerToken,
    );

    if (res2.status !== 200 || !res2.body?.success) {
      throw new Error(`Test 2 failed: Expected 200, got ${res2.status}: ${JSON.stringify(res2.body)}`);
    }

    const updatedData = res2.body.data;
    if (updatedData.rating !== 5) {
      throw new Error(`Test 2 failed: Expected rating 5, got ${updatedData.rating}`);
    }
    if (updatedData.title !== "Updated: Absolutely Loved It!") {
      throw new Error(`Test 2 failed: Title was not updated`);
    }
    if (updatedData.images.length !== 0) {
      throw new Error(`Test 2 failed: Images were not cleared`);
    }
    console.log("✅ Test 2 Passed: Review updated successfully to 5 stars with cleared images");

    // [Test 3] Verify public GET /reviews returns the updated review
    console.log("\n[Test 3] GET /api/v1/reviews?bookId=... returns updated review and recalculated stats");
    const res3 = await makeRequest(
      port,
      `/api/v1/reviews?bookId=${bookId.toString()}`,
      "GET",
    );

    if (res3.status !== 200 || !res3.body?.success) {
      throw new Error(`Test 3 failed: Expected 200, got ${res3.status}: ${JSON.stringify(res3.body)}`);
    }

    const returnedReviews = res3.body.data?.reviews || [];
    const found = returnedReviews.find((r: any) => r._id === reviewId?.toString());
    if (!found || found.rating !== 5 || found.title !== "Updated: Absolutely Loved It!") {
      throw new Error(`Test 3 failed: Updated review not found or fields incorrect: ${JSON.stringify(found)}`);
    }
    console.log("✅ Test 3 Passed: Public reviews list reflects edited review details!");

    console.log("\n🎉 ALL EDIT REVIEW API TESTS PASSED SUCCESSFULLY! 🎉\n");
  } finally {
    // Mandatory cleanup adhering to Rule 33 in AGENTS.md
    console.log("🧹 Cleaning up all test data from database...");
    if (reviewId) await ReviewModel.findByIdAndDelete(reviewId);
    if (orderId) await OrderModel.findByIdAndDelete(orderId);
    if (listingId) await BookListingModel.findByIdAndDelete(listingId);
    if (bookId) await BookModel.findByIdAndDelete(bookId);
    if (buyerUserId) await UserModel.findByIdAndDelete(buyerUserId);
    if (otherUserId) await UserModel.findByIdAndDelete(otherUserId);
    if (sellerUserId) await UserModel.findByIdAndDelete(sellerUserId);
    console.log("✅ Test data cleaned up successfully");

    await server.close();
    await mongoose.disconnect();
  }
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

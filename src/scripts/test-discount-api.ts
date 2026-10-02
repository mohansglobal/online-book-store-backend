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
    console.log("   TEST DATE-WISE & BULK DISCOUNT API");
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

    // 1. Create test users (prefixed with test_ according to Rule 33)
    const seller1 = await UserModel.create({
      name: `test_seller_one_${timestamp}`,
      email: `test_seller1_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(seller1._id);

    const seller2 = await UserModel.create({
      name: `test_seller_two_${timestamp}`,
      email: `test_seller2_${timestamp}@example.com`,
      password: "Password123!",
      role: "SELLER",
      isActive: true,
    });
    cleanupUserIds.push(seller2._id);

    const buyer = await UserModel.create({
      name: `test_buyer_${timestamp}`,
      email: `test_buyer_${timestamp}@example.com`,
      password: "Password123!",
      role: "BUYER",
      isActive: true,
    });
    cleanupUserIds.push(buyer._id);

    const admin = await UserModel.create({
      name: `test_admin_${timestamp}`,
      email: `test_admin_${timestamp}@example.com`,
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

    // 2. Create sample books and listings
    const author = await AuthorModel.create({
      name: `test_author_${timestamp}`,
      bio: "Test Bio",
    });
    cleanupAuthorIds.push(author._id);

    const publisher = await PublisherModel.create({
      name: `test_publisher_${timestamp}`,
      slug: `test-pub-${timestamp}`,
    });
    cleanupPublisherIds.push(publisher._id);

    const category = await CategoryModel.create({
      name: `test_category_${timestamp}`,
      slug: `test-cat-${timestamp}`,
    });
    cleanupCategoryIds.push(category._id);

    const book1 = await BookModel.create({
      title: `test_book_1_${timestamp}`,
      slug: `test-book-1-${timestamp}`,
      description: "Test book 1",
      price: 500,
      priceIn: 500,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/cover1.jpg",
      createdBy: seller1._id,
    });
    cleanupBookIds.push(book1._id);

    const book2 = await BookModel.create({
      title: `test_book_2_${timestamp}`,
      slug: `test-book-2-${timestamp}`,
      description: "Test book 2",
      price: 1000,
      priceIn: 1000,
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/cover2.jpg",
      createdBy: seller1._id,
    });
    cleanupBookIds.push(book2._id);

    // Listing 1: MRP 500 Rs (50000 paise), Base Selling Price 400 Rs (40000 paise, 20% normal discount)
    const listing1 = await BookListingModel.create({
      book: book1._id,
      seller: seller1._id,
      mrpInPaise: 50000,
      sellingPriceInPaise: 40000,
      stock: 20,
      isActive: true,
    });
    cleanupListingIds.push(listing1._id);

    // Listing 2: MRP 1000 Rs (100000 paise), Base Selling Price 900 Rs (90000 paise)
    const listing2 = await BookListingModel.create({
      book: book2._id,
      seller: seller1._id,
      mrpInPaise: 100000,
      sellingPriceInPaise: 90000,
      stock: 15,
      isActive: true,
    });
    cleanupListingIds.push(listing2._id);

    const listing1Id = listing1._id.toString();
    const listing2Id = listing2._id.toString();

    // Test 1: Unauthorized seller modifying seller1's listing -> 403
    console.log("\n[Test 1] PATCH /api/v1/listings/:id/discount with unauthorized seller -> Expect 403");
    const res1 = await makeRequest(
      port,
      `/api/v1/listings/${listing1Id}/discount`,
      "PATCH",
      { discountType: "PERCENTAGE", discountValue: 30 },
      seller2Token,
    );
    if (res1.status !== 403) {
      throw new Error(`Expected 403, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthorized seller forbidden");

    // Test 2: Date-wise Scheduled Discount (ACTIVE window)
    // MRP = 500, Base Selling = 400 (20% off).
    // Seller sets 30% discount from yesterday to next week.
    // Expected: 30% of 500 = 150 discount => Effective Selling Price = 350 (NOT 400 - 30%).
    console.log("\n[Test 2] Apply 30% Scheduled Discount during active date window");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const res2 = await makeRequest(
      port,
      `/api/v1/listings/${listing1Id}/discount`,
      "PATCH",
      {
        discountType: "PERCENTAGE",
        discountValue: 30,
        startDate: yesterday,
        endDate: nextWeek,
        campaignName: "Festival Mega Sale",
      },
      seller1Token,
    );

    if (res2.status !== 200) {
      throw new Error(`Expected 200, got ${res2.status}: ${JSON.stringify(res2.body)}`);
    }

    // Fetch listing via GET to verify virtuals & dynamic resolution
    const res2Get = await makeRequest(
      port,
      `/api/v1/listings/${listing1Id}`,
      "GET",
      undefined,
      seller1Token,
    );

    const l1Data = res2Get.body?.data;
    console.log("Listing 1 dynamic prices during active window:", {
      mrp: l1Data?.mrp,
      price: l1Data?.price,
      priceInPaise: l1Data?.priceInPaise,
      discountPercentage: l1Data?.discountPercentage,
      discountStatus: l1Data?.discountStatus,
    });

    if (
      l1Data?.mrp !== 500 ||
      l1Data?.price !== 350 ||
      l1Data?.priceInPaise !== 35000 ||
      l1Data?.discountPercentage !== 30 ||
      l1Data?.discountStatus !== "ACTIVE"
    ) {
      throw new Error(`Test 2 failed: Expected price=350, discount=30%, status=ACTIVE. Got ${JSON.stringify(l1Data)}`);
    }
    console.log("✅ Test 2 Passed: 30% discount calculated directly from MRP = ₹350 (Active window)");

    // Test 3: Date-wise Scheduled Discount in Future (UPCOMING window)
    // Seller sets 40% discount from in 5 days to in 10 days.
    // Expected: Dynamic price remains base price (₹400), discountStatus = UPCOMING.
    console.log("\n[Test 3] Apply Future Scheduled Discount (UPCOMING)");
    const in5Days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    const res3 = await makeRequest(
      port,
      `/api/v1/listings/${listing1Id}/discount`,
      "PATCH",
      {
        discountType: "PERCENTAGE",
        discountValue: 40,
        startDate: in5Days,
        endDate: in10Days,
        campaignName: "Upcoming Black Friday",
      },
      seller1Token,
    );

    if (res3.status !== 200) {
      throw new Error(`Expected 200, got ${res3.status}`);
    }

    const res3Get = await makeRequest(port, `/api/v1/listings/${listing1Id}`, "GET");
    const l1FutureData = res3Get.body?.data;

    console.log("Listing 1 future discount state:", {
      price: l1FutureData?.price,
      discountPercentage: l1FutureData?.discountPercentage,
      discountStatus: l1FutureData?.discountStatus,
    });

    if (
      l1FutureData?.price !== 400 ||
      l1FutureData?.discountPercentage !== 20 ||
      l1FutureData?.discountStatus !== "UPCOMING"
    ) {
      throw new Error(`Test 3 failed: Expected price=400, status=UPCOMING. Got ${JSON.stringify(l1FutureData)}`);
    }
    console.log("✅ Test 3 Passed: Upcoming discount leaves current base price unchanged at ₹400");

    // Test 4: Date-wise Scheduled Discount in Past (EXPIRED window)
    // Seller sets discount from 10 days ago to 2 days ago.
    // Expected: Dynamic price is base price (₹400), discountStatus = EXPIRED.
    console.log("\n[Test 4] Apply Expired Scheduled Discount (EXPIRED)");
    const past10Days = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const past2Days = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    await makeRequest(
      port,
      `/api/v1/listings/${listing1Id}/discount`,
      "PATCH",
      {
        discountType: "PERCENTAGE",
        discountValue: 50,
        startDate: past10Days,
        endDate: past2Days,
      },
      seller1Token,
    );

    const res4Get = await makeRequest(port, `/api/v1/listings/${listing1Id}`, "GET");
    const l1ExpiredData = res4Get.body?.data;

    if (
      l1ExpiredData?.price !== 400 ||
      l1ExpiredData?.discountStatus !== "EXPIRED"
    ) {
      throw new Error(`Test 4 failed: Expected price=400, status=EXPIRED. Got ${JSON.stringify(l1ExpiredData)}`);
    }
    console.log("✅ Test 4 Passed: Expired scheduled discount automatically returns base price ₹400");

    // Test 5: Bulk Discount across ALL seller listings
    console.log("\n[Test 5] POST /api/v1/listings/discounts/bulk (targetType: ALL, 25% off)");
    const res5 = await makeRequest(
      port,
      "/api/v1/listings/discounts/bulk",
      "POST",
      {
        targetType: "ALL",
        discountType: "PERCENTAGE",
        discountValue: 25,
        startDate: yesterday,
        endDate: nextWeek,
        campaignName: "Storewide 25% Off",
      },
      seller1Token,
    );

    if (res5.status !== 200 || res5.body?.data?.modifiedCount < 2) {
      throw new Error(`Test 5 failed: Expected modifiedCount >= 2, got ${JSON.stringify(res5.body)}`);
    }
    console.log(`✅ Test 5 Passed: Bulk discount applied to ${res5.body.data.modifiedCount} seller listings`);

    // Verify both listings now reflect 25% off MRP
    // Listing 1: 500 MRP - 25% = 375 Rs
    // Listing 2: 1000 MRP - 25% = 750 Rs
    const l1BulkGet = (await makeRequest(port, `/api/v1/listings/${listing1Id}`, "GET")).body?.data;
    const l2BulkGet = (await makeRequest(port, `/api/v1/listings/${listing2Id}`, "GET")).body?.data;

    if (l1BulkGet?.price !== 375 || l2BulkGet?.price !== 750) {
      throw new Error(`Test 5 verification failed: Listing 1 price=${l1BulkGet?.price}, Listing 2 price=${l2BulkGet?.price}`);
    }
    console.log("✅ Test 5 Verification Passed: Listing 1 = ₹375 (25% on 500), Listing 2 = ₹750 (25% on 1000)");

    // Test 6: Bulk Discount for SPECIFIC listing IDs
    console.log("\n[Test 6] POST /api/v1/listings/discounts/bulk (targetType: SPECIFIC, flat 200 Rs off for Listing 2)");
    const res6 = await makeRequest(
      port,
      "/api/v1/listings/discounts/bulk",
      "POST",
      {
        targetType: "SPECIFIC",
        listingIds: [listing2Id],
        discountType: "FLAT",
        discountValue: 200, // Flat 200 Rs discount on 1000 MRP = 800 Rs
        startDate: yesterday,
        endDate: nextWeek,
        campaignName: "Exclusive Book 2 Deal",
      },
      seller1Token,
    );

    if (res6.status !== 200 || res6.body?.data?.modifiedCount !== 1) {
      throw new Error(`Test 6 failed: Expected modifiedCount = 1, got ${JSON.stringify(res6.body)}`);
    }

    const l2SpecificGet = (await makeRequest(port, `/api/v1/listings/${listing2Id}`, "GET")).body?.data;
    if (l2SpecificGet?.price !== 800 || l2SpecificGet?.discountPercentage !== 20) {
      throw new Error(`Test 6 verification failed: Listing 2 price=${l2SpecificGet?.price}, expected 800`);
    }
    console.log("✅ Test 6 Passed: Flat ₹200 discount applied specifically to Listing 2 = ₹800");

    // Test 7: Single Listing Discount Removal (DELETE /:id/discount)
    console.log("\n[Test 7] DELETE /api/v1/listings/:id/discount");
    const res7 = await makeRequest(
      port,
      `/api/v1/listings/${listing1Id}/discount`,
      "DELETE",
      undefined,
      seller1Token,
    );

    if (res7.status !== 200) {
      throw new Error(`Test 7 failed: Expected 200, got ${res7.status}`);
    }

    const l1RemovedGet = (await makeRequest(port, `/api/v1/listings/${listing1Id}`, "GET")).body?.data;
    if (l1RemovedGet?.discountStatus !== "NONE" || l1RemovedGet?.price !== 400) {
      throw new Error(`Test 7 failed: Expected price=400, discountStatus=NONE, got ${JSON.stringify(l1RemovedGet)}`);
    }
    console.log("✅ Test 7 Passed: Single discount removed and price restored to base ₹400");

    // Test 8: Bulk Discount Removal (DELETE /discounts/bulk)
    console.log("\n[Test 8] DELETE /api/v1/listings/discounts/bulk (targetType: ALL)");
    const res8 = await makeRequest(
      port,
      "/api/v1/listings/discounts/bulk",
      "DELETE",
      { targetType: "ALL" },
      seller1Token,
    );

    if (res8.status !== 200 || res8.body?.data?.modifiedCount < 1) {
      throw new Error(`Test 8 failed: Expected modifiedCount >= 1, got ${JSON.stringify(res8.body)}`);
    }

    const l2RemovedGet = (await makeRequest(port, `/api/v1/listings/${listing2Id}`, "GET")).body?.data;
    if (l2RemovedGet?.discountStatus !== "NONE" || l2RemovedGet?.price !== 900) {
      throw new Error(`Test 8 failed: Expected Listing 2 price=900, got ${JSON.stringify(l2RemovedGet)}`);
    }
    console.log("✅ Test 8 Passed: Bulk discount removal cleared all discounts and restored prices");

    console.log("\n=======================================================");
    console.log("   🎉 ALL 8 DATE-WISE & BULK DISCOUNT TESTS PASSED! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Discount test suite failed");
    console.error("❌ Test error:", error);
    process.exit(1);
  } finally {
    // Guaranteed cleanup (Rule 33)
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

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

const runCategoryBreakdownTests = async () => {
  let server: http.Server | null = null;
  const cleanupOrderIds: mongoose.Types.ObjectId[] = [];
  const cleanupListingIds: mongoose.Types.ObjectId[] = [];
  const cleanupBookIds: mongoose.Types.ObjectId[] = [];
  const cleanupAuthorIds: mongoose.Types.ObjectId[] = [];
  const cleanupPublisherIds: mongoose.Types.ObjectId[] = [];
  const cleanupCategoryIds: mongoose.Types.ObjectId[] = [];
  const cleanupUserIds: mongoose.Types.ObjectId[] = [];

  try {
    console.log("\n=======================================================");
    console.log("   TEST CATEGORY / GENRE BREAKDOWN ANALYTICS API");
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
    console.log("\n[Test 1] GET /api/v1/dashboard/category-breakdown without token -> Expect 401");
    const res1 = await makeRequest(port, "/api/v1/dashboard/category-breakdown", "GET");
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 401) {
      throw new Error(`Expected 401, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthenticated request rejected with 401");

    // Test 2: Authenticated with BUYER role -> Expect 403
    console.log("\n[Test 2] GET /api/v1/dashboard/category-breakdown with BUYER token -> Expect 403");
    const res2 = await makeRequest(
      port,
      "/api/v1/dashboard/category-breakdown",
      "GET",
      undefined,
      buyerToken,
    );
    console.log(`Status: ${res2.status}`);
    if (res2.status !== 403) {
      throw new Error(`Expected 403, got ${res2.status}`);
    }
    console.log("✅ Test 2 Passed: BUYER role rejected with 403");

    // Test 3: Authenticated with SELLER token (empty state) -> Expect 200
    console.log("\n[Test 3] GET /api/v1/dashboard/category-breakdown (empty state) -> Expect 200");
    const res3 = await makeRequest(
      port,
      "/api/v1/dashboard/category-breakdown",
      "GET",
      undefined,
      sellerToken,
    );
    console.log(`Status: ${res3.status}`);
    console.log("Empty Response Data:", res3.body?.data);
    if (res3.status !== 200 || !res3.body?.data) {
      throw new Error(`Expected 200 with data, got ${res3.status}`);
    }
    if (res3.body.data.totalBooksSold !== 0 || res3.body.data.items.length !== 0) {
      throw new Error("Empty state did not return 0 books sold");
    }
    console.log("✅ Test 3 Passed: Empty state returns valid empty breakdown");

    // Seed shared Author and Publisher
    const author = await AuthorModel.create({
      name: "Genre Author",
      slug: `genre-author-${Date.now()}`,
    });
    cleanupAuthorIds.push(author._id);

    const publisher = await PublisherModel.create({
      name: "Genre Publisher",
      slug: `genre-publisher-${Date.now()}`,
    });
    cleanupPublisherIds.push(publisher._id);

    // Create 5 Categories
    const cat1 = await CategoryModel.create({
      name: "Fiction Novels",
      slug: `fiction-novels-${Date.now()}`,
    });
    const cat2 = await CategoryModel.create({
      name: "Academic",
      slug: `academic-${Date.now()}`,
    });
    const cat3 = await CategoryModel.create({
      name: "Poetry & Classic",
      slug: `poetry-classic-${Date.now()}`,
    });
    const cat4 = await CategoryModel.create({
      name: "Science Fiction",
      slug: `sci-fi-${Date.now()}`,
    });
    const cat5 = await CategoryModel.create({
      name: "History",
      slug: `history-${Date.now()}`,
    });

    cleanupCategoryIds.push(cat1._id, cat2._id, cat3._id, cat4._id, cat5._id);

    // Helper to create book and listing
    const setupBookAndListing = async (title: string, categoryId: mongoose.Types.ObjectId) => {
      const book = await BookModel.create({
        title,
        slug: `${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        authors: [author._id],
        publisher: publisher._id,
        categories: [categoryId],
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
        stock: 5000,
      });
      cleanupListingIds.push(listing._id);

      return { book, listing };
    };

    const book1 = await setupBookAndListing("Fiction Book", cat1._id);
    const book2 = await setupBookAndListing("Academic Book", cat2._id);
    const book3 = await setupBookAndListing("Poetry Book", cat3._id);
    const book4 = await setupBookAndListing("SciFi Book", cat4._id);
    const book5 = await setupBookAndListing("History Book", cat5._id);

    // Helper to create an order with specified quantity
    const createOrderWithItem = async (
      book: any,
      listing: any,
      quantity: number,
    ) => {
      const order = await OrderModel.create({
        orderNumber: `ORD-GENRE-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        buyer: buyerId,
        items: [
          {
            bookListing: listing._id,
            book: book._id,
            seller: sellerId,
            title: book.title,
            priceInPaise: 40000,
            quantity,
            subtotalInPaise: 40000 * quantity,
          },
        ],
        totalAmountInPaise: 40000 * quantity,
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
      });
      cleanupOrderIds.push(order._id);
    };

    console.log("\nSeeding orders for 5 categories...");
    // Fiction: 580 books
    await createOrderWithItem(book1.book, book1.listing, 580);
    // Poetry & Classic: 430 books
    await createOrderWithItem(book3.book, book3.listing, 430);
    // Academic: 410 books
    await createOrderWithItem(book2.book, book2.listing, 410);
    // SciFi: 150 books
    await createOrderWithItem(book4.book, book4.listing, 150);
    // History: 80 books
    await createOrderWithItem(book5.book, book5.listing, 80);
    // Total = 580 + 430 + 410 + 150 + 80 = 1650 books sold.
    // Top 3:
    // 1. Fiction Novels: 580 (35.2%)
    // 2. Poetry & Classic: 430 (26.1%)
    // 3. Academic: 410 (24.8%)
    // Others (SciFi 150 + History 80): 230 (13.9%)

    console.log("Seeded orders for all categories successfully.");

    // Test 4: GET /api/v1/dashboard/category-breakdown
    console.log("\n[Test 4] GET /api/v1/dashboard/category-breakdown -> Verify Top 3 + 1 Others breakdown");
    const res4 = await makeRequest(
      port,
      "/api/v1/dashboard/category-breakdown",
      "GET",
      undefined,
      sellerToken,
    );
    console.log(`Status: ${res4.status}`);
    console.log("Response Data:", JSON.stringify(res4.body?.data, null, 2));

    if (res4.status !== 200 || !res4.body?.data) {
      throw new Error(`Expected 200 with data, got ${res4.status}`);
    }

    const breakdown = res4.body.data;

    if (breakdown.totalBooksSold !== 1650) {
      throw new Error(`Expected totalBooksSold to be 1650, got ${breakdown.totalBooksSold}`);
    }

    if (breakdown.items.length !== 4) {
      throw new Error(`Expected 4 items (Top 3 + 1 Others), got ${breakdown.items.length}`);
    }

    const [item1, item2, item3, item4] = breakdown.items;

    // Item 1: Fiction Novels (580, 35.2%)
    if (item1.name !== "Fiction Novels" || item1.booksSold !== 580 || item1.percentage !== 35.2) {
      throw new Error(`Item 1 mismatch: expected Fiction Novels (580, 35.2%), got ${item1.name} (${item1.booksSold}, ${item1.percentage}%)`);
    }

    // Item 2: Poetry & Classic (430, 26.1%)
    if (item2.name !== "Poetry & Classic" || item2.booksSold !== 430 || item2.percentage !== 26.1) {
      throw new Error(`Item 2 mismatch: expected Poetry & Classic (430, 26.1%), got ${item2.name} (${item2.booksSold}, ${item2.percentage}%)`);
    }

    // Item 3: Academic (410, 24.8%)
    if (item3.name !== "Academic" || item3.booksSold !== 410 || item3.percentage !== 24.8) {
      throw new Error(`Item 3 mismatch: expected Academic (410, 24.8%), got ${item3.name} (${item3.booksSold}, ${item3.percentage}%)`);
    }

    // Item 4: Others (230, 13.9%)
    if (item4.name !== "Others" || item4.booksSold !== 230 || item4.percentage !== 13.9 || item4.isOthers !== true) {
      throw new Error(`Item 4 (Others) mismatch: expected Others (230, 13.9%), got ${item4.name} (${item4.booksSold}, ${item4.percentage}%)`);
    }

    console.log("✅ Test 4 Passed: Top 3 and 1 Others categories calculated accurately with percentages");

    // Test 5: GET /api/v1/dashboard/genre-breakdown alias route
    console.log("\n[Test 5] GET /api/v1/dashboard/genre-breakdown alias route -> Expect 200 OK");
    const res5 = await makeRequest(
      port,
      "/api/v1/dashboard/genre-breakdown",
      "GET",
      undefined,
      sellerToken,
    );
    if (res5.status !== 200 || res5.body?.data?.totalBooksSold !== 1650) {
      throw new Error(`Expected status 200 with 1650 books sold, got ${res5.status}`);
    }
    console.log("✅ Test 5 Passed: Alias /genre-breakdown functions identically");

    console.log("\n=======================================================");
    console.log("   🎉 ALL CATEGORY BREAKDOWN TESTS PASSED! 🎉");
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

void runCategoryBreakdownTests();

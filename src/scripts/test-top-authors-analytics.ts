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

const runTopAuthorsTests = async () => {
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
    console.log("   TEST TOP AUTHORS VOLUME & AUTHOR SALES SHARE API");
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

    // Create test user IDs
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
    console.log("\n[Test 1] GET /api/v1/dashboard/top-authors without token -> Expect 401");
    const res1 = await makeRequest(port, "/api/v1/dashboard/top-authors", "GET");
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 401) {
      throw new Error(`Expected 401, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthenticated request rejected with 401");

    // Test 2: Authenticated with BUYER role -> Expect 403
    console.log("\n[Test 2] GET /api/v1/dashboard/top-authors with BUYER token -> Expect 403");
    const res2 = await makeRequest(
      port,
      "/api/v1/dashboard/top-authors",
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
    console.log("\n[Test 3] GET /api/v1/dashboard/top-authors (empty state) -> Expect 200");
    const res3 = await makeRequest(
      port,
      "/api/v1/dashboard/top-authors",
      "GET",
      undefined,
      sellerToken,
    );
    console.log(`Status: ${res3.status}`);
    console.log("Empty Response Data:", res3.body?.data);
    if (res3.status !== 200 || !res3.body?.data) {
      throw new Error(`Expected 200 with data, got ${res3.status}`);
    }
    if (res3.body.data.totalCopiesSold !== 0 || res3.body.data.items.length !== 0) {
      throw new Error("Empty state did not return 0 copies sold");
    }
    console.log("✅ Test 3 Passed: Empty state returns valid empty author breakdown");

    // Seed shared Publisher & Category
    const publisher = await PublisherModel.create({
      name: "Top Author Publisher",
      slug: `top-author-pub-${Date.now()}`,
    });
    cleanupPublisherIds.push(publisher._id);

    const category = await CategoryModel.create({
      name: "Literature & Classics",
      slug: `lit-classics-${Date.now()}`,
    });
    cleanupCategoryIds.push(category._id);

    // Seed 6 Authors matching prompt requirements
    const author1 = await AuthorModel.create({
      name: "Rabindranath Tagore",
      nameBn: "রবীন্দ্রনাথ ঠাকুর",
      slug: `r-tagore-${Date.now()}`,
      photo: "https://example.com/tagore.jpg",
    });
    const author2 = await AuthorModel.create({
      name: "Humayun Ahmed",
      nameBn: "হুমায়ূন আহমেদ",
      slug: `h-ahmed-${Date.now()}`,
      photo: "https://example.com/ahmed.jpg",
    });
    const author3 = await AuthorModel.create({
      name: "Satyajit Ray",
      nameBn: "সত্যজিৎ রায়",
      slug: `s-ray-${Date.now()}`,
      photo: "https://example.com/ray.jpg",
    });
    const author4 = await AuthorModel.create({
      name: "Arundhati Roy",
      nameBn: "অরুন্ধতী রায়",
      slug: `a-roy-${Date.now()}`,
      photo: "https://example.com/roy.jpg",
    });
    const author5 = await AuthorModel.create({
      name: "R. K. Narayan",
      nameBn: "আর. কে. নারায়ণ",
      slug: `rk-narayan-${Date.now()}`,
      photo: "https://example.com/narayan.jpg",
    });
    const author6 = await AuthorModel.create({
      name: "Jhumpa Lahiri",
      nameBn: "ঝুম্পা লাহিড়ী",
      slug: `j-lahiri-${Date.now()}`,
      photo: "https://example.com/lahiri.jpg",
    });

    cleanupAuthorIds.push(
      author1._id,
      author2._id,
      author3._id,
      author4._id,
      author5._id,
      author6._id,
    );

    // Helper to setup book and listing for an author
    const setupBookAndListing = async (
      title: string,
      authorDoc: any,
    ) => {
      const book = await BookModel.create({
        title,
        slug: `${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        authors: [authorDoc._id],
        publisher: publisher._id,
        categories: [category._id],
        description: "Test description for book",
        coverImage: "https://example.com/cover.jpg",
        createdBy: sellerId,
        status: "ACTIVE",
      });
      cleanupBookIds.push(book._id);

      const listing = await BookListingModel.create({
        book: book._id,
        seller: sellerId,
        mrpInPaise: 60000,
        sellingPriceInPaise: 45000,
        stock: 10000,
        isActive: true,
      });
      cleanupListingIds.push(listing._id);

      return { book, listing };
    };

    const book1 = await setupBookAndListing("Gitanjali", author1);
    const book2 = await setupBookAndListing("Misir Ali Series", author2);
    const book3 = await setupBookAndListing("Feluda Stories", author3);
    const book4 = await setupBookAndListing("The God of Small Things", author4);
    const book5 = await setupBookAndListing("Malgudi Days", author5);
    const book6 = await setupBookAndListing("The Namesake", author6);

    // Helper to create order for a book
    const createOrderWithItem = async (
      book: any,
      listing: any,
      quantity: number,
    ) => {
      const order = await OrderModel.create({
        orderNumber: `ORD-AUTH-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        buyer: buyerId,
        items: [
          {
            bookListing: listing._id,
            book: book._id,
            seller: sellerId,
            title: book.title,
            priceInPaise: 45000,
            quantity,
            subtotalInPaise: 45000 * quantity,
          },
        ],
        totalAmountInPaise: 45000 * quantity,
        paymentStatus: "PAID",
        orderStatus: "DELIVERED",
        paymentMethod: "ONLINE_PAY",
        shippingAddress: {
          fullName: "Test Customer",
          email: "customer@example.com",
          mobileNumber: "+919876543210",
          addressLine1: "123 Street",
          city: "Kolkata",
          state: "West Bengal",
          postalCode: "700001",
          country: "India",
        },
      });
      cleanupOrderIds.push(order._id);
    };

    console.log("\nSeeding orders for 6 authors...");
    // 1. Rabindranath Tagore: 624 sold
    await createOrderWithItem(book1.book, book1.listing, 624);
    // 2. Humayun Ahmed: 518 sold
    await createOrderWithItem(book2.book, book2.listing, 518);
    // 3. Satyajit Ray: 482 sold
    await createOrderWithItem(book3.book, book3.listing, 482);
    // 4. Arundhati Roy: 395 sold
    await createOrderWithItem(book4.book, book4.listing, 395);
    // 5. R. K. Narayan: 340 sold
    await createOrderWithItem(book5.book, book5.listing, 340);
    // 6. Jhumpa Lahiri: 100 sold
    await createOrderWithItem(book6.book, book6.listing, 100);

    // Total copies sold = 624 + 518 + 482 + 395 + 340 + 100 = 2459 copies sold.
    console.log("Seeded orders successfully.");

    // Test 4: GET /api/v1/dashboard/top-authors -> Verify Top 5 Authors Volume
    console.log("\n[Test 4] GET /api/v1/dashboard/top-authors -> Verify Top 5 Authors by Sales");
    const res4 = await makeRequest(
      port,
      "/api/v1/dashboard/top-authors",
      "GET",
      undefined,
      sellerToken,
    );
    console.log(`Status: ${res4.status}`);
    console.log("Top Authors Response:", JSON.stringify(res4.body?.data, null, 2));

    if (res4.status !== 200 || !res4.body?.data) {
      throw new Error(`Expected 200 with data, got ${res4.status}`);
    }

    const data = res4.body.data;

    if (data.totalCopiesSold !== 2459) {
      throw new Error(`Expected totalCopiesSold to be 2459, got ${data.totalCopiesSold}`);
    }

    if (data.activeAuthorsInCatalogCount !== 6) {
      throw new Error(`Expected activeAuthorsInCatalogCount to be 6, got ${data.activeAuthorsInCatalogCount}`);
    }

    if (data.items.length !== 5) {
      throw new Error(`Expected 5 items (Top 5 default limit), got ${data.items.length}`);
    }

    const [a1, a2, a3, a4, a5] = data.items;

    // Rank 1: Rabindranath Tagore (624 sold, ~25.4%)
    if (a1.rank !== 1 || a1.name !== "Rabindranath Tagore" || a1.booksSold !== 624 || a1.percentage !== 25.4) {
      throw new Error(`Rank 1 mismatch: expected Rabindranath Tagore (624 sold, 25.4%), got ${a1.name} (${a1.booksSold} sold, ${a1.percentage}%)`);
    }
    if (a1.formattedBooksSold !== "624 sold") {
      throw new Error(`Rank 1 formattedBooksSold mismatch: got ${a1.formattedBooksSold}`);
    }

    // Rank 2: Humayun Ahmed (518 sold, ~21.1%)
    if (a2.rank !== 2 || a2.name !== "Humayun Ahmed" || a2.booksSold !== 518 || a2.percentage !== 21.1) {
      throw new Error(`Rank 2 mismatch: expected Humayun Ahmed (518 sold, 21.1%), got ${a2.name} (${a2.booksSold} sold, ${a2.percentage}%)`);
    }

    // Rank 3: Satyajit Ray (482 sold, ~19.6%)
    if (a3.rank !== 3 || a3.name !== "Satyajit Ray" || a3.booksSold !== 482 || a3.percentage !== 19.6) {
      throw new Error(`Rank 3 mismatch: expected Satyajit Ray (482 sold, 19.6%), got ${a3.name} (${a3.booksSold} sold, ${a3.percentage}%)`);
    }

    // Rank 4: Arundhati Roy (395 sold, ~16.1%)
    if (a4.rank !== 4 || a4.name !== "Arundhati Roy" || a4.booksSold !== 395 || a4.percentage !== 16.1) {
      throw new Error(`Rank 4 mismatch: expected Arundhati Roy (395 sold, 16.1%), got ${a4.name} (${a4.booksSold} sold, ${a4.percentage}%)`);
    }

    // Rank 5: R. K. Narayan (340 sold, ~13.8%)
    if (a5.rank !== 5 || a5.name !== "R. K. Narayan" || a5.booksSold !== 340 || a5.percentage !== 13.8) {
      throw new Error(`Rank 5 mismatch: expected R. K. Narayan (340 sold, 13.8%), got ${a5.name} (${a5.booksSold} sold, ${a5.percentage}%)`);
    }

    console.log("✅ Test 4 Passed: Top 5 authors ranked and calculated accurately with volume shares");

    // Test 5: GET /api/v1/dashboard/seller/top-authors-volume alias route
    console.log("\n[Test 5] GET /api/v1/dashboard/seller/top-authors-volume -> Expect 200 OK");
    const res5 = await makeRequest(
      port,
      "/api/v1/dashboard/seller/top-authors-volume",
      "GET",
      undefined,
      sellerToken,
    );
    if (res5.status !== 200 || res5.body?.data?.totalCopiesSold !== 2459) {
      throw new Error(`Expected status 200 with 2459 copies sold, got ${res5.status}`);
    }
    console.log("✅ Test 5 Passed: Alias /seller/top-authors-volume functions identically");

    console.log("\n=======================================================");
    console.log("   🎉 ALL TOP AUTHORS ANALYTICS TESTS PASSED! 🎉");
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
    process.exit(0);
  }
};

void runTopAuthorsTests();

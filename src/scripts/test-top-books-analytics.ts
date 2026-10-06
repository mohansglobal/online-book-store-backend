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

const runTopBooksTests = async () => {
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
    console.log("   TEST TOP SELLING BOOKS ANALYTICS API");
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

    // Create test entities
    const admin = await UserModel.create({
      name: "[TEST] Admin User",
      email: `test_admin_${Date.now()}@test.com`,
      password: "dummy",
      role: "ADMIN",
      isActive: true,
      mobileNumber: `+9199999${Math.floor(1000 + Math.random() * 9000)}`,
    });
    cleanupUserIds.push(admin._id);

    const seller = await UserModel.create({
      name: "[TEST] Seller User",
      email: `test_seller_${Date.now()}@test.com`,
      password: "dummy",
      role: "SELLER",
      isActive: true,
      mobileNumber: `+9188888${Math.floor(1000 + Math.random() * 9000)}`,
    });
    cleanupUserIds.push(seller._id);

    const author = await AuthorModel.create({
      name: "[TEST] Author",
      slug: `test-author-${Date.now()}`,
    });
    cleanupAuthorIds.push(author._id);

    const publisher = await PublisherModel.create({
      name: "[TEST] Publisher",
      slug: `test-publisher-${Date.now()}`,
    });
    cleanupPublisherIds.push(publisher._id);

    const category = await CategoryModel.create({
      name: "[TEST] Category",
      slug: `test-category-${Date.now()}`,
    });
    cleanupCategoryIds.push(category._id);

    const book1 = await BookModel.create({
      title: "[TEST] Book 1",
      slug: `test-book-1-${Date.now()}`,
      description: "Test description",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      status: "ACTIVE",
      createdBy: admin._id,
    });
    cleanupBookIds.push(book1._id);

    const book2 = await BookModel.create({
      title: "[TEST] Book 2",
      slug: `test-book-2-${Date.now()}`,
      description: "Test description 2",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      status: "ACTIVE",
      createdBy: admin._id,
    });
    cleanupBookIds.push(book2._id);

    const order = await OrderModel.create({
      buyer: admin._id,
      orderNumber: `TEST-ORD-${Date.now()}`,
      orderStatus: "DELIVERED",
      paymentStatus: "PAID",
      items: [
        {
          bookListing: new mongoose.Types.ObjectId(),
          book: book1._id,
          seller: seller._id,
          title: book1.title,
          priceInPaise: 10000,
          quantity: 10,
          subtotalInPaise: 100000,
          status: "DELIVERED",
        },
        {
          bookListing: new mongoose.Types.ObjectId(),
          book: book2._id,
          seller: seller._id,
          title: book2.title,
          priceInPaise: 20000,
          quantity: 5,
          subtotalInPaise: 100000,
          status: "DELIVERED",
        },
      ],
      shippingAddress: {
        fullName: "Test",
        mobileNumber: "1234567890",
        streetAddress: "123 Test St",
        city: "Test City",
        postalCode: "123456",
        country: "India",
      },
      billingAddress: {
        fullName: "Test",
        mobileNumber: "1234567890",
        streetAddress: "123 Test St",
        city: "Test City",
        postalCode: "123456",
        country: "India",
      },
      totalAmountInPaise: 200000,
    });
    cleanupOrderIds.push(order._id);

    const adminToken = generateAccessToken({ sub: admin._id.toString(), role: "ADMIN" });

    console.log("\n--- Testing Top Books API ---");
    const res = await makeRequest(port, "/api/v1/dashboard/top-books?timeframe=all", "GET", undefined, adminToken);

    if (res.status !== 200) {
      console.error("Failed to fetch top books:", res.body);
      throw new Error(`Expected 200, got ${res.status}`);
    }

    const data = res.body.data;
    console.log("Response data:", JSON.stringify(data, null, 2));

    let book1Found = false;
    let book2Found = false;

    for (const item of data.items) {
      if (item.bookId === book1._id.toString()) {
        book1Found = true;
        if (item.unitsSold !== 10) throw new Error("Units sold for book 1 mismatch");
      }
      if (item.bookId === book2._id.toString()) {
        book2Found = true;
        if (item.unitsSold !== 5) throw new Error("Units sold for book 2 mismatch");
      }
    }

    if (!book1Found || !book2Found) {
      throw new Error("Books not found in response");
    }

    console.log("✅ Top Books Analytics API tests passed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exitCode = 1;
  } finally {
    console.log("\n--- Cleaning up test data ---");

    if (cleanupOrderIds.length > 0) {
      await OrderModel.deleteMany({ _id: { $in: cleanupOrderIds } });
      console.log(`Deleted ${cleanupOrderIds.length} test orders`);
    }

    if (cleanupBookIds.length > 0) {
      await BookModel.deleteMany({ _id: { $in: cleanupBookIds } });
      console.log(`Deleted ${cleanupBookIds.length} test books`);
    }

    if (cleanupListingIds.length > 0) {
      await BookListingModel.deleteMany({ _id: { $in: cleanupListingIds } });
      console.log(`Deleted ${cleanupListingIds.length} test listings`);
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
    console.log("Disconnected from MongoDB");
  }
};

runTopBooksTests();

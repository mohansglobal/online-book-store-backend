import http from "http";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import app from "../app.js";
import { env } from "../config/env.js";
import {
  UserModel,
  AuthorModel,
  PublisherModel,
  CategoryModel,
  BookModel,
  BookListingModel,
  OrderModel,
  ReviewModel,
} from "../models/index.js";
import { logger } from "../utils/logger.js";

const runTests = async () => {
  let server: http.Server | null = null;

  try {
    console.log("\n=======================================================");
    console.log("   TEST BOOK LISTING RATINGS & RATING COUNT API");
    console.log("=======================================================\n");

    logger.info("Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    // Start ephemeral server
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine server port");
    }
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    logger.info(`Test server running at ${baseUrl}`);

    const TEST_PREFIX = `test_rating_${Date.now()}`;
    const hashedPassword = await bcrypt.hash("Password123!", 10);

    // 1. Create Seller & Buyer
    const seller = await UserModel.create({
      name: "Rating Test Seller",
      email: `${TEST_PREFIX}_seller@example.com`,
      password: hashedPassword,
      role: "SELLER",
      isActive: true,
      isEmailVerified: true,
    });

    const buyer1 = await UserModel.create({
      name: "Rating Test Buyer 1",
      email: `${TEST_PREFIX}_buyer1@example.com`,
      password: hashedPassword,
      role: "BUYER",
      isActive: true,
      isEmailVerified: true,
    });

    const buyer2 = await UserModel.create({
      name: "Rating Test Buyer 2",
      email: `${TEST_PREFIX}_buyer2@example.com`,
      password: hashedPassword,
      role: "BUYER",
      isActive: true,
      isEmailVerified: true,
    });

    // 2. Create Author, Publisher, Category
    const author = await AuthorModel.create({
      name: `Author ${TEST_PREFIX}`,
      slug: `author-${TEST_PREFIX}`,
      isActive: true,
    });

    const publisher = await PublisherModel.create({
      name: `Publisher ${TEST_PREFIX}`,
      slug: `pub-${TEST_PREFIX}`,
      isActive: true,
    });

    const category = await CategoryModel.create({
      name: `Category ${TEST_PREFIX}`,
      slug: `cat-${TEST_PREFIX}`,
      isActive: true,
    });

    // 3. Create Book
    const book = await BookModel.create({
      title: `Rating Test Book ${TEST_PREFIX}`,
      slug: `book-${TEST_PREFIX}`,
      isbn: `ISBN-${TEST_PREFIX}`,
      description: "Test description for book ratings",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/cover.jpg",
      createdBy: seller._id,
      status: "ACTIVE",
    });

    // 4. Create Book Listing
    const listing = await BookListingModel.create({
      book: book._id,
      seller: seller._id,
      mrpInPaise: 50000,
      sellingPriceInPaise: 40000,
      stock: 25,
      sku: `SKU-${TEST_PREFIX}`,
      isActive: true,
    });

    // 5. Create Delivered Orders for both buyers
    const order1 = await OrderModel.create({
      orderNumber: `ORD1-${TEST_PREFIX}`,
      buyer: buyer1._id,
      items: [
        {
          book: book._id,
          bookListing: listing._id,
          seller: seller._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
        },
      ],
      shippingAddress: {
        fullName: "Buyer 1",
        mobileNumber: "9876543210",
        city: "Kolkata",
        state: "West Bengal",
        postalCode: "700001",
        country: "India",
      },
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "PAID",
      orderStatus: "DELIVERED",
      subtotalInPaise: 40000,
      totalAmountInPaise: 40000,
    });

    const order2 = await OrderModel.create({
      orderNumber: `ORD2-${TEST_PREFIX}`,
      buyer: buyer2._id,
      items: [
        {
          book: book._id,
          bookListing: listing._id,
          seller: seller._id,
          title: book.title,
          priceInPaise: 40000,
          quantity: 1,
          subtotalInPaise: 40000,
        },
      ],
      shippingAddress: {
        fullName: "Buyer 2",
        mobileNumber: "9876543211",
        city: "Kolkata",
        state: "West Bengal",
        postalCode: "700001",
        country: "India",
      },
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "PAID",
      orderStatus: "DELIVERED",
      subtotalInPaise: 40000,
      totalAmountInPaise: 40000,
    });

    // 6. Create Approved Reviews: 5 stars from buyer 1, 4 stars from buyer 2 -> Average 4.5, total 2
    await ReviewModel.create({
      user: buyer1._id,
      book: book._id,
      seller: seller._id,
      bookListing: listing._id,
      order: order1._id,
      rating: 5,
      title: "Superb seller & book",
      review: "Delivered fast in excellent quality.",
      status: "APPROVED",
      isVerifiedPurchase: true,
    });

    await ReviewModel.create({
      user: buyer2._id,
      book: book._id,
      seller: seller._id,
      bookListing: listing._id,
      order: order2._id,
      rating: 4,
      title: "Great read",
      review: "Very good book condition.",
      status: "APPROVED",
      isVerifiedPurchase: true,
    });

    console.log("Fixtures created successfully. Testing APIs...\n");

    // TEST 1: GET /api/v1/book-listings?seller=...
    const res1 = await fetch(`${baseUrl}/book-listings?seller=${seller._id}`);
    const data1 = await res1.json();
    console.log("1. GET /api/v1/book-listings response status:", res1.status);
    const matchedListing = data1.data?.find((l: any) => l._id === listing._id.toString());
    console.log("Listing in /book-listings:", {
      rating: matchedListing?.rating,
      averageRating: matchedListing?.averageRating,
      ratingCount: matchedListing?.ratingCount,
      totalRatings: matchedListing?.totalRatings,
      totalReviews: matchedListing?.totalReviews,
    });

    if (
      matchedListing?.rating === 4.5 &&
      matchedListing?.averageRating === 4.5 &&
      matchedListing?.ratingCount === 2 &&
      matchedListing?.totalRatings === 2
    ) {
      console.log("✅ TEST 1 PASSED: GET /api/v1/book-listings returns accurate rating and ratingCount!");
    } else {
      throw new Error(`TEST 1 FAILED: Expected rating 4.5 and ratingCount 2, got ${JSON.stringify(matchedListing)}`);
    }

    // TEST 1b: GET /api/v1/listings?seller=...
    const res1b = await fetch(`${baseUrl}/listings?seller=${seller._id}`);
    const data1b = await res1b.json();
    console.log("\n1b. GET /api/v1/listings response status:", res1b.status);
    const matchedListingB = data1b.data?.find((l: any) => l._id === listing._id.toString());
    if (
      matchedListingB?.rating === 4.5 &&
      matchedListingB?.ratingCount === 2
    ) {
      console.log("✅ TEST 1b PASSED: GET /api/v1/listings returns accurate rating and ratingCount!");
    } else {
      throw new Error(`TEST 1b FAILED: Expected rating 4.5 and ratingCount 2, got ${JSON.stringify(matchedListingB)}`);
    }

    // TEST 2: GET /api/v1/book-listings/:id
    const res2 = await fetch(`${baseUrl}/book-listings/${listing._id}`);
    const data2 = await res2.json();
    console.log("\n2. GET /api/v1/book-listings/:id response status:", res2.status);
    console.log("Listing detail rating:", {
      rating: data2.data?.rating,
      averageRating: data2.data?.averageRating,
      ratingCount: data2.data?.ratingCount,
      totalRatings: data2.data?.totalRatings,
      ratingBreakdown: data2.data?.ratingBreakdown,
    });

    if (
      data2.data?.rating === 4.5 &&
      data2.data?.averageRating === 4.5 &&
      data2.data?.ratingCount === 2 &&
      data2.data?.totalRatings === 2 &&
      data2.data?.ratingBreakdown?.[5] === 1 &&
      data2.data?.ratingBreakdown?.[4] === 1
    ) {
      console.log("✅ TEST 2 PASSED: GET /api/v1/book-listings/:id returns accurate rating, count and breakdown!");
    } else {
      throw new Error(`TEST 2 FAILED: Expected rating 4.5, count 2 with breakdown, got ${JSON.stringify(data2.data)}`);
    }

    // TEST 3: GET /api/v1/books?search=...
    const res3 = await fetch(`${baseUrl}/books?search=${TEST_PREFIX}`);
    const data3 = await res3.json();
    console.log("\n3. GET /api/v1/books response status:", res3.status);
    const bookCard = data3.data?.find((b: any) => b.listingId === listing._id.toString());
    console.log("Book card rating:", {
      rating: bookCard?.rating,
      averageRating: bookCard?.averageRating,
      ratingCount: bookCard?.ratingCount,
      totalRatings: bookCard?.totalRatings,
    });

    if (
      bookCard?.rating === 4.5 &&
      bookCard?.averageRating === 4.5 &&
      bookCard?.ratingCount === 2 &&
      bookCard?.totalRatings === 2
    ) {
      console.log("✅ TEST 3 PASSED: GET /api/v1/books returns accurate seller book rating & count!");
    } else {
      throw new Error(`TEST 3 FAILED: Expected rating 4.5 and ratingCount 2, got ${JSON.stringify(bookCard)}`);
    }

    // TEST 4: GET /api/v1/books/:idOrSlug
    const res4 = await fetch(`${baseUrl}/books/${book.slug}`);
    const data4 = await res4.json();
    console.log("\n4. GET /api/v1/books/:idOrSlug response status:", res4.status);
    console.log("Book detail overall & listing rating:", {
      bookRating: data4.data?.rating,
      bookRatingCount: data4.data?.ratingCount,
      listingRating: data4.data?.listings?.[0]?.rating,
      listingRatingCount: data4.data?.listings?.[0]?.ratingCount,
    });

    if (
      data4.data?.rating === 4.5 &&
      data4.data?.ratingCount === 2 &&
      data4.data?.listings?.[0]?.rating === 4.5 &&
      data4.data?.listings?.[0]?.ratingCount === 2
    ) {
      console.log("✅ TEST 4 PASSED: GET /api/v1/books/:idOrSlug returns accurate overall and seller ratings!");
    } else {
      throw new Error(`TEST 4 FAILED: Expected rating 4.5 and ratingCount 2, got ${JSON.stringify(data4.data)}`);
    }

    // Clean up test data
    console.log("\nCleaning up test fixtures...");
    await ReviewModel.deleteMany({ book: book._id });
    await OrderModel.deleteMany({ _id: { $in: [order1._id, order2._id] } });
    await BookListingModel.deleteMany({ _id: listing._id });
    await BookModel.deleteMany({ _id: book._id });
    await AuthorModel.deleteMany({ _id: author._id });
    await PublisherModel.deleteMany({ _id: publisher._id });
    await CategoryModel.deleteMany({ _id: category._id });
    await UserModel.deleteMany({ _id: { $in: [seller._id, buyer1._id, buyer2._id] } });
    console.log("Clean up completed successfully!");

    console.log("\n=======================================================");
    console.log("   ALL BOOK LISTING RATING TESTS PASSED! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("Test execution error:", error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTests();

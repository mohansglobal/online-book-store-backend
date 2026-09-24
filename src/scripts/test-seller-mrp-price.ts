import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CategoryModel } from "../models/category.model.js";
import { UserModel } from "../models/user.model.js";
import { BookModel } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import {
  createBookListingService,
  updateBookListingService,
  getMyBookListingsService,
  getBookListingByIdService,
} from "../services/book-listing.service.js";
import { createBookService } from "../services/book.service.js";

const runTest = async () => {
  await connectDB();
  console.log("\n=== STARTING SELLER MRP & PRICE VERIFICATION TEST ===");

  const TEST_ID = `test_mrp_${Date.now()}`;

  // 1. Setup seed entities
  const author = await AuthorModel.create({
    name: `Author ${TEST_ID}`,
    slug: `author-${TEST_ID}`,
    bio: "Test Author Bio",
  });

  const publisher = await PublisherModel.create({
    name: `Publisher ${TEST_ID}`,
    slug: `publisher-${TEST_ID}`,
  });

  const category = await CategoryModel.create({
    name: `Category ${TEST_ID}`,
    slug: `category-${TEST_ID}`,
  });

  const seller = await UserModel.create({
    name: `Seller ${TEST_ID}`,
    email: `seller_${TEST_ID}@example.com`,
    password: "Password123!",
    role: "SELLER",
    isActive: true,
  });

  const sellerId = seller._id.toString();

  try {
    // TEST 1: Seller creates book and listing using { mrp: 699, price: 499, stock: 15 }
    console.log("\n--- TEST 1: Seller adds book with { mrp: 699, price: 499 } ---");
    const listing1 = await createBookListingService(
      {
        title: `Book 1 ${TEST_ID}`,
        isbn: `ISBN-1-${TEST_ID}`,
        publisher: publisher._id.toString(),
        authors: [author._id.toString()],
        categories: [category._id.toString()],
        description: "Test book with MRP and selling price",
        coverImage: "https://example.com/cover1.jpg",
        mrp: 699,
        price: 499,
        stock: 15,
      },
      sellerId,
    );

    const savedBook1 = await BookModel.findById(listing1.book).lean();
    console.log("Saved Book 1:", {
      price: savedBook1?.price,
      priceIn: savedBook1?.priceIn,
    });
    console.log("Saved Listing 1:", {
      mrpInPaise: listing1.mrpInPaise,
      sellingPriceInPaise: listing1.sellingPriceInPaise,
      price: (listing1 as any).price,
      mrp: (listing1 as any).mrp,
      discountPercentage: (listing1 as any).discountPercentage,
    });

    if (savedBook1?.price !== 699) {
      throw new Error(`Expected Book price to be 699, got ${savedBook1?.price}`);
    }
    if (listing1.mrpInPaise !== 69900) {
      throw new Error(`Expected Listing mrpInPaise to be 69900, got ${listing1.mrpInPaise}`);
    }
    if (listing1.sellingPriceInPaise !== 49900) {
      throw new Error(`Expected Listing sellingPriceInPaise to be 49900, got ${listing1.sellingPriceInPaise}`);
    }
    console.log("✅ TEST 1 PASSED: Book price is 699, listing mrpInPaise is 69900, sellingPriceInPaise is 49900");

    // TEST 2: Seller creates listing with { priceMrp: 850, sellingPrice: 650 }
    console.log("\n--- TEST 2: Seller adds book with { priceMrp: 850, sellingPrice: 650 } ---");
    const listing2 = await createBookListingService(
      {
        title: `Book 2 ${TEST_ID}`,
        isbn: `ISBN-2-${TEST_ID}`,
        publisher: publisher._id.toString(),
        authors: [author._id.toString()],
        categories: [category._id.toString()],
        description: "Test book with priceMrp and sellingPrice",
        coverImage: "https://example.com/cover2.jpg",
        priceMrp: 850,
        sellingPrice: 650,
        stock: 20,
      },
      sellerId,
    );

    const savedBook2 = await BookModel.findById(listing2.book).lean();
    if (savedBook2?.price !== 850) {
      throw new Error(`Expected Book price to be 850, got ${savedBook2?.price}`);
    }
    if (listing2.mrpInPaise !== 85000 || listing2.sellingPriceInPaise !== 65000) {
      throw new Error(`Expected 85000 & 65000, got ${listing2.mrpInPaise} & ${listing2.sellingPriceInPaise}`);
    }
    console.log("✅ TEST 2 PASSED: priceMrp & sellingPrice properly converted to 85000 & 65000 paise");

    // TEST 3: Seller creates listing with paise directly { mrpInPaise: 99900, sellingPriceInPaise: 79900 }
    console.log("\n--- TEST 3: Seller adds book with paise values directly ---");
    const listing3 = await createBookListingService(
      {
        title: `Book 3 ${TEST_ID}`,
        isbn: `ISBN-3-${TEST_ID}`,
        publisher: publisher._id.toString(),
        authors: [author._id.toString()],
        categories: [category._id.toString()],
        description: "Test book with paise values",
        coverImage: "https://example.com/cover3.jpg",
        mrpInPaise: 99900,
        sellingPriceInPaise: 79900,
        stock: 10,
      },
      sellerId,
    );

    const savedBook3 = await BookModel.findById(listing3.book).lean();
    if (savedBook3?.price !== 999) {
      throw new Error(`Expected Book price to be 999, got ${savedBook3?.price}`);
    }
    if (listing3.mrpInPaise !== 99900 || listing3.sellingPriceInPaise !== 79900) {
      throw new Error(`Expected 99900 & 79900, got ${listing3.mrpInPaise} & ${listing3.sellingPriceInPaise}`);
    }
    console.log("✅ TEST 3 PASSED: Direct paise values accurately saved on book (999) and listing (99900 & 79900)");

    // TEST 4: Only price provided { price: 350 } -> MRP defaults to 350
    console.log("\n--- TEST 4: Only price provided ---");
    const listing4 = await createBookListingService(
      {
        title: `Book 4 ${TEST_ID}`,
        isbn: `ISBN-4-${TEST_ID}`,
        publisher: publisher._id.toString(),
        authors: [author._id.toString()],
        categories: [category._id.toString()],
        description: "Test book with single price",
        coverImage: "https://example.com/cover4.jpg",
        price: 350,
        stock: 5,
      },
      sellerId,
    );

    if (listing4.mrpInPaise !== 35000 || listing4.sellingPriceInPaise !== 35000) {
      throw new Error(`Expected 35000 & 35000, got ${listing4.mrpInPaise} & ${listing4.sellingPriceInPaise}`);
    }
    console.log("✅ TEST 4 PASSED: Single price fallback works correctly (35000 paise each)");

    // TEST 5: Selling price > MRP should be rejected
    console.log("\n--- TEST 5: Reject selling price > MRP ---");
    let rejected = false;
    try {
      await createBookListingService(
        {
          title: `Book 5 ${TEST_ID}`,
          isbn: `ISBN-5-${TEST_ID}`,
          publisher: publisher._id.toString(),
          authors: [author._id.toString()],
          categories: [category._id.toString()],
          description: "Invalid price book",
          coverImage: "https://example.com/cover5.jpg",
          mrp: 400,
          price: 500, // Invalid: > MRP
        },
        sellerId,
      );
    } catch (err: any) {
      rejected = true;
      console.log("Caught expected error:", err.message);
    }
    if (!rejected) {
      throw new Error("Expected selling price > MRP to be rejected, but it succeeded!");
    }
    console.log("✅ TEST 5 PASSED: Selling price > MRP rejected successfully");

    // TEST 6: Update listing with new MRP and price
    console.log("\n--- TEST 6: Seller updates listing with { mrp: 799, price: 549 } ---");
    const updatedListing = await updateBookListingService(
      listing1._id.toString(),
      { id: sellerId, role: "SELLER" },
      {
        mrp: 799,
        price: 549,
      },
    );

    if (updatedListing.mrpInPaise !== 79900 || updatedListing.sellingPriceInPaise !== 54900) {
      throw new Error(`Expected 79900 & 54900, got ${updatedListing.mrpInPaise} & ${updatedListing.sellingPriceInPaise}`);
    }
    console.log("✅ TEST 6 PASSED: Listing updated with new MRP (79900) and selling price (54900)");

    // TEST 7: Query getMyBookListings and getBookListingById
    console.log("\n--- TEST 7: Verify output formatting in getMyBookListings and getBookListingById ---");
    const myListingsRes = await getMyBookListingsService(sellerId, { page: 1, limit: 10 });
    const singleListingRes = await getBookListingByIdService(listing1._id.toString());

    console.log("Single listing response price fields:", {
      price: singleListingRes.price,
      priceInPaise: singleListingRes.priceInPaise,
      mrp: singleListingRes.mrp,
      mrpInPaise: singleListingRes.mrpInPaise,
      discountPercentage: singleListingRes.discountPercentage,
    });

    if (
      singleListingRes.price !== 549 ||
      singleListingRes.priceInPaise !== 54900 ||
      singleListingRes.mrp !== 799 ||
      singleListingRes.mrpInPaise !== 79900 ||
      singleListingRes.discountPercentage !== 31
    ) {
      throw new Error("Unexpected single listing formatting");
    }

    console.log("✅ TEST 7 PASSED: Responses correctly contain price (₹549), mrp (₹799), mrpInPaise (79900), priceInPaise (54900), discountPercentage (31%)");

    console.log("\n==========================================");
    console.log("🎉 ALL SELLER MRP & PRICE TESTS PASSED!");
    console.log("==========================================\n");
  } finally {
    // Cleanup test data
    await AuthorModel.deleteOne({ _id: author._id });
    await PublisherModel.deleteOne({ _id: publisher._id });
    await CategoryModel.deleteOne({ _id: category._id });
    await UserModel.deleteOne({ _id: seller._id });
    await BookModel.deleteMany({ title: { $regex: TEST_ID } });
    await BookListingModel.deleteMany({ seller: seller._id });
    await mongoose.disconnect();
  }
};

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import { env } from "../config/env.js";
import {
  UserModel,
  CountryModel,
  AuthorModel,
  PublisherModel,
  CategoryModel,
  BookModel,
  BookListingModel,
} from "../models/index.js";
import { createBookService, updateBookService } from "../services/book.service.js";
import {
  createBookListingService,
  updateBookListingService,
} from "../services/book-listing.service.js";
import { logger } from "../utils/logger.js";

const runVerification = async () => {
  try {
    logger.info("Connecting to MongoDB for verification...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    const TEST_PREFIX = `verify_${Date.now()}`;

    // Clean up helper
    const cleanup = async () => {
      logger.info("Cleaning up verification test data...");
      await BookListingModel.deleteMany({ sku: { $regex: TEST_PREFIX } });
      await BookModel.deleteMany({ isbn: { $regex: TEST_PREFIX } });
      await UserModel.deleteMany({ email: { $regex: TEST_PREFIX } });
      await PublisherModel.deleteMany({ slug: { $regex: TEST_PREFIX } });
      await AuthorModel.deleteMany({ slug: { $regex: TEST_PREFIX } });
      await CategoryModel.deleteMany({ slug: { $regex: TEST_PREFIX } });
      await CountryModel.deleteMany({ code: { $regex: TEST_PREFIX } });
    };

    await cleanup();

    // 1. Setup Base Reference Entities
    logger.info("Setting up Country, Authors, Publishers, Categories...");
    const uniqueCode = `T${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const country = await CountryModel.create({
      name: `Test Country ${TEST_PREFIX}`,
      code: uniqueCode,
      phoneCode: "+999",
      currency: "INR",
      isActive: true,
    });

    const author1 = await AuthorModel.create({
      name: "Arthur Conan Doyle",
      slug: `arthur-conan-doyle-${TEST_PREFIX}`,
      bio: "Creator of Sherlock Holmes",
      isActive: true,
    });

    const author2 = await AuthorModel.create({
      name: "Rabindranath Tagore",
      slug: `rabindranath-tagore-${TEST_PREFIX}`,
      bio: "Nobel laureate poet and writer",
      isActive: true,
    });

    const penguinPublisher = await PublisherModel.create({
      name: "Penguin Random House",
      slug: `penguin-random-house-${TEST_PREFIX}`,
      email: `penguin_${TEST_PREFIX}@example.com`,
      isActive: true,
    });

    const abcPublisher = await PublisherModel.create({
      name: "ABC Publication",
      slug: `abc-publication-${TEST_PREFIX}`,
      email: `abc_${TEST_PREFIX}@example.com`,
      isActive: true,
    });

    const categoryFiction = await CategoryModel.create({
      name: "Fiction & Mystery",
      slug: `fiction-mystery-${TEST_PREFIX}`,
      isActive: true,
    });

    // 2. Setup Users: Normal Seller, ABC Publisher Seller, and Buyer
    logger.info("Setting up Users with different roles and publisher links...");
    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Normal Seller (no publisher link)
    const normalSeller = await UserModel.create({
      name: "John Normal Seller",
      email: `normal_seller_${TEST_PREFIX}@example.com`,
      password: passwordHash,
      mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    // ABC Publication Seller (linked to ABC Publisher)
    const abcSeller = await UserModel.create({
      name: "ABC Publication Official Store",
      email: `abc_store_${TEST_PREFIX}@example.com`,
      password: passwordHash,
      mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      role: "SELLER",
      publisher: abcPublisher._id,
      country: country._id,
      isActive: true,
    });

    // Second independent normal seller
    const bookLoverSeller = await UserModel.create({
      name: "Book Lover Booksellers",
      email: `booklover_${TEST_PREFIX}@example.com`,
      password: passwordHash,
      mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    // Normal Buyer
    const buyer = await UserModel.create({
      name: "Alice Buyer",
      email: `buyer_${TEST_PREFIX}@example.com`,
      password: passwordHash,
      mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      role: "BUYER",
      country: country._id,
      isActive: true,
    });

    // 3. Create Canonical Books
    logger.info("Creating Canonical Books...");
    // Book 1: Published by Penguin
    const penguinBook = await createBookService(
      {
        title: "A Study in Scarlet",
        isbn: `ISBN-PENGUIN-${TEST_PREFIX}`,
        description: "The first Sherlock Holmes adventure.",
        authors: [author1._id.toString()],
        publisher: penguinPublisher._id.toString(),
        categories: [categoryFiction._id.toString()],
        language: "English",
        searchTags: ["sherlock", "detective"],
        format: "PAPERBACK",
        coverImage: "https://example.com/study-in-scarlet.jpg",
        status: "ACTIVE",
      },
      normalSeller._id.toString(),
    );

    // Book 2: Published by ABC Publication
    const abcBook = await createBookService(
      {
        title: "Gitanjali (Song Offerings)",
        isbn: `ISBN-ABC-${TEST_PREFIX}`,
        description: "Poetry collection by Rabindranath Tagore.",
        authors: [author2._id.toString()],
        publisher: abcPublisher._id.toString(),
        categories: [categoryFiction._id.toString()],
        language: "English",
        searchTags: ["tagore", "poetry"],
        format: "HARDCOVER",
        coverImage: "https://example.com/gitanjali.jpg",
        status: "ACTIVE",
      },
      abcSeller._id.toString(),
    );

    console.log("\n=======================================================");
    console.log("   BOOKSTORE REFACTORING VERIFICATION TEST SUITE");
    console.log("=======================================================\n");

    // TEST CASE 1: Normal seller sells Penguin book
    console.log("TEST 1: Normal seller sells Penguin book");
    const listing1 = await createBookListingService(
      {
        book: penguinBook._id.toString(),
        mrpInPaise: 49900, // Rs 499.00
        sellingPriceInPaise: 39900, // Rs 399.00
        stock: 50,
        sku: `SKU-NORMAL-PENGUIN-${TEST_PREFIX}`,
        isActive: true,
      },
      normalSeller._id.toString(),
    );
    if (
      listing1.seller.toString() === normalSeller._id.toString() &&
      listing1.book.toString() === penguinBook._id.toString() &&
      listing1.sellingPriceInPaise === 39900
    ) {
      console.log("  ✅ SUCCESS: Normal seller successfully listed Penguin book at Rs 399 (stock: 50)");
    } else {
      throw new Error("Test 1 failed");
    }

    // TEST CASE 2: ABC Publication seller sells own book
    console.log("\nTEST 2: ABC Publication seller sells own book");
    const listing2 = await createBookListingService(
      {
        book: abcBook._id.toString(),
        mrpInPaise: 65000, // Rs 650.00
        sellingPriceInPaise: 52000, // Rs 520.00 (20% off)
        stock: 100,
        sku: `SKU-ABC-OWN-${TEST_PREFIX}`,
        isActive: true,
      },
      abcSeller._id.toString(),
    );
    if (
      listing2.seller.toString() === abcSeller._id.toString() &&
      listing2.book.toString() === abcBook._id.toString() &&
      listing2.stock === 100
    ) {
      console.log("  ✅ SUCCESS: ABC Publication seller successfully listed its own book at Rs 520 (stock: 100)");
    } else {
      throw new Error("Test 2 failed");
    }

    // TEST CASE 3: ABC Publication seller sells Penguin book
    console.log("\nTEST 3: ABC Publication seller sells Penguin book (3rd party publisher)");
    const listing3 = await createBookListingService(
      {
        book: penguinBook._id.toString(),
        mrpInPaise: 49900,
        sellingPriceInPaise: 35000, // Rs 350.00 (competitive discount)
        stock: 25,
        sku: `SKU-ABC-PENGUIN-${TEST_PREFIX}`,
        isActive: true,
      },
      abcSeller._id.toString(),
    );
    if (
      listing3.seller.toString() === abcSeller._id.toString() &&
      listing3.book.toString() === penguinBook._id.toString() &&
      listing3.sellingPriceInPaise === 35000
    ) {
      console.log("  ✅ SUCCESS: ABC Publication seller successfully listed Penguin book at Rs 350 (stock: 25)");
    } else {
      throw new Error("Test 3 failed");
    }

    // TEST CASE 4: Same book has multiple sellers with different prices and stock
    console.log("\nTEST 4: Same book has multiple sellers with different prices and stock");
    const listing4 = await createBookListingService(
      {
        book: penguinBook._id.toString(),
        mrpInPaise: 49900,
        sellingPriceInPaise: 42000, // Rs 420.00
        stock: 12,
        sku: `SKU-BOOKLOVER-PENGUIN-${TEST_PREFIX}`,
        isActive: true,
      },
      bookLoverSeller._id.toString(),
    );

    const allPenguinListings = await BookListingModel.find({
      book: penguinBook._id,
    }).populate("seller", "name role");

    console.log(`  Found ${allPenguinListings.length} distinct listings for '${penguinBook.title}':`);
    for (const l of allPenguinListings) {
      console.log(
        `    - Seller: ${(l.seller as unknown as { name: string }).name} | Price: Rs ${l.sellingPriceInPaise / 100} (MRP: Rs ${l.mrpInPaise / 100}) | Stock: ${l.stock}`,
      );
    }
    if (allPenguinListings.length === 3) {
      console.log("  ✅ SUCCESS: 3 independent sellers have distinct prices & stock for the same book");
    } else {
      throw new Error("Test 4 failed");
    }

    // TEST CASE 5: Buyer creating listing -> MUST BE REJECTED
    console.log("\nTEST 5: Buyer attempting to create a listing (Security / Role check)");
    let buyerRejected = false;
    try {
      await createBookListingService(
        {
          book: penguinBook._id.toString(),
          mrpInPaise: 49900,
          sellingPriceInPaise: 30000,
          stock: 10,
        },
        buyer._id.toString(),
      );
    } catch (err: unknown) {
      buyerRejected = true;
      console.log(`  Expected error caught: ${(err as Error).message}`);
    }
    if (buyerRejected) {
      console.log("  ✅ SUCCESS: Buyer was forbidden from creating a book listing");
    } else {
      throw new Error("Test 5 failed: Buyer was unexpectedly allowed to create a listing");
    }

    // TEST CASE 6: Changing one seller's price/stock does not affect others
    console.log("\nTEST 6: Changing Seller A's price/stock does not affect Seller B's listing");
    await updateBookListingService(
      listing1._id.toString(),
      { id: normalSeller._id.toString(), role: "SELLER" },
      { sellingPriceInPaise: 31000, stock: 99 },
    );

    const reloadedListing1 = await BookListingModel.findById(listing1._id);
    const reloadedListing3 = await BookListingModel.findById(listing3._id);

    if (
      reloadedListing1?.sellingPriceInPaise === 31000 &&
      reloadedListing1?.stock === 99 &&
      reloadedListing3?.sellingPriceInPaise === 35000 &&
      reloadedListing3?.stock === 25
    ) {
      console.log("  ✅ SUCCESS: Seller A updated to Rs 310 / stock 99 without affecting Seller B (Rs 350 / stock 25)");
    } else {
      throw new Error("Test 6 failed: Cross-seller listing mutation detected");
    }

    // TEST CASE 7: Duplicate listing for same (book, seller) rejected by unique index
    console.log("\nTEST 7: Duplicate listing for same (book, seller) rejected");
    let duplicateRejected = false;
    try {
      await createBookListingService(
        {
          book: penguinBook._id.toString(),
          mrpInPaise: 49900,
          sellingPriceInPaise: 32000,
          stock: 5,
        },
        normalSeller._id.toString(),
      );
    } catch (err: unknown) {
      duplicateRejected = true;
      console.log(`  Expected error caught: ${(err as Error).message}`);
    }
    if (duplicateRejected) {
      console.log("  ✅ SUCCESS: Duplicate listing for identical (book, seller) was rejected");
    } else {
      throw new Error("Test 7 failed: Duplicate listing allowed");
    }

    // TEST CASE 8: Canonical Book ownership (createdBy) and edit permissions
    console.log("\nTEST 8: Canonical Book createdBy ownership and edit permission checks");
    // Normal seller created penguinBook. abcSeller attempts to edit penguinBook -> MUST BE FORBIDDEN
    let editRejected = false;
    try {
      await updateBookService(
        penguinBook._id.toString(),
        { id: abcSeller._id.toString(), role: "SELLER" },
        { title: "Hacked Title by Another Seller" },
      );
    } catch (err: unknown) {
      editRejected = true;
      console.log(`  Expected error caught: ${(err as Error).message}`);
    }
    if (editRejected) {
      console.log("  ✅ SUCCESS: Non-creator seller is forbidden from editing canonical book");
    } else {
      throw new Error("Test 8 failed: Non-creator was able to edit canonical book");
    }

    // Creator updating own book -> SUCCESS
    const updatedPenguinBook = await updateBookService(
      penguinBook._id.toString(),
      { id: normalSeller._id.toString(), role: "SELLER" },
      { description: "Updated description by creator." },
    );
    if (updatedPenguinBook.description === "Updated description by creator.") {
      console.log("  ✅ SUCCESS: Creator successfully updated canonical book metadata");
    } else {
      throw new Error("Test 8 failed: Creator update failed");
    }

    // Clean up
    

    console.log("\n=======================================================");
    console.log("   ALL 8 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Verification failed");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void runVerification();

import http from "http";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import app from "../app.js";
import { env } from "../config/env.js";
import {
  UserModel,
  CountryModel,
  AuthorModel,
  PublisherModel,
  CategoryModel,
  BookModel,
  BookListingModel,
  CartModel,
  OrderModel,
} from "../models/index.js";
import { createBookService } from "../services/book.service.js";
import {
  createBookListingService,
  updateBookListingService,
  deleteBookListingService,
} from "../services/book-listing.service.js";
import {
  addToCartService,
  getCartService,
} from "../services/cart.service.js";
import { createOrderService } from "../services/order.service.js";
import { logger } from "../utils/logger.js";

type InvariantTestResult = {
  testId: number;
  name: string;
  category: string;
  passed: boolean;
  details: string;
};

const results: InvariantTestResult[] = [];

const recordResult = (
  testId: number,
  name: string,
  category: string,
  passed: boolean,
  details: string,
) => {
  results.push({ testId, name, category, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`  [${icon}] Test ${testId}: ${name} (${category}) -> ${details}`);
};

const runInvariantsVerification = async () => {
  let server: http.Server | null = null;

  try {
    console.log("\n=================================================================");
    console.log("   MARKETPLACE ARCHITECTURE INVARIANTS VERIFICATION TEST SUITE");
    console.log("=================================================================\n");

    logger.info("Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    // Start ephemeral Express HTTP server
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine server port");
    }
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    logger.info(`Ephemeral HTTP Server running at ${baseUrl}`);

    const TEST_PREFIX = `inv_${Date.now()}`;
    const passwordHash = await bcrypt.hash("Password123!", 10);

    // 1. Setup Base Entities: Country, Author, Publisher, Category
    logger.info("Setting up base entities for invariant testing...");
    const country = await CountryModel.create({
      name: `Invariant Country ${TEST_PREFIX}`,
      code: `IC_${Math.floor(100 + Math.random() * 899)}`,
      currency: "INR",
      isActive: true,
    });

    const author = await AuthorModel.create({
      name: `Invariant Author ${TEST_PREFIX}`,
      slug: `inv-author-${TEST_PREFIX}`,
      isActive: true,
    });

    const publisher = await PublisherModel.create({
      name: `Invariant Publisher ${TEST_PREFIX}`,
      slug: `inv-pub-${TEST_PREFIX}`,
      email: `pub_${TEST_PREFIX}@example.com`,
      phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      originCountry: country.name,
      isActive: true,
    });

    const category = await CategoryModel.create({
      name: `Invariant Category ${TEST_PREFIX}`,
      slug: `inv-cat-${TEST_PREFIX}`,
      isActive: true,
    });

    // Setup Users: Seller 1, Seller 2, Buyer
    const seller1 = await UserModel.create({
      name: `Seller Alpha ${TEST_PREFIX}`,
      email: `seller1_${TEST_PREFIX}@example.com`,
      password: passwordHash,
      mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    const seller2 = await UserModel.create({
      name: `Seller Beta ${TEST_PREFIX}`,
      email: `seller2_${TEST_PREFIX}@example.com`,
      password: passwordHash,
      mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    const buyer = await UserModel.create({
      name: `Buyer Charlie ${TEST_PREFIX}`,
      email: `buyer_${TEST_PREFIX}@example.com`,
      password: passwordHash,
      mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      role: "BUYER",
      country: country._id,
      isActive: true,
    });

    // Helper fetch wrapper
    const apiRequest = async (
      path: string,
      options: {
        method?: string;
        body?: unknown;
        token?: string;
      } = {},
    ) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (options.token) {
        headers["Authorization"] = `Bearer ${options.token}`;
      }

      const res = await fetch(`${baseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      return { status: res.status, data };
    };

    // Obtain JWT tokens
    const loginBuyerRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: buyer.mobileNumber, password: "Password123!" },
    });
    const buyerToken = loginBuyerRes.data?.data?.accessToken;

    const loginSeller1Res = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: seller1.mobileNumber, password: "Password123!" },
    });
    const seller1Token = loginSeller1Res.data?.data?.accessToken;

    const loginSeller2Res = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: seller2.mobileNumber, password: "Password123!" },
    });
    const seller2Token = loginSeller2Res.data?.data?.accessToken;

    console.log("\n-----------------------------------------------------------------");
    console.log("   EXECUTING THE 5 INVARIANT TEST CASES");
    console.log("-----------------------------------------------------------------\n");

    // =================================================================
    // INVARIANT 1: Duplicate ISBN doesn't create duplicate Book
    // =================================================================
    console.log("--- [INVARIANT 1: DUPLICATE ISBN DOES NOT CREATE DUPLICATE BOOK] ---");

    const SHARED_ISBN = `978-0-INV-${Date.now().toString().slice(-6)}`;

    // 1.1 Seller 1 lists a new book by providing full book info + SHARED_ISBN
    const listing1 = await createBookListingService(
      {
        isbn: SHARED_ISBN,
        title: "Clean Architecture Principles",
        description: "Guide to software architecture and decoupling.",
        authors: [author._id.toString()],
        publisher: publisher._id.toString(),
        categories: [category._id.toString()],
        coverImage: "https://example.com/clean-arch.jpg",
        mrpInPaise: 79900,
        sellingPriceInPaise: 59900,
        stock: 20,
        sku: `SKU-S1-${TEST_PREFIX}`,
        isActive: true,
      },
      seller1._id.toString(),
    );

    const initialBookCount = await BookModel.countDocuments({ isbn: SHARED_ISBN });
    const canonicalBook = await BookModel.findOne({ isbn: SHARED_ISBN }).lean();

    // 1.2 Seller 2 lists the SAME book by providing SHARED_ISBN + book metadata
    const listing2 = await createBookListingService(
      {
        isbn: SHARED_ISBN,
        title: "Clean Architecture Principles",
        description: "Guide to software architecture and decoupling.",
        authors: [author._id.toString()],
        publisher: publisher._id.toString(),
        categories: [category._id.toString()],
        coverImage: "https://example.com/clean-arch.jpg",
        mrpInPaise: 79900,
        sellingPriceInPaise: 54900, // Competitive price
        stock: 15,
        sku: `SKU-S2-${TEST_PREFIX}`,
        isActive: true,
      },
      seller2._id.toString(),
    );

    const bookCountAfterSeller2 = await BookModel.countDocuments({ isbn: SHARED_ISBN });

    // 1.3 Direct creation of duplicate ISBN in BookModel must be rejected with 409
    let duplicateDirectBookRejected = false;
    try {
      await createBookService(
        {
          isbn: SHARED_ISBN,
          title: "Duplicate Clean Arch",
          description: "Duplicate attempt",
          authors: [author._id.toString()],
          publisher: publisher._id.toString(),
          categories: [category._id.toString()],
          coverImage: "https://example.com/dup.jpg",
        },
        seller1._id.toString(),
      );
    } catch (err: any) {
      if (err.statusCode === 409) {
        duplicateDirectBookRejected = true;
      }
    }

    const invariant1Passed =
      initialBookCount === 1 &&
      bookCountAfterSeller2 === 1 &&
      listing1.book.toString() === canonicalBook?._id.toString() &&
      listing2.book.toString() === canonicalBook?._id.toString() &&
      listing1._id.toString() !== listing2._id.toString() &&
      duplicateDirectBookRejected;

    recordResult(
      1,
      "Duplicate ISBN Reuses Canonical Book & Blocks Duplicate Book Document",
      "Catalog Architecture",
      invariant1Passed,
      `Exact 1 Book in DB (Count: ${bookCountAfterSeller2}), 2 distinct seller listings created, duplicate book direct creation rejected with 409`,
    );

    // =================================================================
    // INVARIANT 2: Same seller can't list same Book twice
    // =================================================================
    console.log("\n--- [INVARIANT 2: SAME SELLER CANNOT LIST SAME BOOK TWICE] ---");

    let duplicateSellerListingRejected = false;
    try {
      // Seller 1 attempts to list canonicalBook a second time
      await createBookListingService(
        {
          book: canonicalBook!._id.toString(),
          mrpInPaise: 79900,
          sellingPriceInPaise: 49900,
          stock: 10,
        },
        seller1._id.toString(),
      );
    } catch (err: any) {
      if (err.statusCode === 409) {
        duplicateSellerListingRejected = true;
      }
    }

    // Direct MongoDB unique compound index test: { book: 1, seller: 1 }
    let dbCompoundIndexRejected = false;
    try {
      await BookListingModel.create({
        book: canonicalBook!._id,
        seller: seller1._id,
        mrpInPaise: 79900,
        sellingPriceInPaise: 49900,
        stock: 5,
        isActive: true,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        dbCompoundIndexRejected = true;
      }
    }

    const invariant2Passed = duplicateSellerListingRejected && dbCompoundIndexRejected;
    recordResult(
      2,
      "Same Seller Cannot List Same Book Twice",
      "Marketplace Constraints",
      invariant2Passed,
      `Service check threw 409 Conflict; MongoDB compound index { book: 1, seller: 1 } threw E11000 duplicate key error`,
    );

    // =================================================================
    // INVARIANT 3: Seller can't modify another seller's listing
    // =================================================================
    console.log("\n--- [INVARIANT 3: SELLER CANNOT MODIFY ANOTHER SELLER'S LISTING] ---");

    // 3.1 Seller 2 attempts to PATCH Seller 1's listing via Service
    let unauthServiceUpdateRejected = false;
    try {
      await updateBookListingService(
        listing1._id.toString(),
        { id: seller2._id.toString(), role: "SELLER" },
        { sellingPriceInPaise: 10000 },
      );
    } catch (err: any) {
      if (err.statusCode === 403) {
        unauthServiceUpdateRejected = true;
      }
    }

    // 3.2 Seller 2 attempts to PATCH Seller 1's listing via HTTP API
    const httpPatchRes = await apiRequest(`/listings/${listing1._id}`, {
      method: "PATCH",
      token: seller2Token,
      body: { sellingPriceInPaise: 10000, stock: 999 },
    });

    // 3.3 Seller 2 attempts to DELETE Seller 1's listing via HTTP API
    const httpDeleteRes = await apiRequest(`/listings/${listing1._id}`, {
      method: "DELETE",
      token: seller2Token,
    });

    // 3.4 Seller 1 updates OWN listing -> Should SUCCEED
    const httpOwnerPatchRes = await apiRequest(`/listings/${listing1._id}`, {
      method: "PATCH",
      token: seller1Token,
      body: { sellingPriceInPaise: 58000, stock: 22 },
    });

    const listing1After = await BookListingModel.findById(listing1._id).lean();

    const invariant3Passed =
      unauthServiceUpdateRejected &&
      httpPatchRes.status === 403 &&
      httpDeleteRes.status === 403 &&
      httpOwnerPatchRes.status === 200 &&
      listing1After?.sellingPriceInPaise === 58000 &&
      listing1After?.stock === 22;

    recordResult(
      3,
      "Seller Cannot Modify or Delete Another Seller's Listing",
      "Authorization & Ownership",
      invariant3Passed,
      `Cross-seller PATCH (HTTP ${httpPatchRes.status}) & DELETE (HTTP ${httpDeleteRes.status}) forbidden; Owner update succeeded (HTTP ${httpOwnerPatchRes.status})`,
    );

    // =================================================================
    // INVARIANT 4: Cart / Checkout uses BookListing ID
    // =================================================================
    console.log("\n--- [INVARIANT 4: CART AND CHECKOUT USE BOOKLISTING ID] ---");

    // 4.1 Buyer adds Seller 1's listing to Cart
    const addListing1Cart = await addToCartService(buyer._id.toString(), {
      bookListing: listing1._id.toString(),
      quantity: 2,
    });

    // 4.2 Buyer adds Seller 2's listing (different price) to Cart
    const addListing2Cart = await addToCartService(buyer._id.toString(), {
      bookListing: listing2._id.toString(),
      quantity: 1,
    });

    const cart = await getCartService(buyer._id.toString());

    const item1 = cart.items.find((i: any) => i.bookListingId?.toString() === listing1._id.toString());
    const item2 = cart.items.find((i: any) => i.bookListingId?.toString() === listing2._id.toString());

    const cartValid =
      Boolean(item1) &&
      item1?.quantity === 2 &&
      item1?.priceInPaise === 58000 &&
      item1?.seller?._id.toString() === seller1._id.toString() &&
      Boolean(item2) &&
      item2?.quantity === 1 &&
      item2?.priceInPaise === 54900 &&
      item2?.seller?._id.toString() === seller2._id.toString();

    // 4.3 Checkout from Cart via HTTP POST /orders/checkout
    const shippingAddress = {
      fullName: "Alice Invariant Buyer",
      mobileNumber: "+919876543210",
      street: "42 Market Street",
      city: "Bangalore",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
    };

    const checkoutRes = await apiRequest("/orders/checkout", {
      method: "POST",
      token: buyerToken,
      body: { shippingAddress },
    });

    const createdOrder = checkoutRes.data?.data;
    const cartAfterCheckout = await getCartService(buyer._id.toString());

    const orderValid =
      checkoutRes.status === 201 &&
      createdOrder?.items?.length === 2 &&
      createdOrder.items[0].bookListing === listing1._id.toString() &&
      createdOrder.items[1].bookListing === listing2._id.toString() &&
      createdOrder.totalAmountInPaise === 58000 * 2 + 54900 &&
      cartAfterCheckout.items.length === 0;

    const invariant4Passed = cartValid && orderValid;
    recordResult(
      4,
      "Cart and Checkout Securely Reference BookListing ID with Seller Pricing",
      "Order & Cart Architecture",
      invariant4Passed,
      `Cart verified multi-seller items; Checkout created Order with BookListing refs and emptied cart (Order Total: ₹${createdOrder?.totalAmountInPaise / 100})`,
    );

    // =================================================================
    // INVARIANT 5: Stock deduction is atomic (Concurrency & Over-Selling Test)
    // =================================================================
    console.log("\n--- [INVARIANT 5: ATOMIC STOCK DEDUCTION UNDER HIGH CONCURRENCY] ---");

    // Setup a dedicated canonical book and limited inventory listing with exactly 5 units
    const atomicBook = await createBookService(
      {
        title: `Concurrency Stress Test Book ${TEST_PREFIX}`,
        isbn: `978-0-ATOMIC-${Date.now().toString().slice(-6)}`,
        description: "Testing race condition handling and atomic stock decrement.",
        authors: [author._id.toString()],
        publisher: publisher._id.toString(),
        categories: [category._id.toString()],
        coverImage: "https://example.com/atomic.jpg",
      },
      seller1._id.toString(),
    );

    const atomicListing = await createBookListingService(
      {
        book: atomicBook._id.toString(),
        mrpInPaise: 99900,
        sellingPriceInPaise: 79900,
        stock: 5, // EXACTLY 5 UNITS
        sku: `SKU-ATOMIC-${TEST_PREFIX}`,
        isActive: true,
      },
      seller1._id.toString(),
    );

    const INITIAL_STOCK = 5;
    const CONCURRENT_BUYERS_COUNT = 12; // 12 parallel buyers competing for 5 items!

    console.log(`  Initial stock: ${INITIAL_STOCK} units.`);
    console.log(`  Spawning ${CONCURRENT_BUYERS_COUNT} concurrent purchase requests simultaneously...`);

    // Create 12 distinct buyer user accounts
    const concurrentBuyerTokens: string[] = [];
    for (let i = 0; i < CONCURRENT_BUYERS_COUNT; i++) {
      const cBuyer = await UserModel.create({
        name: `Concurrent Buyer ${i} ${TEST_PREFIX}`,
        email: `cbuyer_${i}_${TEST_PREFIX}@example.com`,
        password: passwordHash,
        mobileNumber: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        role: "BUYER",
        country: country._id,
        isActive: true,
      });

      const cLogin = await apiRequest("/auth/login", {
        method: "POST",
        body: { mobileNumber: cBuyer.mobileNumber, password: "Password123!" },
      });
      concurrentBuyerTokens.push(cLogin.data?.data?.accessToken);
    }

    // Launch all 12 checkout requests in parallel with Promise.all
    const purchasePromises = concurrentBuyerTokens.map((token, index) =>
      apiRequest("/orders/checkout", {
        method: "POST",
        token,
        body: {
          items: [{ bookListing: atomicListing._id.toString(), quantity: 1 }],
          shippingAddress: {
            ...shippingAddress,
            fullName: `Concurrent Buyer ${index}`,
          },
        },
      }),
    );

    const purchaseResponses = await Promise.all(purchasePromises);

    const successfulPurchases = purchaseResponses.filter((r) => r.status === 201);
    const failedPurchases = purchaseResponses.filter(
      (r) => r.status === 400 && r.data?.message?.includes("Insufficient stock"),
    );

    const finalListingInDb = await BookListingModel.findById(atomicListing._id).lean();

    console.log(`  Results: ${successfulPurchases.length} succeeded (201), ${failedPurchases.length} rejected with insufficient stock (400)`);
    console.log(`  Final stock in database: ${finalListingInDb?.stock}`);

    // 5.2 Attempting one more purchase when stock is 0 -> MUST FAIL
    const postStockoutRes = await apiRequest("/orders/checkout", {
      method: "POST",
      token: concurrentBuyerTokens[0],
      body: {
        items: [{ bookListing: atomicListing._id.toString(), quantity: 1 }],
        shippingAddress,
      },
    });

    const stockoutRejected = postStockoutRes.status === 400;

    const invariant5Passed =
      successfulPurchases.length === INITIAL_STOCK &&
      failedPurchases.length === CONCURRENT_BUYERS_COUNT - INITIAL_STOCK &&
      finalListingInDb?.stock === 0 &&
      stockoutRejected;

    recordResult(
      5,
      "Atomic Stock Deduction Prevents Overselling Under Concurrent Load",
      "Concurrency & Inventory Safety",
      invariant5Passed,
      `Exact 5 of 12 concurrent requests succeeded; 7 rejected with Insufficient Stock; Final DB stock = 0 (No negative stock/race condition)`,
    );

    // =================================================================
    // SUMMARY REPORT
    // =================================================================
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log("\n=================================================================");
    console.log("             INVARIANT VERIFICATION SUMMARY REPORT");
    console.log("=================================================================");
    console.log(`  Total Invariant Tests : ${totalTests}`);
    console.log(`  Passed                : ${passedTests} ✅`);
    console.log(`  Failed                : ${failedTests} ${failedTests === 0 ? "🎉" : "❌"}`);
    console.log("=================================================================\n");

    if (failedTests > 0) {
      throw new Error(`${failedTests} invariant tests failed!`);
    }

    console.log("🎉 ALL 5 CORE ARCHITECTURE INVARIANTS HAVE BEEN VERIFIED AND PASSED 100%!");
  } catch (error) {
    logger.error(error, "Invariant verification encountered an error");
    process.exit(1);
  } finally {
    if (server) {
      server.close();
      logger.info("Ephemeral HTTP server closed");
    }
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void runInvariantsVerification();

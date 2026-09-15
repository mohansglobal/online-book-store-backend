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
  CartModel,
  OrderModel,
  AddressModel,
} from "../models/index.js";
import { logger } from "../utils/logger.js";

const runTests = async () => {
  let server: http.Server | null = null;

  try {
    console.log("\n=======================================================");
    console.log("   TEST DIRECT BUY NOW & CART CHECKOUT ARCHITECTURE");
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

    const TEST_PREFIX = `buynow_${Date.now()}`;
    const hashedPassword = await bcrypt.hash("Password123!", 10);

    const testMobile = `98${Math.floor(10000000 + Math.random() * 89999999)}`;

    // 1. Create Seller & Buyer
    const seller = await UserModel.create({
      name: "BuyNow Seller",
      email: `${TEST_PREFIX}_seller@example.com`,
      password: hashedPassword,
      mobileNumber: `99${Math.floor(10000000 + Math.random() * 89999999)}`,
      role: "SELLER",
      isActive: true,
      isEmailVerified: true,
    });

    const buyer = await UserModel.create({
      name: "BuyNow Buyer",
      email: `${TEST_PREFIX}_buyer@example.com`,
      password: hashedPassword,
      mobileNumber: testMobile,
      role: "BUYER",
      isActive: true,
      isEmailVerified: true,
      isMobileVerified: true,
    });

    // 2. Login buyer to get JWT
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mobileNumber: testMobile,
        password: "Password123!",
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken;
    if (!token) {
      throw new Error("Failed to log in buyer");
    }

    // 3. Create Author, Publisher, Category, Books & Listings
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

    // Book A & Listing A (For Buy Now)
    const bookA = await BookModel.create({
      title: `BuyNow Book A ${TEST_PREFIX}`,
      slug: `book-a-${TEST_PREFIX}`,
      isbn: `ISBN-A-${TEST_PREFIX}`,
      description: "Test description for book A",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/coverA.jpg",
      createdBy: seller._id,
      status: "ACTIVE",
    });

    const listingA = await BookListingModel.create({
      book: bookA._id,
      seller: seller._id,
      mrpInPaise: 50000,
      sellingPriceInPaise: 40000,
      stock: 20,
      sku: `SKU-A-${TEST_PREFIX}`,
      isActive: true,
    });

    // Book B & Listing B (For Cart)
    const bookB = await BookModel.create({
      title: `Cart Book B ${TEST_PREFIX}`,
      slug: `book-b-${TEST_PREFIX}`,
      isbn: `ISBN-B-${TEST_PREFIX}`,
      description: "Test description for book B",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      coverImage: "https://example.com/coverB.jpg",
      createdBy: seller._id,
      status: "ACTIVE",
    });

    const listingB = await BookListingModel.create({
      book: bookB._id,
      seller: seller._id,
      mrpInPaise: 30000,
      sellingPriceInPaise: 25000,
      stock: 15,
      sku: `SKU-B-${TEST_PREFIX}`,
      isActive: true,
    });

    // 4. Create Shipping Address for buyer
    const addressDoc = await AddressModel.create({
      user: buyer._id,
      addressType: "SHIPPING",
      fullName: "Test Recipient",
      email: `${TEST_PREFIX}_buyer@example.com`,
      mobileNumber: "9876543210",
      streetAddress: "123 Test Street",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India",
      isDefault: true,
    });

    // 5. Put Listing B in the Buyer's Cart (quantity = 3)
    await CartModel.create({
      user: buyer._id,
      items: [
        {
          bookListing: listingB._id,
          quantity: 3,
        },
      ],
    });

    console.log("Fixtures created successfully:\n - Cart has Listing B (qty 3)\n - Listing A is available for Buy Now\n");

    // -------------------------------------------------------------
    // TEST 1: Direct Buy Now Checkout Summary
    // -------------------------------------------------------------
    console.log("--- TEST 1: Direct Buy Now Checkout Summary ---");
    const resSummaryDirect = await fetch(
      `${baseUrl}/checkout/summary?bookListingId=${listingA._id}&quantity=2`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const summaryDirect = await resSummaryDirect.json();
    console.log("Status:", resSummaryDirect.status);
    console.log("Items count:", summaryDirect.data?.items?.length);
    console.log("First item:", summaryDirect.data?.items?.[0]?.bookListingId, "Qty:", summaryDirect.data?.items?.[0]?.quantity);
    console.log("Subtotal (Paise):", summaryDirect.data?.pricing?.subtotalInPaise);

    if (
      resSummaryDirect.status === 200 &&
      summaryDirect.data?.items?.length === 1 &&
      summaryDirect.data?.items?.[0]?.bookListingId === listingA._id.toString() &&
      summaryDirect.data?.items?.[0]?.quantity === 2 &&
      summaryDirect.data?.pricing?.subtotalInPaise === 80000 // 400 * 2 = 800 rupees = 80000 paise
    ) {
      console.log("✅ TEST 1 PASSED: Direct Buy Now summary returns only the requested listing and quantity!\n");
    } else {
      throw new Error(`TEST 1 FAILED: ${JSON.stringify(summaryDirect)}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Cart Checkout Summary
    // -------------------------------------------------------------
    console.log("--- TEST 2: Normal Cart Checkout Summary ---");
    const resSummaryCart = await fetch(`${baseUrl}/checkout/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const summaryCart = await resSummaryCart.json();
    console.log("Status:", resSummaryCart.status);
    console.log("Items count:", summaryCart.data?.items?.length);
    console.log("First item:", summaryCart.data?.items?.[0]?.bookListingId, "Qty:", summaryCart.data?.items?.[0]?.quantity);
    console.log("Subtotal (Paise):", summaryCart.data?.pricing?.subtotalInPaise);

    if (
      resSummaryCart.status === 200 &&
      summaryCart.data?.items?.length === 1 &&
      summaryCart.data?.items?.[0]?.bookListingId === listingB._id.toString() &&
      summaryCart.data?.items?.[0]?.quantity === 3 &&
      summaryCart.data?.pricing?.subtotalInPaise === 75000 // 250 * 3 = 750 rupees = 75000 paise
    ) {
      console.log("✅ TEST 2 PASSED: Normal checkout summary uses user's cart items!\n");
    } else {
      throw new Error(`TEST 2 FAILED: ${JSON.stringify(summaryCart)}`);
    }

    // -------------------------------------------------------------
    // TEST 3: Place Direct Buy Now Order & Verify Cart Remains Intact
    // -------------------------------------------------------------
    console.log("--- TEST 3: Place Direct Buy Now Order (Cart must NOT be cleared) ---");
    const stockBeforeA = (await BookListingModel.findById(listingA._id))?.stock;
    console.log("Listing A stock before:", stockBeforeA);

    const resOrderDirect = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shippingAddressId: addressDoc._id.toString(),
        paymentMethod: "CASH_ON_DELIVERY",
        items: [
          {
            bookListingId: listingA._id.toString(),
            quantity: 2,
          },
        ],
      }),
    });
    const orderDirectData = await resOrderDirect.json();
    console.log("Order creation status:", resOrderDirect.status);
    console.log("Order Number:", orderDirectData.data?.orderNumber);

    const stockAfterA = (await BookListingModel.findById(listingA._id))?.stock;
    console.log("Listing A stock after:", stockAfterA);

    // Verify cart in database
    const cartAfterDirectOrder = await CartModel.findOne({ user: buyer._id }).lean();
    console.log("Cart items count after Buy Now order:", cartAfterDirectOrder?.items?.length);

    if (
      resOrderDirect.status === 201 &&
      stockAfterA === stockBeforeA! - 2 &&
      cartAfterDirectOrder &&
      cartAfterDirectOrder.items.length === 1 &&
      cartAfterDirectOrder.items[0].bookListing.toString() === listingB._id.toString() &&
      cartAfterDirectOrder.items[0].quantity === 3
    ) {
      console.log("✅ TEST 3 PASSED: Buy Now order succeeded, deducted stock atomically, and cart remained completely untouched!\n");
    } else {
      throw new Error(`TEST 3 FAILED: Cart was modified or stock was not deducted properly!`);
    }

    // -------------------------------------------------------------
    // TEST 4: Place Normal Cart Order & Verify Cart Is Cleared
    // -------------------------------------------------------------
    console.log("--- TEST 4: Place Normal Cart Order (Cart MUST be cleared) ---");
    const stockBeforeB = (await BookListingModel.findById(listingB._id))?.stock;
    console.log("Listing B stock before:", stockBeforeB);

    const resOrderCart = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shippingAddressId: addressDoc._id.toString(),
        paymentMethod: "CASH_ON_DELIVERY",
      }),
    });
    const orderCartData = await resOrderCart.json();
    console.log("Cart order creation status:", resOrderCart.status);
    console.log("Cart Order Number:", orderCartData.data?.orderNumber);

    const stockAfterB = (await BookListingModel.findById(listingB._id))?.stock;
    console.log("Listing B stock after:", stockAfterB);

    // Verify cart is now empty
    const cartAfterCartOrder = await CartModel.findOne({ user: buyer._id }).lean();
    console.log("Cart items count after cart order:", cartAfterCartOrder?.items?.length);

    if (
      resOrderCart.status === 201 &&
      stockAfterB === stockBeforeB! - 3 &&
      cartAfterCartOrder &&
      cartAfterCartOrder.items.length === 0
    ) {
      console.log("✅ TEST 4 PASSED: Normal cart order succeeded, deducted stock atomically, and cart was properly cleared!\n");
    } else {
      throw new Error(`TEST 4 FAILED: Cart was not cleared or stock was not deducted!`);
    }

    // -------------------------------------------------------------
    // TEST 5: Direct Order with Excessive Quantity Rejected
    // -------------------------------------------------------------
    console.log("--- TEST 5: Direct Order with Excessive Quantity (Exceeds stock) ---");
    const resExcessive = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shippingAddressId: addressDoc._id.toString(),
        paymentMethod: "CASH_ON_DELIVERY",
        items: [
          {
            bookListingId: listingA._id.toString(),
            quantity: 9999,
          },
        ],
      }),
    });
    console.log("Excessive quantity response status:", resExcessive.status);
    if (resExcessive.status === 400) {
      console.log("✅ TEST 5 PASSED: Excessive quantity rejected with 400 Bad Request!\n");
    } else {
      throw new Error(`TEST 5 FAILED: Expected 400, got ${resExcessive.status}`);
    }

    // -------------------------------------------------------------
    // TEST 6: Direct Order with Inactive Listing Rejected
    // -------------------------------------------------------------
    console.log("--- TEST 6: Direct Order with Inactive Listing ---");
    await BookListingModel.findByIdAndUpdate(listingA._id, { isActive: false });

    const resInactive = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shippingAddressId: addressDoc._id.toString(),
        paymentMethod: "CASH_ON_DELIVERY",
        items: [
          {
            bookListingId: listingA._id.toString(),
            quantity: 1,
          },
        ],
      }),
    });
    console.log("Inactive listing response status:", resInactive.status);
    if (resInactive.status === 400) {
      console.log("✅ TEST 6 PASSED: Inactive listing rejected with 400 Bad Request!\n");
    } else {
      throw new Error(`TEST 6 FAILED: Expected 400, got ${resInactive.status}`);
    }

    // Clean up test data
    console.log("Cleaning up test fixtures...");
    await OrderModel.deleteMany({ buyer: buyer._id });
    await CartModel.deleteMany({ user: buyer._id });
    await AddressModel.deleteMany({ user: buyer._id });
    await BookListingModel.deleteMany({ _id: { $in: [listingA._id, listingB._id] } });
    await BookModel.deleteMany({ _id: { $in: [bookA._id, bookB._id] } });
    await AuthorModel.deleteMany({ _id: author._id });
    await PublisherModel.deleteMany({ _id: publisher._id });
    await CategoryModel.deleteMany({ _id: category._id });
    await UserModel.deleteMany({ _id: { $in: [seller._id, buyer._id] } });
    console.log("Cleanup completed successfully!");

    console.log("\n=======================================================");
    console.log("   ALL BUY NOW & CART CHECKOUT TESTS PASSED! 🎉");
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

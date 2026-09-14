import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

import { connectDB } from "../config/db.js";
import { UserModel } from "../models/user.model.js";
import { BookModel } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CategoryModel } from "../models/category.model.js";
import { CountryModel } from "../models/country.model.js";
import { AddressModel } from "../models/address.model.js";
import { OrderModel } from "../models/order.model.js";
import {
  createOrderService,
  verifyOrderPaymentService,
} from "../services/order.service.js";
import { verifyRazorpaySignature } from "../services/payment.service.js";
import { logger } from "../utils/logger.js";

const runTests = async () => {
  try {
    await connectDB();
    console.log("\n========================================================");
    console.log("   RAZORPAY ORDER CREATION & VERIFICATION API TEST");
    console.log("========================================================\n");

    const TEST_ID = Date.now().toString(36);

    // 1. Setup Test Country, Author, Publisher, Category, User
    const country: any = await CountryModel.create({
      name: `Test Country ${TEST_ID}`,
      code: `TC_${Math.floor(100 + Math.random() * 800)}`,
      currency: "INR",
      isActive: true,
    });

    const author: any = await AuthorModel.create({
      name: `Test Author ${TEST_ID}`,
      slug: `test-author-${TEST_ID}`,
      isActive: true,
    });

    const publisher: any = await PublisherModel.create({
      name: `Test Publisher ${TEST_ID}`,
      slug: `test-pub-${TEST_ID}`,
      email: `pub_${TEST_ID}@example.com`,
      originCountry: country.name,
      isActive: true,
    });

    const category: any = await CategoryModel.create({
      name: `Test Category ${TEST_ID}`,
      slug: `test-cat-${TEST_ID}`,
      isActive: true,
    });

    const buyer: any = await UserModel.create({
      name: `Test Buyer ${TEST_ID}`,
      email: `buyer_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "BUYER",
      country: country._id,
      isActive: true,
    });

    const seller: any = await UserModel.create({
      name: `Test Seller ${TEST_ID}`,
      email: `seller_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    const book: any = await BookModel.create({
      title: `Test Book for Razorpay ${TEST_ID}`,
      slug: `test-book-rzp-${TEST_ID}`,
      isbn: `978-0-RZP-${Math.floor(100000 + Math.random() * 900000)}`,
      description: "A test book for Razorpay integration testing",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      createdBy: seller._id,
      coverImage: "https://example.com/cover.jpg",
    });

    const listing: any = await BookListingModel.create({
      book: book._id,
      seller: seller._id,
      mrpInPaise: 50000,
      sellingPriceInPaise: 40000,
      stock: 10,
      sku: `SKU-RZP-${TEST_ID}`,
      isActive: true,
    });

    const address: any = await AddressModel.create({
      user: buyer._id,
      addressType: "SHIPPING",
      fullName: "Test Buyer",
      email: `buyer_${TEST_ID}@example.com`,
      mobileNumber: "+919876543210",
      streetAddress: "123 Test St",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India",
      isDefault: true,
    });

    // -------------------------------------------------------------
    // TEST 1: HMAC SHA-256 Signature Verification
    // -------------------------------------------------------------
    console.log("TEST 1: Cryptographic HMAC SHA-256 Signature Verification");
    const testSecret = process.env.RAZORPAY_KEY_SECRET || "dummy_secret_for_test_purposes_12345";
    process.env.RAZORPAY_KEY_SECRET = testSecret;

    const fakeOrderId = "order_fake_123456789";
    const fakePaymentId = "pay_fake_987654321";
    const validSignature = crypto
      .createHmac("sha256", testSecret)
      .update(`${fakeOrderId}|${fakePaymentId}`)
      .digest("hex");

    const isSigValid = verifyRazorpaySignature({
      razorpayOrderId: fakeOrderId,
      razorpayPaymentId: fakePaymentId,
      razorpaySignature: validSignature,
    });

    const isTamperedSigValid = verifyRazorpaySignature({
      razorpayOrderId: fakeOrderId,
      razorpayPaymentId: fakePaymentId,
      razorpaySignature: "tampered_signature_hex",
    });

    console.log(`  - Valid signature verified correctly: ${isSigValid ? "PASSED (true)" : "FAILED (false)"}`);
    console.log(`  - Tampered signature rejected correctly: ${!isTamperedSigValid ? "PASSED (false)" : "FAILED (true)"}`);

    if (!isSigValid || isTamperedSigValid) {
      throw new Error("HMAC Signature verification logic failed");
    }

    // -------------------------------------------------------------
    // TEST 2: Create Order with Pre-Paid Razorpay Signature (CONFIRMED & PAID)
    // -------------------------------------------------------------
    console.log("\nTEST 2: Create Order with Razorpay Payment Info (Direct Confirmation)");
    const rzpPaymentId = `pay_${Date.now()}`;
    const rzpOrderId = `order_${Date.now()}`;
    const rzpSignature = crypto
      .createHmac("sha256", testSecret)
      .update(`${rzpOrderId}|${rzpPaymentId}`)
      .digest("hex");

    const initialStock = listing.stock;

    const order = await createOrderService(buyer._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "ONLINE_PAY",
      items: [{ bookListing: listing._id.toString(), quantity: 2 }],
      razorpayPaymentId: rzpPaymentId,
      razorpayOrderId: rzpOrderId,
      razorpaySignature: rzpSignature,
    });

    console.log(`  - Order Number: ${order.orderNumber}`);
    console.log(`  - Order Status: ${order.orderStatus} (Expected: CONFIRMED)`);
    console.log(`  - Payment Status: ${order.paymentStatus} (Expected: PAID)`);
    console.log(`  - Total Amount: ₹${order.totalAmountInPaise / 100} (₹${order.totalAmountInPaise} paise)`);
    console.log(`  - Razorpay Payment ID: ${order.razorpayPaymentId}`);

    const updatedListing = await BookListingModel.findById(listing._id).lean();
    console.log(`  - Stock deducted atomically from ${initialStock} -> ${updatedListing?.stock} (Expected: 8)`);

    if (
      order.orderStatus !== "CONFIRMED" ||
      order.paymentStatus !== "PAID" ||
      updatedListing?.stock !== initialStock - 2
    ) {
      throw new Error("Order creation with pre-paid Razorpay details failed verification");
    }

    // -------------------------------------------------------------
    // TEST 3: Payment Verification Endpoint & Idempotency
    // -------------------------------------------------------------
    console.log("\nTEST 3: Payment Verification Service & Idempotent Verification");

    // 3.1 Create an order with pending payment first
    const pendingOrder = await createOrderService(buyer._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "ONLINE_PAY",
      items: [{ bookListing: listing._id.toString(), quantity: 1 }],
    });

    console.log(`  - Created Pending Order: ${pendingOrder.orderNumber}, Status: ${pendingOrder.orderStatus}, Payment: ${pendingOrder.paymentStatus}`);

    // 3.2 Verify the payment
    const newPayId = `pay_verified_${Date.now()}`;
    const newOrdId = `order_verified_${Date.now()}`;
    const newSig = crypto
      .createHmac("sha256", testSecret)
      .update(`${newOrdId}|${newPayId}`)
      .digest("hex");

    const verifiedOrder = await verifyOrderPaymentService(
      buyer._id.toString(),
      pendingOrder._id.toString(),
      {
        razorpayPaymentId: newPayId,
        razorpayOrderId: newOrdId,
        razorpaySignature: newSig,
      },
    );

    console.log(`  - Verified Order Status: ${verifiedOrder.orderStatus} (Expected: CONFIRMED)`);
    console.log(`  - Verified Payment Status: ${verifiedOrder.paymentStatus} (Expected: PAID)`);
    console.log(`  - Paid At: ${verifiedOrder.paidAt}`);

    // 3.3 Idempotency: verify again
    const idempotentOrder = await verifyOrderPaymentService(
      buyer._id.toString(),
      pendingOrder._id.toString(),
      {
        razorpayPaymentId: newPayId,
        razorpayOrderId: newOrdId,
        razorpaySignature: newSig,
      },
    );
    console.log(`  - Re-verification Idempotent Status: ${idempotentOrder.paymentStatus} (Expected: PAID)`);

    if (verifiedOrder.paymentStatus !== "PAID" || idempotentOrder.paymentStatus !== "PAID") {
      throw new Error("Payment verification service failed");
    }

    // -------------------------------------------------------------
    // TEST 4: Cash On Delivery Order
    // -------------------------------------------------------------
    console.log("\nTEST 4: Cash On Delivery Order Flow");
    const codOrder = await createOrderService(buyer._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "CASH_ON_DELIVERY",
      items: [{ bookListing: listing._id.toString(), quantity: 1 }],
    });

    console.log(`  - COD Order Number: ${codOrder.orderNumber}`);
    console.log(`  - COD Order Status: ${codOrder.orderStatus} (Expected: CONFIRMED)`);
    console.log(`  - COD Payment Status: ${codOrder.paymentStatus} (Expected: PENDING)`);

    if (codOrder.paymentMethod !== "CASH_ON_DELIVERY" || codOrder.paymentStatus !== "PENDING") {
      throw new Error("Cash on delivery order failed");
    }

    // Clean up test documents
    console.log("\nCleaning up test artifacts...");
    await OrderModel.deleteMany({ buyer: buyer._id });
    await AddressModel.deleteMany({ user: buyer._id });
    await BookListingModel.deleteMany({ _id: listing._id });
    await BookModel.deleteMany({ _id: book._id });
    await UserModel.deleteMany({ _id: { $in: [buyer._id, seller._id] } });
    await CategoryModel.deleteMany({ _id: category._id });
    await PublisherModel.deleteMany({ _id: publisher._id });
    await AuthorModel.deleteMany({ _id: author._id });
    await CountryModel.deleteMany({ _id: country._id });

    console.log("\n✅ ALL RAZORPAY ORDER CREATION & VERIFICATION TESTS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test execution failed with error:", error);
    process.exit(1);
  }
};

runTests();

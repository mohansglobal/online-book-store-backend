import mongoose from "mongoose";
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
  cancelOrderService,
  getMyOrdersService,
} from "../services/order.service.js";

const runTests = async () => {
  try {
    await connectDB();
    console.log("\n========================================================");
    console.log("   ORDER CANCELLATION & DATE FILTER TEST SUITE");
    console.log("========================================================\n");

    const TEST_ID = Date.now().toString(36);

    // Setup base entities
    const country: any = await CountryModel.create({
      name: `Country ${TEST_ID}`,
      code: `C_${Math.floor(100 + Math.random() * 800)}`,
      currency: "INR",
      isActive: true,
    });

    const author: any = await AuthorModel.create({
      name: `Author ${TEST_ID}`,
      slug: `auth-${TEST_ID}`,
      isActive: true,
    });

    const publisher: any = await PublisherModel.create({
      name: `Publisher ${TEST_ID}`,
      slug: `pub-${TEST_ID}`,
      email: `pub_${TEST_ID}@example.com`,
      originCountry: country.name,
      isActive: true,
    });

    const category: any = await CategoryModel.create({
      name: `Category ${TEST_ID}`,
      slug: `cat-${TEST_ID}`,
      isActive: true,
    });

    const buyer1: any = await UserModel.create({
      name: `Buyer 1 ${TEST_ID}`,
      email: `buyer1_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "BUYER",
      country: country._id,
      isActive: true,
    });

    const buyer2: any = await UserModel.create({
      name: `Buyer 2 ${TEST_ID}`,
      email: `buyer2_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "BUYER",
      country: country._id,
      isActive: true,
    });

    const seller: any = await UserModel.create({
      name: `Seller ${TEST_ID}`,
      email: `seller_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9196${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    const book: any = await BookModel.create({
      title: `Test Book ${TEST_ID}`,
      slug: `book-${TEST_ID}`,
      isbn: `978-0-CANCEL-${Math.floor(100000 + Math.random() * 900000)}`,
      description: "Test book for order cancellation and date filtering",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      createdBy: seller._id,
      coverImage: "https://example.com/cover.jpg",
    });

    const listing: any = await BookListingModel.create({
      book: book._id,
      seller: seller._id,
      mrpInPaise: 60000,
      sellingPriceInPaise: 45000,
      stock: 10,
      sku: `SKU-CANCEL-${TEST_ID}`,
      isActive: true,
    });

    const address: any = await AddressModel.create({
      user: buyer1._id,
      addressType: "SHIPPING",
      fullName: "Test Buyer 1",
      email: `buyer1_${TEST_ID}@example.com`,
      mobileNumber: "+919876543210",
      streetAddress: "123 Cancel St",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India",
      isDefault: true,
    });

    // -------------------------------------------------------------
    // TEST 1: Cancel CONFIRMED Order & Stock Restoration
    // -------------------------------------------------------------
    console.log("TEST 1: Cancel CONFIRMED Order & Verify Inventory Rollback");
    const order1 = await createOrderService(buyer1._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "CASH_ON_DELIVERY",
      items: [{ bookListing: listing._id.toString(), quantity: 3 }],
    });

    let listingAfterOrder = await BookListingModel.findById(listing._id).lean();
    console.log(`  - Created Order: ${order1.orderNumber}, Status: ${order1.orderStatus}`);
    console.log(`  - Listing Stock after ordering 3 units: ${listingAfterOrder?.stock} (Expected: 7)`);

    const cancelledOrder1 = await cancelOrderService(
      order1._id.toString(),
      { id: buyer1._id.toString(), role: "BUYER" },
      { reason: "Found a better deal elsewhere" },
    );

    let listingAfterCancel = await BookListingModel.findById(listing._id).lean();
    console.log(`  - Cancelled Order Status: ${cancelledOrder1.orderStatus} (Expected: CANCELLED)`);
    console.log(`  - Cancellation Reason: ${cancelledOrder1.cancellationReason}`);
    console.log(`  - Cancelled At: ${cancelledOrder1.cancelledAt}`);
    console.log(`  - Listing Stock restored back to: ${listingAfterCancel?.stock} (Expected: 10)`);

    if (
      cancelledOrder1.orderStatus !== "CANCELLED" ||
      listingAfterCancel?.stock !== 10
    ) {
      throw new Error("Order cancellation failed to restore stock or update status");
    }
    console.log("  -> PASSED\n");

    // -------------------------------------------------------------
    // TEST 2: Cancel PAID Order & Refund Status Tracking
    // -------------------------------------------------------------
    console.log("TEST 2: Cancel PAID Order & Verify Refund Status");
    const order2 = await createOrderService(buyer1._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "ONLINE_PAY",
      items: [{ bookListing: listing._id.toString(), quantity: 2 }],
      razorpayPaymentId: `pay_test_${Date.now()}`,
    });

    console.log(`  - Created Paid Order: ${order2.orderNumber}, PaymentStatus: ${order2.paymentStatus}`);

    const cancelledOrder2 = await cancelOrderService(
      order2._id.toString(),
      { id: buyer1._id.toString(), role: "BUYER" },
      { reason: "Delivery will take too long" },
    );

    console.log(`  - Cancelled Paid Order Status: ${cancelledOrder2.orderStatus} (Expected: CANCELLED)`);
    console.log(`  - Refund Status: ${cancelledOrder2.refundStatus} (Expected: PENDING)`);

    if (cancelledOrder2.refundStatus !== "PENDING") {
      throw new Error("Paid order cancellation failed to set refundStatus to PENDING");
    }
    console.log("  -> PASSED\n");

    // -------------------------------------------------------------
    // TEST 3: Block Double Cancellation
    // -------------------------------------------------------------
    console.log("TEST 3: Block Re-canceling an Already Cancelled Order");
    let doubleCancelBlocked = false;
    try {
      await cancelOrderService(
        order1._id.toString(),
        { id: buyer1._id.toString(), role: "BUYER" },
        { reason: "Cancel again" },
      );
    } catch (err: any) {
      if (err.statusCode === 400) {
        doubleCancelBlocked = true;
        console.log(`  - Correctly rejected with: "${err.message}"`);
      }
    }

    if (!doubleCancelBlocked) {
      throw new Error("Double cancellation was not blocked");
    }
    console.log("  -> PASSED\n");

    // -------------------------------------------------------------
    // TEST 4: Block Canceling SHIPPED or DELIVERED Orders
    // -------------------------------------------------------------
    console.log("TEST 4: Block Cancellation on SHIPPED / DELIVERED Orders");
    const order3 = await createOrderService(buyer1._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "CASH_ON_DELIVERY",
      items: [{ bookListing: listing._id.toString(), quantity: 1 }],
    });

    // Advance order to SHIPPED
    await OrderModel.findByIdAndUpdate(order3._id, { orderStatus: "SHIPPED" });

    let shippedCancelBlocked = false;
    try {
      await cancelOrderService(
        order3._id.toString(),
        { id: buyer1._id.toString(), role: "BUYER" },
        { reason: "Change mind" },
      );
    } catch (err: any) {
      if (err.statusCode === 400) {
        shippedCancelBlocked = true;
        console.log(`  - Correctly blocked shipped cancellation: "${err.message}"`);
      }
    }

    if (!shippedCancelBlocked) {
      throw new Error("Shipped order cancellation was not blocked");
    }
    console.log("  -> PASSED\n");

    // -------------------------------------------------------------
    // TEST 5: Unauthorized Cancellation Protection
    // -------------------------------------------------------------
    console.log("TEST 5: Block Unauthorized Cancellation (User B canceling User A's order)");
    let unauthorizedBlocked = false;
    try {
      await cancelOrderService(
        order3._id.toString(),
        { id: buyer2._id.toString(), role: "BUYER" },
        { reason: "Malicious cancel" },
      );
    } catch (err: any) {
      if (err.statusCode === 403) {
        unauthorizedBlocked = true;
        console.log(`  - Correctly rejected unauthorized attempt: "${err.message}"`);
      }
    }

    if (!unauthorizedBlocked) {
      throw new Error("Unauthorized cancellation was not blocked");
    }
    console.log("  -> PASSED\n");

    // -------------------------------------------------------------
    // TEST 6: Date Range Filter on getMyOrdersService
    // -------------------------------------------------------------
    console.log("TEST 6: Date Range Filtering on Orders List");

    const todayOrders = await getMyOrdersService(buyer1._id.toString(), {
      page: 1,
      limit: 10,
      dateRange: "today",
    });
    console.log(`  - Orders retrieved with dateRange="today": ${todayOrders.orders.length} (Total: ${todayOrders.meta.total})`);

    const last7DaysOrders = await getMyOrdersService(buyer1._id.toString(), {
      page: 1,
      limit: 10,
      dateRange: "last7days",
    });
    console.log(`  - Orders retrieved with dateRange="last7days": ${last7DaysOrders.orders.length} (Total: ${last7DaysOrders.meta.total})`);

    const futureDateOrders = await getMyOrdersService(buyer1._id.toString(), {
      page: 1,
      limit: 10,
      startDate: "2030-01-01",
      endDate: "2030-12-31",
    });
    console.log(`  - Orders retrieved with future date filter: ${futureDateOrders.orders.length} (Expected: 0)`);

    if (todayOrders.orders.length === 0 || futureDateOrders.orders.length !== 0) {
      throw new Error("Date range filter did not return expected results");
    }
    console.log("  -> PASSED\n");

    // Cleanup
    console.log("Cleaning up test artifacts...");
    await OrderModel.deleteMany({ buyer: { $in: [buyer1._id, buyer2._id] } });
    await AddressModel.deleteMany({ user: { $in: [buyer1._id, buyer2._id] } });
    await BookListingModel.deleteMany({ _id: listing._id });
    await BookModel.deleteMany({ _id: book._id });
    await UserModel.deleteMany({ _id: { $in: [buyer1._id, buyer2._id, seller._id] } });
    await CategoryModel.deleteMany({ _id: category._id });
    await PublisherModel.deleteMany({ _id: publisher._id });
    await AuthorModel.deleteMany({ _id: author._id });
    await CountryModel.deleteMany({ _id: country._id });

    console.log("\n✅ ALL ORDER CANCELLATION & DATE FILTER TESTS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test execution failed with error:", error);
    process.exit(1);
  }
};

runTests();

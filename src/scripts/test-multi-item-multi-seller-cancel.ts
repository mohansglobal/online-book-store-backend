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
  updateOrderItemFulfillmentService,
  getOrderByIdService,
} from "../services/order.service.js";

const runMultiItemAndSellerTests = async () => {
  try {
    await connectDB();
    console.log("\n========================================================");
    console.log("   MULTI-ITEM & MULTI-SELLER ORDER ARCHITECTURE TEST");
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

    const buyer: any = await UserModel.create({
      name: `Buyer ${TEST_ID}`,
      email: `buyer_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "BUYER",
      country: country._id,
      isActive: true,
    });

    const sellerA: any = await UserModel.create({
      name: `Seller A (Fast Shipping) ${TEST_ID}`,
      email: `sellerA_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9196${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    const sellerB: any = await UserModel.create({
      name: `Seller B (Standard Shipping) ${TEST_ID}`,
      email: `sellerB_${TEST_ID}@example.com`,
      password: "hashed_test_password",
      mobileNumber: `+9195${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: "SELLER",
      country: country._id,
      isActive: true,
    });

    const address: any = await AddressModel.create({
      user: buyer._id,
      fullName: buyer.name,
      email: buyer.email,
      mobileNumber: buyer.mobileNumber,
      streetAddress: "100 Innovation Park",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
      isDefault: true,
    });

    // =========================================================================
    // PART 1: 10-ITEM ORDER - PARTIAL CANCELLATION (1 ITEM, FEW ITEMS, ALL ITEMS)
    // =========================================================================
    console.log("--------------------------------------------------------");
    console.log("TEST 1: 10-Item Order - Cancel 1 Item, Few Items, All Items");
    console.log("--------------------------------------------------------");

    const tenListings: any[] = [];
    const tenBooks: any[] = [];

    for (let i = 1; i <= 10; i++) {
      const book: any = await BookModel.create({
        title: `Volume ${i}: Architectural Patterns`,
        slug: `volume-${i}-${TEST_ID}`,
        isbn: `978-0-${Math.floor(100000 + Math.random() * 900000)}-${i}`,
        description: `Description for volume ${i}`,
        authors: [author._id],
        publisher: publisher._id,
        categories: [category._id],
        createdBy: sellerA._id,
      });
      tenBooks.push(book);

      const listing: any = await BookListingModel.create({
        book: book._id,
        seller: sellerA._id,
        sku: `SKU-10-${i}-${TEST_ID}`,
        mrpInPaise: 50000, // ₹500
        sellingPriceInPaise: 40000, // ₹400
        stock: 10,
        isActive: true,
      });
      tenListings.push(listing);
    }

    // Buyer orders all 10 items
    const order10 = await createOrderService(buyer._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "CASH_ON_DELIVERY",
      items: tenListings.map((l) => ({
        bookListing: l._id.toString(),
        quantity: 1,
      })),
    });

    console.log(`  - Created 10-item Order: ${order10.orderNumber}`);
    console.log(`  - Total Items in Order: ${order10.items.length}`);
    console.log(`  - Initial Order Status: ${order10.orderStatus}`);

    // Verify stock reduced by 1 for each of the 10 listings
    for (const l of tenListings) {
      const currentListing = await BookListingModel.findById(l._id).lean();
      if (currentListing?.stock !== 9) {
        throw new Error(`Listing ${l._id} stock expected to be 9, got ${currentListing?.stock}`);
      }
    }
    console.log("  - Confirmed stock reduced to 9 for all 10 listings.");

    // Step A: Cancel 1 item (Item 0)
    console.log("\n  [Step 1A] Buyer cancels 1 item out of 10 (Item 0)...");
    const item0 = order10.items[0];
    const item0Id = item0._id.toString();

    const afterCancel1 = await cancelOrderService(
      order10._id.toString(),
      { id: buyer._id.toString(), role: "BUYER" },
      {
        reason: "Accidentally added duplicate item 1",
        itemIds: [item0Id],
      },
    );

    const stock0 = (await BookListingModel.findById(item0.bookListing).lean())?.stock;
    const stock1 = (await BookListingModel.findById(order10.items[1].bookListing).lean())?.stock;

    console.log(`    - Overall Order Status: ${afterCancel1.orderStatus} (Expected: PARTIALLY_CANCELLED)`);
    console.log(`    - Item 0 Status: ${afterCancel1.items[0].status} (Expected: CANCELLED)`);
    console.log(`    - Item 1 Status: ${afterCancel1.items[1].status} (Expected: CONFIRMED)`);
    console.log(`    - Item 0 Listing Stock Restored: ${stock0} (Expected: 10)`);
    console.log(`    - Item 1 Listing Stock Intact: ${stock1} (Expected: 9)`);

    if (
      afterCancel1.orderStatus !== "PARTIALLY_CANCELLED" ||
      afterCancel1.items[0].status !== "CANCELLED" ||
      afterCancel1.items[1].status !== "CONFIRMED" ||
      stock0 !== 10 ||
      stock1 !== 9
    ) {
      throw new Error("Single item cancellation failed assertion!");
    }
    console.log("    -> PASSED: 1 Item successfully cancelled, 9 items remain active!");

    // Step B: Cancel a few items (Items 1, 2, 3)
    console.log("\n  [Step 1B] Buyer cancels a few items (3 items: Items 1, 2, 3)...");
    const itemsFewIds = [
      order10.items[1]._id.toString(),
      order10.items[2]._id.toString(),
      order10.items[3]._id.toString(),
    ];

    const afterCancelFew = await cancelOrderService(
      order10._id.toString(),
      { id: buyer._id.toString(), role: "BUYER" },
      {
        reason: "Decided to read later",
        itemIds: itemsFewIds,
      },
    );

    console.log(`    - Overall Order Status: ${afterCancelFew.orderStatus} (Expected: PARTIALLY_CANCELLED)`);
    const cancelledCountFew = afterCancelFew.items.filter((i) => i.status === "CANCELLED").length;
    const activeCountFew = afterCancelFew.items.filter((i) => i.status !== "CANCELLED").length;
    console.log(`    - Total Cancelled Items: ${cancelledCountFew} (Expected: 4)`);
    console.log(`    - Total Active Items Remaining: ${activeCountFew} (Expected: 6)`);

    if (cancelledCountFew !== 4 || activeCountFew !== 6) {
      throw new Error("Partial few items cancellation failed count assertion!");
    }
    console.log("    -> PASSED: Few items (3) successfully cancelled, 6 items remain active!");

    // Step C: Cancel all remaining items
    console.log("\n  [Step 1C] Buyer cancels all remaining 6 items...");
    const afterCancelAll = await cancelOrderService(
      order10._id.toString(),
      { id: buyer._id.toString(), role: "BUYER" },
      {
        reason: "Need to postpone entire order",
      },
    );

    console.log(`    - Overall Order Status: ${afterCancelAll.orderStatus} (Expected: CANCELLED)`);
    const allCancelled = afterCancelAll.items.every((i) => i.status === "CANCELLED");
    console.log(`    - All 10 items marked CANCELLED: ${allCancelled} (Expected: true)`);

    for (let i = 0; i < 10; i++) {
      const finalStock = (await BookListingModel.findById(tenListings[i]._id).lean())?.stock;
      if (finalStock !== 10) {
        throw new Error(`Listing ${i} stock expected to be restored to 10, but found ${finalStock}`);
      }
    }
    console.log("    - All 10 listing stocks verified restored back to 10!");
    console.log("    -> PASSED: Full cancellation completed!");

    // =========================================================================
    // PART 2: MULTI-SELLER INDEPENDENT DELIVERY TIMELINE, TRACKING & CANCELLATION
    // =========================================================================
    console.log("\n--------------------------------------------------------");
    console.log("TEST 2: Multi-Seller Order - Separate Timelines, Tracking & Cancellation");
    console.log("--------------------------------------------------------");

    // Book A from Seller A (Express Delhivery / BlueDart - 2 days)
    const bookA: any = await BookModel.create({
      title: "Clean Architecture (Seller A)",
      slug: `clean-arch-${TEST_ID}`,
      isbn: `978-0-SELLER-A-${TEST_ID}`,
      description: "Seller A book",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      createdBy: sellerA._id,
    });

    const listingA: any = await BookListingModel.create({
      book: bookA._id,
      seller: sellerA._id,
      sku: `SKU-SELLER-A-${TEST_ID}`,
      mrpInPaise: 80000,
      sellingPriceInPaise: 65000,
      stock: 5,
      isActive: true,
    });

    // Book B from Seller B (Standard India Post - 7 days)
    const bookB: any = await BookModel.create({
      title: "Designing Data-Intensive Apps (Seller B)",
      slug: `ddia-${TEST_ID}`,
      isbn: `978-0-SELLER-B-${TEST_ID}`,
      description: "Seller B book",
      authors: [author._id],
      publisher: publisher._id,
      categories: [category._id],
      createdBy: sellerB._id,
    });

    const listingB: any = await BookListingModel.create({
      book: bookB._id,
      seller: sellerB._id,
      sku: `SKU-SELLER-B-${TEST_ID}`,
      mrpInPaise: 90000,
      sellingPriceInPaise: 75000,
      stock: 5,
      isActive: true,
    });

    // Place multi-seller order with 1 item from Seller A and 1 item from Seller B
    const multiOrder = await createOrderService(buyer._id.toString(), {
      shippingAddressId: address._id.toString(),
      billingSameAsShipping: true,
      paymentMethod: "ONLINE_PAY",
      paymentId: `pay_mock_${TEST_ID}`,
      items: [
        { bookListing: listingA._id.toString(), quantity: 1 },
        { bookListing: listingB._id.toString(), quantity: 1 },
      ],
    });

    console.log(`  - Created Multi-Seller Order: ${multiOrder.orderNumber}`);
    console.log(`  - Items in Order: ${multiOrder.items.length} (from 2 different sellers)`);

    const orderItemA = multiOrder.items.find(
      (i) => i.bookListing.toString() === listingA._id.toString(),
    )!;
    const orderItemB = multiOrder.items.find(
      (i) => i.bookListing.toString() === listingB._id.toString(),
    )!;

    console.log(`  - Item A (Seller A): ID ${orderItemA._id}, Status: ${orderItemA.status}`);
    console.log(`  - Item B (Seller B): ID ${orderItemB._id}, Status: ${orderItemB.status}`);

    // Step A: Seller A updates delivery tracking for Item A
    console.log("\n  [Step 2A] Seller A ships Item A via BlueDart (2-day express delivery)...");
    const sellerATimeline = new Date();
    sellerATimeline.setDate(sellerATimeline.getDate() + 2);

    const updateFulfillmentA = await updateOrderItemFulfillmentService(
      multiOrder._id.toString(),
      orderItemA._id.toString(),
      { id: sellerA._id.toString(), role: "SELLER" },
      {
        courier: "Blue Dart Express",
        trackingNumber: `BD-${TEST_ID}-888`,
        trackingUrl: `https://bluedart.com/track/BD-${TEST_ID}-888`,
        estimatedDeliveryDate: sellerATimeline.toISOString(),
        status: "SHIPPED",
      },
    );

    console.log(`    - Item A Courier: ${updateFulfillmentA.updatedItem.tracking?.courier}`);
    console.log(`    - Item A Tracking Number: ${updateFulfillmentA.updatedItem.tracking?.trackingNumber}`);
    console.log(`    - Item A Status: ${updateFulfillmentA.updatedItem.status} (Expected: SHIPPED)`);
    console.log(`    - Parent Order Status: ${updateFulfillmentA.order.orderStatus} (Expected: PARTIALLY_SHIPPED)`);

    if (
      updateFulfillmentA.updatedItem.status !== "SHIPPED" ||
      updateFulfillmentA.order.orderStatus !== "PARTIALLY_SHIPPED"
    ) {
      throw new Error("Item A fulfillment update failed assertion!");
    }
    console.log("    -> PASSED: Item A shipped with distinct BlueDart tracking!");

    // Step B: Verify Seller B cannot modify Seller A's item
    console.log("\n  [Step 2B] Verifying Seller B cannot update Seller A's item...");
    let unauthorizedBlocked = false;
    try {
      await updateOrderItemFulfillmentService(
        multiOrder._id.toString(),
        orderItemA._id.toString(),
        { id: sellerB._id.toString(), role: "SELLER" },
        { courier: "Hacked Courier" },
      );
    } catch (err: any) {
      if (err.message.includes("Forbidden")) {
        unauthorizedBlocked = true;
      }
    }
    if (!unauthorizedBlocked) {
      throw new Error("Seller B was able to modify Seller A's item!");
    }
    console.log("    -> PASSED: Cross-seller modification correctly blocked with 403 Forbidden!");

    // Step C: Seller B sets tracking for Item B (Standard Courier - 7 days)
    console.log("\n  [Step 2C] Seller B updates tracking for Item B (7-day standard delivery)...");
    const sellerBTimeline = new Date();
    sellerBTimeline.setDate(sellerBTimeline.getDate() + 7);

    const updateFulfillmentB = await updateOrderItemFulfillmentService(
      multiOrder._id.toString(),
      orderItemB._id.toString(),
      { id: sellerB._id.toString(), role: "SELLER" },
      {
        courier: "Delhivery Surface",
        trackingNumber: `DEL-${TEST_ID}-999`,
        trackingUrl: `https://delhivery.com/track/DEL-${TEST_ID}-999`,
        estimatedDeliveryDate: sellerBTimeline.toISOString(),
        status: "PROCESSING",
      },
    );

    console.log(`    - Item B Courier: ${updateFulfillmentB.updatedItem.tracking?.courier}`);
    console.log(`    - Item B Tracking Number: ${updateFulfillmentB.updatedItem.tracking?.trackingNumber}`);
    console.log(`    - Item B Status: ${updateFulfillmentB.updatedItem.status} (Expected: PROCESSING)`);
    console.log("    -> PASSED: Item B tracking and timeline configured separately!");

    // Step D: Buyer views order and inspects different timelines
    console.log("\n  [Step 2D] Buyer views order to inspect distinct timelines and tracking...");
    const buyerOrderView = await getOrderByIdService(multiOrder._id.toString(), {
      id: buyer._id.toString(),
      role: "BUYER",
    });

    console.log(`    - Found ${buyerOrderView.items.length} items in buyer order view`);
    for (const it of buyerOrderView.items) {
      console.log(`      * "${it.title}": Status=${it.status}, Courier=${it.tracking?.courier || "N/A"}, Est.Delivery=${it.estimatedDeliveryDate?.toISOString().split("T")[0]}`);
    }

    // Step E: Cancellation Guard - Buyer tries to cancel Item A (already SHIPPED)
    console.log("\n  [Step 2E] Buyer attempts to cancel Item A (already SHIPPED by Seller A)...");
    let cancelShippedBlocked = false;
    try {
      await cancelOrderService(
        multiOrder._id.toString(),
        { id: buyer._id.toString(), role: "BUYER" },
        {
          reason: "Want to cancel item A",
          itemIds: [orderItemA._id.toString()],
        },
      );
    } catch (err: any) {
      if (err.message.includes("shipped and cannot be cancelled")) {
        cancelShippedBlocked = true;
      }
    }
    if (!cancelShippedBlocked) {
      throw new Error("Cancellation of shipped item A was not blocked!");
    }
    console.log("    -> PASSED: Shipped Item A cancellation correctly blocked!");

    // Step F: Buyer cancels Item B (still PROCESSING with Seller B)
    console.log("\n  [Step 2F] Buyer cancels Item B (PROCESSING with Seller B)...");
    const afterCancelB = await cancelOrderService(
      multiOrder._id.toString(),
      { id: buyer._id.toString(), role: "BUYER" },
      {
        reason: "Taking too long to dispatch",
        itemIds: [orderItemB._id.toString()],
      },
    );

    const cancelledBItem = afterCancelB.items.find(
      (i) => i._id.toString() === orderItemB._id.toString(),
    );
    const intactAItem = afterCancelB.items.find(
      (i) => i._id.toString() === orderItemA._id.toString(),
    );

    const stockListingB = (await BookListingModel.findById(listingB._id).lean())?.stock;

    console.log(`    - Item B Status: ${cancelledBItem?.status} (Expected: CANCELLED)`);
    console.log(`    - Item A Status: ${intactAItem?.status} (Expected: SHIPPED - intact!)`);
    console.log(`    - Listing B Stock Restored: ${stockListingB} (Expected: 5)`);
    console.log(`    - Refund Amount in Paise: ${afterCancelB.refundAmountInPaise} (Expected: 75000)`);
    console.log(`    - Refund Status: ${afterCancelB.refundStatus} (Expected: PARTIALLY_REFUNDED)`);

    if (
      cancelledBItem?.status !== "CANCELLED" ||
      intactAItem?.status !== "SHIPPED" ||
      stockListingB !== 5 ||
      afterCancelB.refundAmountInPaise !== 75000 ||
      afterCancelB.refundStatus !== "PARTIALLY_REFUNDED"
    ) {
      throw new Error("Partial cancellation of Item B failed assertion!");
    }
    console.log("    -> PASSED: Item B cancelled, stock restored, Item A remains en-route!");

    // Step G: Seller A delivers Item A
    console.log("\n  [Step 2G] Seller A delivers Item A...");
    const deliverA = await updateOrderItemFulfillmentService(
      multiOrder._id.toString(),
      orderItemA._id.toString(),
      { id: sellerA._id.toString(), role: "SELLER" },
      {
        status: "DELIVERED",
      },
    );

    console.log(`    - Item A Status: ${deliverA.updatedItem.status} (Expected: DELIVERED)`);
    console.log(`    - Overall Order Status: ${deliverA.order.orderStatus} (Expected: DELIVERED)`);

    if (deliverA.order.orderStatus !== "DELIVERED") {
      throw new Error("Order status expected to be DELIVERED when all remaining items are delivered!");
    }
    console.log("    -> PASSED: All active items delivered, order completed successfully!");

    // Cleanup
    console.log("\nCleaning up test artifacts...");
    await OrderModel.deleteMany({
      _id: { $in: [order10._id, multiOrder._id] },
    });
    await BookListingModel.deleteMany({
      _id: { $in: [...tenListings.map((l) => l._id), listingA._id, listingB._id] },
    });
    await BookModel.deleteMany({
      _id: { $in: [...tenBooks.map((b) => b._id), bookA._id, bookB._id] },
    });
    await AddressModel.deleteMany({ _id: address._id });
    await UserModel.deleteMany({
      _id: { $in: [buyer._id, sellerA._id, sellerB._id] },
    });
    await CategoryModel.deleteMany({ _id: category._id });
    await PublisherModel.deleteMany({ _id: publisher._id });
    await AuthorModel.deleteMany({ _id: author._id });
    await CountryModel.deleteMany({ _id: country._id });

    console.log("\n========================================================");
    console.log("  🎉 ALL MULTI-ITEM & MULTI-SELLER TESTS PASSED! 🎉");
    console.log("========================================================\n");

    process.exit(0);
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
};

runMultiItemAndSellerTests();

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { NewsletterSubscriberModel } from "../models/newsletter.model.js";
import {
  subscribeNewsletterService,
  unsubscribeNewsletterService,
  getSubscribersService,
} from "../services/newsletter.service.js";

const TEST_EMAIL_1 = "test_newsletter_user_1@example.com";
const TEST_EMAIL_2 = "test_newsletter_user_2@example.com";

async function runNewsletterVerification() {
  console.log("Starting Newsletter Subscription API verification...");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/online-book-store";
  await mongoose.connect(mongoUri);

  try {
    // 1. Initial cleanup of previous test runs if any
    await NewsletterSubscriberModel.deleteMany({
      email: { $in: [TEST_EMAIL_1, TEST_EMAIL_2] },
    });

    // 2. Test subscribing new email
    console.log("\n[TEST 1] Subscribing new email...");
    const subResult1 = await subscribeNewsletterService({
      email: TEST_EMAIL_1,
      source: "footer",
      preferences: {
        newReleases: true,
        priceDrops: true,
        offers: false,
      },
    });

    console.log("-> Subscription Result 1:", {
      email: subResult1.subscriber.email,
      isNewSubscription: subResult1.isNewSubscription,
      preferences: subResult1.subscriber.preferences,
    });

    if (!subResult1.isNewSubscription) {
      throw new Error("Expected isNewSubscription to be true for new subscriber");
    }

    // 3. Test subscribing second email
    console.log("\n[TEST 2] Subscribing second email...");
    const subResult2 = await subscribeNewsletterService({
      email: TEST_EMAIL_2,
      source: "popup",
      preferences: {
        newReleases: true,
        priceDrops: false,
        offers: true,
      },
    });

    console.log("-> Subscription Result 2:", {
      email: subResult2.subscriber.email,
      isNewSubscription: subResult2.isNewSubscription,
    });

    // 4. Test re-subscribing / updating preferences for existing subscriber
    console.log("\n[TEST 3] Updating preferences for existing active subscriber...");
    const reSubResult = await subscribeNewsletterService({
      email: TEST_EMAIL_1,
      source: "checkout",
      preferences: {
        newReleases: true,
        priceDrops: true,
        offers: true,
      },
    });

    console.log("-> Re-subscription Result:", {
      email: reSubResult.subscriber.email,
      isNewSubscription: reSubResult.isNewSubscription,
      wasReactivated: reSubResult.wasReactivated,
      preferences: reSubResult.subscriber.preferences,
      source: reSubResult.subscriber.source,
    });

    if (reSubResult.isNewSubscription) {
      throw new Error("Expected isNewSubscription to be false for existing subscriber");
    }

    // 5. Test Unsubscribing
    console.log("\n[TEST 4] Unsubscribing email...");
    const unsubscriber = await unsubscribeNewsletterService({
      email: TEST_EMAIL_1,
    });

    console.log("-> Unsubscribe Result:", {
      email: unsubscriber.email,
      isSubscribed: unsubscriber.isSubscribed,
      unsubscribedAt: unsubscriber.unsubscribedAt,
    });

    if (unsubscriber.isSubscribed) {
      throw new Error("Expected isSubscribed to be false after unsubscribe");
    }

    // 6. Test Reactivating unsubscribed user
    console.log("\n[TEST 5] Reactivating unsubscribed user...");
    const reactivateResult = await subscribeNewsletterService({
      email: TEST_EMAIL_1,
      source: "footer",
      preferences: {
        newReleases: true,
        priceDrops: true,
        offers: true,
      },
    });

    console.log("-> Reactivation Result:", {
      email: reactivateResult.subscriber.email,
      isSubscribed: reactivateResult.subscriber.isSubscribed,
      wasReactivated: reactivateResult.wasReactivated,
    });

    if (!reactivateResult.wasReactivated) {
      throw new Error("Expected wasReactivated to be true");
    }

    // 7. Test Admin Query Listing
    console.log("\n[TEST 6] Querying subscribers list...");
    const listResult = await getSubscribersService({
      page: 1,
      limit: 10,
      search: "test_newsletter_user",
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    console.log("-> Query List count:", listResult.subscribers.length);
    console.log("-> Meta:", listResult.meta);

    if (listResult.subscribers.length < 2) {
      throw new Error("Expected at least 2 test subscribers in list");
    }

    console.log("\nAll Newsletter API tests passed successfully! ✅");
  } finally {
    // Mandatory cleanup of all test data
    console.log("\nCleaning up test data...");
    await NewsletterSubscriberModel.deleteMany({
      email: { $in: [TEST_EMAIL_1, TEST_EMAIL_2] },
    });
    console.log("Test data cleanup completed.");
    await mongoose.disconnect();
  }
}

runNewsletterVerification().catch((err) => {
  console.error("Test execution failed ❌:", err);
  process.exit(1);
});

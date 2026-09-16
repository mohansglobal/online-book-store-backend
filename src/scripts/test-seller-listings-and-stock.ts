import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import {
  UserModel,
  BookListingModel,
} from "../models/index.js";
import { logger } from "../utils/logger.js";
import { generateAccessToken } from "../utils/jwt.js";

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

const runTests = async () => {
  let server: http.Server | null = null;

  try {
    console.log("\n=======================================================");
    console.log("   TEST SELLER OWN LISTINGS & STOCK UPDATE APIS");
    console.log("=======================================================\n");

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
    console.log(`Ephemeral test server running on port: ${port}`);

    // 1. Find a seller who has listings
    const listingWithSeller = await BookListingModel.findOne({}).populate("seller");
    if (!listingWithSeller) {
      throw new Error("No book listings found in database for testing");
    }

    const sellerUser = await UserModel.findById(listingWithSeller.seller);
    if (!sellerUser) {
      throw new Error("Seller user not found");
    }

    // Generate JWT token for this seller
    const sellerToken = generateAccessToken({
      sub: sellerUser._id.toString(),
      role: sellerUser.role,
    });

    // Find a second user to test unauthorized access
    let otherUser = await UserModel.findOne({ _id: { $ne: sellerUser._id }, role: "SELLER" });
    if (!otherUser) {
      otherUser = await UserModel.create({
        name: "Other Test Seller",
        email: `other_seller_${Date.now()}@test.com`,
        password: "Password123!",
        role: "SELLER",
        isActive: true,
      });
    }

    const otherToken = generateAccessToken({
      sub: otherUser._id.toString(),
      role: otherUser.role,
    });

    console.log(`\n[Test 1] GET /api/v1/book-listings/my-listings for Seller ${sellerUser.name}`);
    const myListingsRes = await makeRequest(
      port,
      "/api/v1/book-listings/my-listings?page=1&limit=10",
      "GET",
      undefined,
      sellerToken,
    );

    console.log(`Status: ${myListingsRes.status}`);
    if (myListingsRes.status !== 200 || !myListingsRes.body.success) {
      throw new Error(`Failed to get my-listings: ${JSON.stringify(myListingsRes.body)}`);
    }
    console.log(`Total listings found for seller: ${myListingsRes.body.meta?.total}`);
    console.log(`Listings returned on page: ${myListingsRes.body.data?.length}`);

    // Verify all returned listings belong to the seller
    for (const item of myListingsRes.body.data) {
      const itemSellerId = item.seller?._id || item.seller;
      if (itemSellerId.toString() !== sellerUser._id.toString()) {
        throw new Error(`Listing ${item._id} has seller ${itemSellerId}, expected ${sellerUser._id}`);
      }
    }
    console.log("✓ All returned listings belong exclusively to the authenticated seller");

    // 2. Test search and filters on my-listings
    console.log("\n[Test 2] Filter my-listings with inStock=true");
    const inStockRes = await makeRequest(
      port,
      "/api/v1/book-listings/my-listings?inStock=true",
      "GET",
      undefined,
      sellerToken,
    );
    console.log(`Status: ${inStockRes.status}, Total in-stock: ${inStockRes.body.meta?.total}`);

    // 3. Test Stock Increase API
    const targetListingId = listingWithSeller._id.toString();
    const initialStock = listingWithSeller.stock;
    console.log(`\n[Test 3] Increase stock on listing ${targetListingId} (current stock: ${initialStock})`);

    const increaseRes = await makeRequest(
      port,
      `/api/v1/book-listings/${targetListingId}/stock`,
      "PATCH",
      { operation: "increase", quantity: 15 },
      sellerToken,
    );

    console.log(`Status: ${increaseRes.status}`);
    if (increaseRes.status !== 200 || !increaseRes.body.success) {
      throw new Error(`Failed to increase stock: ${JSON.stringify(increaseRes.body)}`);
    }
    const expectedIncreasedStock = initialStock + 15;
    if (increaseRes.body.data.stock !== expectedIncreasedStock) {
      throw new Error(`Expected stock ${expectedIncreasedStock}, got ${increaseRes.body.data.stock}`);
    }
    console.log(`✓ Stock successfully increased from ${initialStock} to ${increaseRes.body.data.stock}`);

    // 4. Test Stock Decrease API
    console.log(`\n[Test 4] Decrease stock by 5 on listing ${targetListingId}`);
    const decreaseRes = await makeRequest(
      port,
      `/api/v1/book-listings/${targetListingId}/stock`,
      "PATCH",
      { operation: "decrease", quantity: 5 },
      sellerToken,
    );

    console.log(`Status: ${decreaseRes.status}`);
    if (decreaseRes.status !== 200 || !decreaseRes.body.success) {
      throw new Error(`Failed to decrease stock: ${JSON.stringify(decreaseRes.body)}`);
    }
    const expectedDecreasedStock = expectedIncreasedStock - 5;
    if (decreaseRes.body.data.stock !== expectedDecreasedStock) {
      throw new Error(`Expected stock ${expectedDecreasedStock}, got ${decreaseRes.body.data.stock}`);
    }
    console.log(`✓ Stock successfully decreased to ${decreaseRes.body.data.stock}`);

    // 5. Test Negative Stock Prevention
    console.log(`\n[Test 5] Attempt to decrease stock by 999999 (expecting 400 Insufficient stock)`);
    const excessiveDecreaseRes = await makeRequest(
      port,
      `/api/v1/book-listings/${targetListingId}/stock`,
      "PATCH",
      { operation: "decrease", quantity: 999999 },
      sellerToken,
    );

    console.log(`Status: ${excessiveDecreaseRes.status}`);
    if (excessiveDecreaseRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${excessiveDecreaseRes.status}`);
    }
    console.log(`✓ Negative stock prevented: ${excessiveDecreaseRes.body.message}`);

    // 6. Test Stock Set API (setting back to original stock)
    console.log(`\n[Test 6] Set stock explicitly to ${initialStock}`);
    const setRes = await makeRequest(
      port,
      `/api/v1/book-listings/${targetListingId}/stock`,
      "PATCH",
      { operation: "set", quantity: initialStock },
      sellerToken,
    );

    console.log(`Status: ${setRes.status}`);
    if (setRes.status !== 200 || setRes.body.data.stock !== initialStock) {
      throw new Error(`Expected stock ${initialStock}, got ${setRes.body.data?.stock}`);
    }
    console.log(`✓ Stock successfully set to ${initialStock}`);

    // 7. Test Unauthorized Seller Modification
    console.log(`\n[Test 7] Attempt by another seller to update listing stock (expecting 403 Forbidden)`);
    const unauthorizedRes = await makeRequest(
      port,
      `/api/v1/book-listings/${targetListingId}/stock`,
      "PATCH",
      { operation: "increase", quantity: 5 },
      otherToken,
    );

    console.log(`Status: ${unauthorizedRes.status}`);
    if (unauthorizedRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${unauthorizedRes.status}`);
    }
    console.log(`✓ Ownership check confirmed: ${unauthorizedRes.body.message}`);

    // 8. Test Toggle Listing Active / Inactive Status
    console.log(`\n[Test 8] Toggle listing ${targetListingId} to INACTIVE`);
    const toggleInactiveRes = await makeRequest(
      port,
      `/api/v1/book-listings/${targetListingId}/toggle-status`,
      "PATCH",
      { isActive: false },
      sellerToken,
    );

    console.log(`Status: ${toggleInactiveRes.status}`);
    if (toggleInactiveRes.status !== 200 || toggleInactiveRes.body.data.isActive !== false) {
      throw new Error(`Expected isActive to be false, got ${toggleInactiveRes.body.data?.isActive}`);
    }
    console.log(`✓ Listing successfully deactivated`);

    // Verify public /book-listings does NOT return the deactivated listing
    const publicListingsRes = await makeRequest(
      port,
      `/api/v1/book-listings`,
      "GET",
    );
    const foundInPublic = publicListingsRes.body.data?.some(
      (item: any) => item._id === targetListingId,
    );
    if (foundInPublic) {
      throw new Error(`Inactive listing ${targetListingId} was found in public /book-listings!`);
    }
    console.log(`✓ Inactive listing is properly excluded from public /book-listings`);

    // 9. Test Toggle Listing Back to ACTIVE
    console.log(`\n[Test 9] Toggle listing ${targetListingId} back to ACTIVE`);
    const toggleActiveRes = await makeRequest(
      port,
      `/api/v1/book-listings/${targetListingId}/toggle-status`,
      "PATCH",
      undefined,
      sellerToken,
    );

    console.log(`Status: ${toggleActiveRes.status}`);
    if (toggleActiveRes.status !== 200 || toggleActiveRes.body.data.isActive !== true) {
      throw new Error(`Expected isActive to be true, got ${toggleActiveRes.body.data?.isActive}`);
    }
    console.log(`✓ Listing successfully re-activated`);

    // 10. Test Canonical Book Active/Inactive Toggle & Public Filter
    const bookId = listingWithSeller.book._id ? listingWithSeller.book._id.toString() : listingWithSeller.book.toString();
    console.log(`\n[Test 10] Deactivate canonical book ${bookId}`);

    const adminToken = generateAccessToken({
      sub: sellerUser._id.toString(),
      role: "ADMIN",
    });

    // Deactivate canonical book with admin token
    const bookDeactivateRes = await makeRequest(
      port,
      `/api/v1/books/${bookId}/status`,
      "PATCH",
      { status: "INACTIVE" },
      adminToken,
    );
    console.log(`Book deactivate status: ${bookDeactivateRes.status}`);
    if (bookDeactivateRes.status !== 200) {
      throw new Error(`Failed to deactivate canonical book: ${JSON.stringify(bookDeactivateRes.body)}`);
    }

    // Verify public /books does not return listings for this inactive book
    const publicBooksRes = await makeRequest(
      port,
      `/api/v1/books`,
      "GET",
    );
    const foundBookInPublic = publicBooksRes.body.data?.some(
      (item: any) => item.bookId === bookId || item._id === targetListingId,
    );
    if (foundBookInPublic) {
      throw new Error(`Inactive canonical book was returned in public /books!`);
    }
    console.log(`✓ Inactive canonical book is properly excluded from public /books`);

    // Reactivate canonical book
    const bookReactivateRes = await makeRequest(
      port,
      `/api/v1/books/${bookId}/status`,
      "PATCH",
      { status: "ACTIVE" },
      adminToken,
    );
    console.log(`✓ Canonical book reactivated (${bookReactivateRes.status})`);


    console.log("\n=======================================================");
    console.log("   ALL TESTS PASSED SUCCESSFULLY! ✓");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("Test failed with error:", error);
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


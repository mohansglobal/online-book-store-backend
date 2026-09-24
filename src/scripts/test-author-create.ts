import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import { AuthorModel } from "../models/author.model.js";
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

const runAuthorTests = async () => {
  let server: http.Server | null = null;
  const createdAuthorIds: mongoose.Types.ObjectId[] = [];

  try {
    console.log("\n=======================================================");
    console.log("   TEST ADMIN-LEVEL POST API FOR AUTHORS");
    console.log("=======================================================");

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
    logger.info(`Test server listening on port ${port}`);

    // Create test JWT tokens for each role
    const adminId = new mongoose.Types.ObjectId().toString();
    const sellerId = new mongoose.Types.ObjectId().toString();
    const buyerId = new mongoose.Types.ObjectId().toString();

    const adminToken = generateAccessToken({ sub: adminId, role: "ADMIN" });
    const sellerToken = generateAccessToken({ sub: sellerId, role: "SELLER" });
    const buyerToken = generateAccessToken({ sub: buyerId, role: "BUYER" });

    const testTimestamp = Date.now();
    const testAuthorName = `Test Author ${testTimestamp}`;

    // Test 1: Unauthenticated request
    console.log("\n[Test 1] POST /api/v1/authors without token -> Expect 401 Unauthorized");
    const res1 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      { name: testAuthorName },
    );
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 401) {
      throw new Error(`Expected status 401, got ${res1.status}`);
    }
    console.log("✅ Test 1 Passed: Unauthenticated request rejected with 401");

    // Test 2: Authenticated with BUYER role
    console.log("\n[Test 2] POST /api/v1/authors with BUYER token -> Expect 403 Forbidden");
    const res2 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      { name: testAuthorName },
      buyerToken,
    );
    console.log(`Status: ${res2.status}`);
    if (res2.status !== 403) {
      throw new Error(`Expected status 403, got ${res2.status}`);
    }
    console.log("✅ Test 2 Passed: BUYER role rejected with 403");

    // Test 3: Authenticated with BUYER role rejected
    console.log("\n[Test 3] POST /api/v1/authors with BUYER token -> Expect 403 Forbidden");
    const res3 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      { name: testAuthorName },
      buyerToken,
    );
    console.log(`Status: ${res3.status}`);
    if (res3.status !== 403) {
      throw new Error(`Expected status 403 for BUYER, got ${res3.status}`);
    }
    console.log("✅ Test 3 Passed: BUYER role rejected with 403");

    // Test 4: Authenticated with ADMIN role and invalid payload (empty name)
    console.log("\n[Test 4] POST /api/v1/authors with ADMIN token and empty name -> Expect 400 Bad Request");
    const res4 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      { name: "   " },
      adminToken,
    );
    console.log(`Status: ${res4.status}`);
    if (res4.status !== 400) {
      throw new Error(`Expected status 400, got ${res4.status}`);
    }
    console.log("✅ Test 4 Passed: Invalid author name rejected with 400");

    // Test 5: Authenticated with ADMIN role and deathDate earlier than birthDate
    console.log("\n[Test 5] POST /api/v1/authors with deathDate earlier than birthDate -> Expect 400 Bad Request");
    const res5 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      {
        name: testAuthorName,
        birthDate: "2000-01-01",
        deathDate: "1990-01-01",
      },
      adminToken,
    );
    console.log(`Status: ${res5.status}`);
    if (res5.status !== 400) {
      throw new Error(`Expected status 400, got ${res5.status}`);
    }
    console.log("✅ Test 5 Passed: Invalid date sequence rejected with 400");

    // Test 6: Authenticated with ADMIN role and future birthDate
    console.log("\n[Test 6] POST /api/v1/authors with future birthDate -> Expect 400 Bad Request");
    const res6 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      {
        name: testAuthorName,
        birthDate: "2099-01-01",
      },
      adminToken,
    );
    console.log(`Status: ${res6.status}`);
    if (res6.status !== 400) {
      throw new Error(`Expected status 400, got ${res6.status}`);
    }
    console.log("✅ Test 6 Passed: Future birth date rejected with 400");

    // Test 7: Authenticated with ADMIN role and valid author data
    console.log("\n[Test 7] POST /api/v1/authors with ADMIN token and valid data -> Expect 201 Created");
    const res7 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      {
        name: testAuthorName,
        nameBn: "টেস্ট লেখক",
        bio: "An acclaimed writer from test domain.",
        photo: "https://example.com/photo.jpg",
        birthDate: "1980-05-15",
        isActive: true,
      },
      adminToken,
    );
    console.log(`Status: ${res7.status}`);
    console.log(`Response Data:`, res7.body);

    if (res7.status !== 201 || !res7.body?.data) {
      throw new Error(`Expected status 201 with data, got ${res7.status}`);
    }

    const createdAuthor = res7.body.data;
    createdAuthorIds.push(new mongoose.Types.ObjectId(createdAuthor._id));

    if (!createdAuthor.slug || !createdAuthor.slug.startsWith("test-author-")) {
      throw new Error(`Slug was not generated properly: ${createdAuthor.slug}`);
    }
    console.log(`✅ Test 7 Passed: Author created with auto-generated slug "${createdAuthor.slug}"`);

    // Test 8: Authenticated with ADMIN role and duplicate name (slug collision test)
    console.log("\n[Test 8] POST /api/v1/authors with duplicate name -> Expect 201 Created with collision suffix");
    const res8 = await makeRequest(
      port,
      "/api/v1/authors",
      "POST",
      {
        name: testAuthorName,
        nameBn: "টেস্ট লেখক ২",
        bio: "Duplicate name author test.",
      },
      adminToken,
    );
    console.log(`Status: ${res8.status}`);
    console.log(`Response Data:`, res8.body);

    if (res8.status !== 201 || !res8.body?.data) {
      throw new Error(`Expected status 201 with data for duplicate, got ${res8.status}`);
    }

    const duplicateAuthor = res8.body.data;
    createdAuthorIds.push(new mongoose.Types.ObjectId(duplicateAuthor._id));

    if (duplicateAuthor.slug !== `${createdAuthor.slug}-1`) {
      throw new Error(
        `Expected collision resolved slug "${createdAuthor.slug}-1", got "${duplicateAuthor.slug}"`,
      );
    }
    console.log(`✅ Test 8 Passed: Duplicate name received unique slug "${duplicateAuthor.slug}"`);

    // Test 9: GET /api/v1/authors/:slug to verify fetch by slug
    console.log(`\n[Test 9] GET /api/v1/authors/${createdAuthor.slug} -> Expect 200 OK`);
    const res9 = await makeRequest(
      port,
      `/api/v1/authors/${createdAuthor.slug}`,
      "GET",
    );
    console.log(`Status: ${res9.status}`);
    if (res9.status !== 200 || res9.body?.data?.slug !== createdAuthor.slug) {
      throw new Error(`Failed to retrieve author by slug, status: ${res9.status}`);
    }
    console.log(`✅ Test 9 Passed: Successfully retrieved author by slug`);

    // Test 10: GET /api/v1/authors/:id to verify fetch by ObjectId
    console.log(`\n[Test 10] GET /api/v1/authors/${createdAuthor._id} -> Expect 200 OK`);
    const res10 = await makeRequest(
      port,
      `/api/v1/authors/${createdAuthor._id}`,
      "GET",
    );
    console.log(`Status: ${res10.status}`);
    if (res10.status !== 200 || res10.body?.data?._id !== createdAuthor._id) {
      throw new Error(`Failed to retrieve author by ID, status: ${res10.status}`);
    }
    console.log(`✅ Test 10 Passed: Successfully retrieved author by ID`);

    // Test 11: GET /api/v1/authors with search
    console.log(`\n[Test 11] GET /api/v1/authors?search=${encodeURIComponent(testAuthorName)} -> Expect 200 OK`);
    const res11 = await makeRequest(
      port,
      `/api/v1/authors?search=${encodeURIComponent(testAuthorName)}`,
      "GET",
    );
    console.log(`Status: ${res11.status}, Total authors found: ${res11.body?.data?.length}`);
    if (res11.status !== 200 || !res11.body?.data || res11.body.data.length < 2) {
      throw new Error(`Failed to search authors, status: ${res11.status}`);
    }
    console.log(`✅ Test 11 Passed: Search returned both test authors`);

    // Test 12: GET /api/v1/authors default sort should be createdAt descending (newest first)
    console.log("\n[Test 12] GET /api/v1/authors -> Expect default sort to be createdAt DESC");
    const res12 = await makeRequest(port, "/api/v1/authors?limit=10", "GET");
    if (res12.status !== 200 || !Array.isArray(res12.body?.data)) {
      throw new Error(`Failed to fetch authors list, status: ${res12.status}`);
    }
    const authorsList = res12.body.data;
    if (authorsList.length >= 2) {
      const firstDate = new Date(authorsList[0].createdAt).getTime();
      const secondDate = new Date(authorsList[1].createdAt).getTime();
      if (firstDate < secondDate) {
        throw new Error(
          `Authors are not sorted in descending order of createdAt: first=${authorsList[0].createdAt}, second=${authorsList[1].createdAt}`,
        );
      }
    }
    console.log(`✅ Test 12 Passed: Authors are sorted in createdAt descending order`);

    // Test 13: PATCH /api/v1/authors/:id without token -> Expect 401 Unauthorized
    console.log("\n[Test 13] PATCH /api/v1/authors/:id without token -> Expect 401 Unauthorized");
    const res13 = await makeRequest(
      port,
      `/api/v1/authors/${createdAuthor._id}`,
      "PATCH",
      { bio: "Updated bio without token" },
    );
    console.log(`Status: ${res13.status}`);
    if (res13.status !== 401) {
      throw new Error(`Expected status 401, got ${res13.status}`);
    }
    console.log("✅ Test 13 Passed: Unauthorized PATCH rejected with 401");

    // Test 14: PATCH /api/v1/authors/:id with BUYER token -> Expect 403 Forbidden
    console.log("\n[Test 14] PATCH /api/v1/authors/:id with BUYER token -> Expect 403 Forbidden");
    const res14 = await makeRequest(
      port,
      `/api/v1/authors/${createdAuthor._id}`,
      "PATCH",
      { bio: "Updated bio with buyer token" },
      buyerToken,
    );
    console.log(`Status: ${res14.status}`);
    if (res14.status !== 403) {
      throw new Error(`Expected status 403, got ${res14.status}`);
    }
    console.log("✅ Test 14 Passed: BUYER role rejected from PATCH with 403");

    // Test 15: PATCH /api/v1/authors/:id with invalid date sequence -> Expect 400 Bad Request
    console.log("\n[Test 15] PATCH /api/v1/authors/:id with invalid dates -> Expect 400 Bad Request");
    const res15 = await makeRequest(
      port,
      `/api/v1/authors/${createdAuthor._id}`,
      "PATCH",
      {
        birthDate: "2010-01-01",
        deathDate: "1990-01-01",
      },
      sellerToken,
    );
    console.log(`Status: ${res15.status}`);
    if (res15.status !== 400) {
      throw new Error(`Expected status 400, got ${res15.status}`);
    }
    console.log("✅ Test 15 Passed: Invalid date sequence in PATCH rejected with 400");

    // Test 16: PATCH /api/v1/authors/:id with non-existent ObjectId -> Expect 404 Not Found
    const fakeId = new mongoose.Types.ObjectId().toString();
    console.log(`\n[Test 16] PATCH /api/v1/authors/${fakeId} with non-existent id -> Expect 404 Not Found`);
    const res16 = await makeRequest(
      port,
      `/api/v1/authors/${fakeId}`,
      "PATCH",
      { bio: "Should fail 404" },
      adminToken,
    );
    console.log(`Status: ${res16.status}`);
    if (res16.status !== 404) {
      throw new Error(`Expected status 404, got ${res16.status}`);
    }
    console.log("✅ Test 16 Passed: Non-existent author PATCH returned 404");

    // Test 17: PATCH /api/v1/authors/:id with valid SELLER update
    const updatedBioText = "This is a newly updated biography via PATCH API.";
    console.log("\n[Test 17] PATCH /api/v1/authors/:id with valid SELLER update -> Expect 200 OK");
    const res17 = await makeRequest(
      port,
      `/api/v1/authors/${createdAuthor._id}`,
      "PATCH",
      {
        bio: updatedBioText,
        isActive: false,
      },
      sellerToken,
    );
    console.log(`Status: ${res17.status}`);
    console.log(`Response Data:`, res17.body);
    if (res17.status !== 200 || !res17.body?.data) {
      throw new Error(`Expected status 200 with data, got ${res17.status}`);
    }
    if (res17.body.data.bio !== updatedBioText || res17.body.data.isActive !== false) {
      throw new Error("Author update did not persist fields correctly");
    }
    console.log("✅ Test 17 Passed: Author updated successfully via PATCH");

    // Test 18: GET /api/v1/authors/:id to verify updated fields
    console.log(`\n[Test 18] GET /api/v1/authors/${createdAuthor._id} -> Verify persisted PATCH update`);
    const res18 = await makeRequest(
      port,
      `/api/v1/authors/${createdAuthor._id}`,
      "GET",
    );
    console.log(`Status: ${res18.status}`);
    if (res18.status !== 200 || res18.body?.data?.bio !== updatedBioText || res18.body?.data?.isActive !== false) {
      throw new Error(`Failed to verify persisted author data, status: ${res18.status}`);
    }
    console.log("✅ Test 18 Passed: Verified persisted updated author");

    // Test 19: DELETE /api/v1/authors/:id without token -> Expect 401 Unauthorized
    console.log("\n[Test 19] DELETE /api/v1/authors/:id without token -> Expect 401 Unauthorized");
    const res19 = await makeRequest(
      port,
      `/api/v1/authors/${duplicateAuthor._id}`,
      "DELETE",
    );
    console.log(`Status: ${res19.status}`);
    if (res19.status !== 401) {
      throw new Error(`Expected status 401, got ${res19.status}`);
    }
    console.log("✅ Test 19 Passed: Unauthorized DELETE rejected with 401");

    // Test 20: DELETE /api/v1/authors/:id with BUYER token -> Expect 403 Forbidden
    console.log("\n[Test 20] DELETE /api/v1/authors/:id with BUYER token -> Expect 403 Forbidden");
    const res20 = await makeRequest(
      port,
      `/api/v1/authors/${duplicateAuthor._id}`,
      "DELETE",
      undefined,
      buyerToken,
    );
    console.log(`Status: ${res20.status}`);
    if (res20.status !== 403) {
      throw new Error(`Expected status 403, got ${res20.status}`);
    }
    console.log("✅ Test 20 Passed: BUYER token rejected from DELETE with 403");

    // Test 21: DELETE /api/v1/authors/:id with non-existent id -> Expect 404 Not Found
    console.log(`\n[Test 21] DELETE /api/v1/authors/${fakeId} -> Expect 404 Not Found`);
    const res21 = await makeRequest(
      port,
      `/api/v1/authors/${fakeId}`,
      "DELETE",
      undefined,
      adminToken,
    );
    console.log(`Status: ${res21.status}`);
    if (res21.status !== 404) {
      throw new Error(`Expected status 404, got ${res21.status}`);
    }
    console.log("✅ Test 21 Passed: Non-existent author DELETE returned 404");

    // Test 22: DELETE /api/v1/authors/:id with valid ADMIN/SELLER token -> Expect 200 OK (soft-deleted)
    console.log(`\n[Test 22] DELETE /api/v1/authors/${duplicateAuthor._id} -> Expect 200 OK (soft delete)`);
    const res22 = await makeRequest(
      port,
      `/api/v1/authors/${duplicateAuthor._id}`,
      "DELETE",
      undefined,
      adminToken,
    );
    console.log(`Status: ${res22.status}`);
    console.log(`Response Data:`, res22.body);
    if (res22.status !== 200 || !res22.body?.data || res22.body.data.isDel !== true) {
      throw new Error(`Expected status 200 with isDel: true, got ${res22.status}`);
    }
    console.log("✅ Test 22 Passed: Author soft-deleted successfully (isDel set to true)");

    // Test 23: GET /api/v1/authors/:id on soft-deleted author -> Expect 404 Not Found
    console.log(`\n[Test 23] GET /api/v1/authors/${duplicateAuthor._id} (deleted author) -> Expect 404 Not Found`);
    const res23 = await makeRequest(
      port,
      `/api/v1/authors/${duplicateAuthor._id}`,
      "GET",
    );
    console.log(`Status: ${res23.status}`);
    if (res23.status !== 404) {
      throw new Error(`Expected status 404 for deleted author, got ${res23.status}`);
    }
    console.log("✅ Test 23 Passed: GET by ID for soft-deleted author correctly returns 404");

    // Test 24: GET /api/v1/authors/:slug on soft-deleted author -> Expect 404 Not Found
    console.log(`\n[Test 24] GET /api/v1/authors/${duplicateAuthor.slug} (deleted author slug) -> Expect 404 Not Found`);
    const res24 = await makeRequest(
      port,
      `/api/v1/authors/${duplicateAuthor.slug}`,
      "GET",
    );
    console.log(`Status: ${res24.status}`);
    if (res24.status !== 404) {
      throw new Error(`Expected status 404 for deleted author slug, got ${res24.status}`);
    }
    console.log("✅ Test 24 Passed: GET by slug for soft-deleted author correctly returns 404");

    // Test 25: GET /api/v1/authors list should not include soft-deleted author
    console.log(`\n[Test 25] GET /api/v1/authors?search=${encodeURIComponent(testAuthorName)} -> Verify soft-deleted author is excluded`);
    const res25 = await makeRequest(
      port,
      `/api/v1/authors?search=${encodeURIComponent(testAuthorName)}`,
      "GET",
    );
    console.log(`Status: ${res25.status}, Total authors found: ${res25.body?.data?.length}`);
    if (res25.status !== 200 || !Array.isArray(res25.body?.data)) {
      throw new Error(`Failed to list authors, status: ${res25.status}`);
    }
    const foundDeleted = res25.body.data.some((a: any) => a._id === duplicateAuthor._id);
    if (foundDeleted) {
      throw new Error("Soft-deleted author was found in GET /api/v1/authors listing");
    }
    if (res25.body.data.length !== 1) {
      throw new Error(`Expected exactly 1 active author, got ${res25.body.data.length}`);
    }
    console.log("✅ Test 25 Passed: Soft-deleted author excluded from authors list");

    // Test 26: Attempting to DELETE already soft-deleted author -> Expect 404 Not Found
    console.log(`\n[Test 26] DELETE /api/v1/authors/${duplicateAuthor._id} (already deleted) -> Expect 404 Not Found`);
    const res26 = await makeRequest(
      port,
      `/api/v1/authors/${duplicateAuthor._id}`,
      "DELETE",
      undefined,
      adminToken,
    );
    console.log(`Status: ${res26.status}`);
    if (res26.status !== 404) {
      throw new Error(`Expected status 404 for already deleted author, got ${res26.status}`);
    }
    console.log("✅ Test 26 Passed: Re-deleting soft-deleted author returns 404");

    console.log("\n=======================================================");
    console.log("   🎉 ALL 26 AUTHOR TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Test suite failed");
    console.error("❌ Test error:", error);
    process.exit(1);
  } finally {
    if (createdAuthorIds.length > 0) {
      await AuthorModel.deleteMany({ _id: { $in: createdAuthorIds } });
      logger.info(`Cleaned up ${createdAuthorIds.length} test author records.`);
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void runAuthorTests();



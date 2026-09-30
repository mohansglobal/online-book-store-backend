import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import { AuthorModel } from "../models/author.model.js";
import { logger } from "../utils/logger.js";

const makeRequest = async (port: number, path: string) => {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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
    req.end();
  });
};

const run = async () => {
  let server: http.Server | null = null;
  const createdAuthorIds: mongoose.Types.ObjectId[] = [];

  try {
    console.log("\n=======================================================");
    console.log("   TEST AUTHOR GET API PAGINATION & ALPHABETICAL ASCE");
    console.log("=======================================================\n");

    await mongoose.connect(env.MONGODB_URI);
    logger.info("Connected to MongoDB for test");

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get server port");
    }
    const port = address.port;

    const uniqueTag = Date.now();
    const authorZ = await AuthorModel.create({
      name: `Zara Author ${uniqueTag}`,
      bio: "Zara bio",
      isActive: true,
      isDel: false,
    });
    createdAuthorIds.push(authorZ._id as mongoose.Types.ObjectId);

    const authorA = await AuthorModel.create({
      name: `Arthur Author ${uniqueTag}`,
      bio: "Arthur bio",
      isActive: true,
      isDel: false,
    });
    createdAuthorIds.push(authorA._id as mongoose.Types.ObjectId);

    const authorB = await AuthorModel.create({
      name: `brandon author ${uniqueTag}`,
      bio: "Brandon bio (lowercase b to test case-insensitivity)",
      isActive: true,
      isDel: false,
    });
    createdAuthorIds.push(authorB._id as mongoose.Types.ObjectId);

    console.log(`Created 3 test authors with tag ${uniqueTag}`);

    // Test 1: Verify default pagination metadata
    console.log("\n[Test 1] GET /api/v1/authors -> Verify default pagination metadata");
    const res1 = await makeRequest(port, "/api/v1/authors");
    if (res1.status !== 200 || !res1.body?.meta) {
      throw new Error(`Test 1 Failed: Status ${res1.status}`);
    }
    console.log(`Meta:`, res1.body.meta);
    if (typeof res1.body.meta.page !== "number" || typeof res1.body.meta.limit !== "number") {
      throw new Error("Test 1 Failed: page and limit are missing from meta");
    }
    console.log("✅ Test 1 Passed: Default pagination meta is present");

    // Test 2: Verify custom page and limit
    console.log("\n[Test 2] GET /api/v1/authors?search=" + uniqueTag + "&page=1&limit=2");
    const res2 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&page=1&limit=2`);
    if (res2.status !== 200 || res2.body?.data?.length !== 2) {
      throw new Error(`Test 2 Failed: Expected 2 authors, got ${res2.body?.data?.length}`);
    }
    const meta2 = res2.body.meta;
    console.log(`Meta:`, meta2);
    if (meta2.page !== 1 || meta2.limit !== 2 || meta2.total !== 3 || meta2.totalPages !== 2 || !meta2.hasNextPage) {
      throw new Error(`Test 2 Failed: Invalid pagination meta: ${JSON.stringify(meta2)}`);
    }
    console.log("✅ Test 2 Passed: Pagination page 1 with limit 2 succeeded");

    // Test 3: Pagination page 2
    console.log("\n[Test 3] GET /api/v1/authors?search=" + uniqueTag + "&page=2&limit=2");
    const res3 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&page=2&limit=2`);
    if (res3.status !== 200 || res3.body?.data?.length !== 1) {
      throw new Error(`Test 3 Failed: Expected 1 author on page 2, got ${res3.body?.data?.length}`);
    }
    const meta3 = res3.body.meta;
    console.log(`Meta:`, meta3);
    if (meta3.page !== 2 || meta3.hasPrevPage !== true || meta3.hasNextPage !== false) {
      throw new Error(`Test 3 Failed: Invalid pagination meta for page 2: ${JSON.stringify(meta3)}`);
    }
    console.log("✅ Test 3 Passed: Pagination page 2 succeeded");

    // Test 4: ?sortOrder=asce alphabetical ordering
    console.log("\n[Test 4] GET /api/v1/authors?search=" + uniqueTag + "&sortOrder=asce");
    const res4 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&sortOrder=asce`);
    if (res4.status !== 200 || res4.body?.data?.length !== 3) {
      throw new Error(`Test 4 Failed: Expected 3 authors, got ${res4.body?.data?.length}`);
    }
    const names4: string[] = res4.body.data.map((a: any) => a.name);
    console.log("Returned order with ?sortOrder=asce:", names4);
    if (
      !names4[0].startsWith("Arthur") ||
      !names4[1].startsWith("brandon") ||
      !names4[2].startsWith("Zara")
    ) {
      throw new Error(`Test 4 Failed: Incorrect alphabetical order: ${names4.join(", ")}`);
    }
    console.log("✅ Test 4 Passed: ?sortOrder=asce properly sorted in alphabetical order A-Z");

    // Test 5: ?order=asce alias
    console.log("\n[Test 5] GET /api/v1/authors?search=" + uniqueTag + "&order=asce");
    const res5 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&order=asce`);
    if (res5.status !== 200 || res5.body?.data?.length !== 3) {
      throw new Error(`Test 5 Failed`);
    }
    const names5: string[] = res5.body.data.map((a: any) => a.name);
    console.log("Returned order with ?order=asce:", names5);
    if (
      !names5[0].startsWith("Arthur") ||
      !names5[1].startsWith("brandon") ||
      !names5[2].startsWith("Zara")
    ) {
      throw new Error(`Test 5 Failed: Incorrect alphabetical order: ${names5.join(", ")}`);
    }
    console.log("✅ Test 5 Passed: ?order=asce properly sorted in alphabetical order A-Z");

    // Test 6: ?asce=true flag
    console.log("\n[Test 6] GET /api/v1/authors?search=" + uniqueTag + "&asce=true");
    const res6 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&asce=true`);
    if (res6.status !== 200 || res6.body?.data?.length !== 3) {
      throw new Error(`Test 6 Failed`);
    }
    const names6: string[] = res6.body.data.map((a: any) => a.name);
    console.log("Returned order with ?asce=true:", names6);
    if (
      !names6[0].startsWith("Arthur") ||
      !names6[1].startsWith("brandon") ||
      !names6[2].startsWith("Zara")
    ) {
      throw new Error(`Test 6 Failed: Incorrect alphabetical order: ${names6.join(", ")}`);
    }
    console.log("✅ Test 6 Passed: ?asce=true properly sorted in alphabetical order A-Z");

    // Test 7: ?sort=asce
    console.log("\n[Test 7] GET /api/v1/authors?search=" + uniqueTag + "&sort=asce");
    const res7 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&sort=asce`);
    if (res7.status !== 200 || res7.body?.data?.length !== 3) {
      throw new Error(`Test 7 Failed`);
    }
    const names7: string[] = res7.body.data.map((a: any) => a.name);
    console.log("Returned order with ?sort=asce:", names7);
    if (
      !names7[0].startsWith("Arthur") ||
      !names7[1].startsWith("brandon") ||
      !names7[2].startsWith("Zara")
    ) {
      throw new Error(`Test 7 Failed: Incorrect alphabetical order: ${names7.join(", ")}`);
    }
    console.log("✅ Test 7 Passed: ?sort=asce properly sorted in alphabetical order A-Z");

    // Test 8: ?sortBy=name
    console.log("\n[Test 8] GET /api/v1/authors?search=" + uniqueTag + "&sortBy=name");
    const res8 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&sortBy=name`);
    if (res8.status !== 200 || res8.body?.data?.length !== 3) {
      throw new Error(`Test 8 Failed`);
    }
    const names8: string[] = res8.body.data.map((a: any) => a.name);
    console.log("Returned order with ?sortBy=name:", names8);
    if (
      !names8[0].startsWith("Arthur") ||
      !names8[1].startsWith("brandon") ||
      !names8[2].startsWith("Zara")
    ) {
      throw new Error(`Test 8 Failed: Incorrect alphabetical order: ${names8.join(", ")}`);
    }
    console.log("✅ Test 8 Passed: ?sortBy=name properly sorted in alphabetical order A-Z");

    // Test 9: ?sortBy=name&sortOrder=desc (reverse alphabetical)
    console.log("\n[Test 9] GET /api/v1/authors?search=" + uniqueTag + "&sortBy=name&sortOrder=desc");
    const res9 = await makeRequest(port, `/api/v1/authors?search=${uniqueTag}&sortBy=name&sortOrder=desc`);
    if (res9.status !== 200 || res9.body?.data?.length !== 3) {
      throw new Error(`Test 9 Failed`);
    }
    const names9: string[] = res9.body.data.map((a: any) => a.name);
    console.log("Returned order with ?sortBy=name&sortOrder=desc:", names9);
    if (
      !names9[0].startsWith("Zara") ||
      !names9[1].startsWith("brandon") ||
      !names9[2].startsWith("Arthur")
    ) {
      throw new Error(`Test 9 Failed: Incorrect reverse alphabetical order: ${names9.join(", ")}`);
    }
    console.log("✅ Test 9 Passed: ?sortBy=name&sortOrder=desc properly sorted Z-A");

    console.log("\n=======================================================");
    console.log("   🎉 ALL PAGINATION AND ASCE TESTS PASSED! 🎉");
    console.log("=======================================================\n");
  } finally {
    if (createdAuthorIds.length > 0) {
      await AuthorModel.deleteMany({ _id: { $in: createdAuthorIds } });
      console.log(`Cleaned up ${createdAuthorIds.length} test author records.`);
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

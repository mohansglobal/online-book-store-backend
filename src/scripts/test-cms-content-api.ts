import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import { UserModel, SiteContentModel } from "../models/index.js";
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

const runCmsTests = async () => {
  let server: http.Server | null = null;
  const cleanupUserIds: mongoose.Types.ObjectId[] = [];
  let originalDbContent: any = null;

  try {
    console.log("\n=======================================================");
    console.log("   TEST CMS SITE CONTENT API (HERO & HOMEPAGE TEXTS)");
    console.log("=======================================================");

    logger.info("Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    // Preserve existing content if any
    originalDbContent = await SiteContentModel.findOne({ key: "default" }).lean();

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

    const timestamp = Date.now();

    // 1. Create test users (Rule 33 compliant)
    const adminUser = await UserModel.create({
      name: `test_admin_cms_${timestamp}`,
      email: `test_admin_cms_${timestamp}@example.com`,
      password: "Password123!",
      role: "ADMIN",
      isActive: true,
    });
    cleanupUserIds.push(adminUser._id);

    const buyerUser = await UserModel.create({
      name: `test_buyer_cms_${timestamp}`,
      email: `test_buyer_cms_${timestamp}@example.com`,
      password: "Password123!",
      role: "BUYER",
      isActive: true,
    });
    cleanupUserIds.push(buyerUser._id);

    const adminToken = generateAccessToken({
      sub: adminUser._id.toString(),
      role: "ADMIN",
    });

    const buyerToken = generateAccessToken({
      sub: buyerUser._id.toString(),
      role: "BUYER",
    });

    // Test 1: Public GET /api/v1/contents
    console.log("\n[Test 1] Public GET /api/v1/contents -> Expect 200 with default contents");
    const res1 = await makeRequest(port, "/api/v1/contents", "GET");
    if (res1.status !== 200 || !res1.body?.success || !res1.body?.data?.hero) {
      throw new Error(`Test 1 failed: Expected 200, got ${res1.status}: ${JSON.stringify(res1.body)}`);
    }
    console.log("✅ Test 1 Passed: Public site content retrieved successfully. Default hero rotating words:", res1.body.data.hero.rotatingWords);

    // Test 2: Unauthorized update without token -> Expect 401
    console.log("\n[Test 2] PATCH /api/v1/contents without auth -> Expect 401");
    const res2 = await makeRequest(port, "/api/v1/contents", "PATCH", {
      hero: { headlinePart1: "Hacked" },
    });

    let str = 'already a success'
    if(str.includes('success')){
      console.log('perfect');
    }
    if (res2.status !== 401) {
      throw new Error(`Test 2 failed: Expected 401, got ${res2.status}`);
    }
    console.log("✅ Test 2 Passed: Unauthenticated request rejected with 401");

    // Test 3: Buyer trying to update content -> Expect 403
    console.log("\n[Test 3] PATCH /api/v1/contents with BUYER role -> Expect 403 Forbidden");
    const res3 = await makeRequest(
      port,
      "/api/v1/contents",
      "PATCH",
      { hero: { headlinePart1: "Buyer Edit" } },
      buyerToken,
    );
    if (res3.status !== 403) {
      throw new Error(`Test 3 failed: Expected 403, got ${res3.status}`);
    }
    console.log("✅ Test 3 Passed: Non-admin user forbidden with 403");

    // Test 4: Admin updating Hero highlighted text / rotating words
    console.log("\n[Test 4] Admin PATCH /api/v1/contents/hero to update highlighted rotating words & headline");
    const newHeroData = {
      headlinePart1: "Rare & Antiquarian Books,",
      headlinePart2: "hand-bound for your",
      rotatingWords: ["intellect.", "imagination.", "legacy.", "obsession."],
      description: "Step into our timeless literary archive of curated masterpieces and autographed classics.",
      searchPlaceholder: "Search rare collections...",
    };

    const res4 = await makeRequest(
      port,
      "/api/v1/contents/hero",
      "PATCH",
      newHeroData,
      adminToken,
    );

    if (res4.status !== 200 || !res4.body?.success) {
      throw new Error(`Test 4 failed: Expected 200, got ${res4.status}: ${JSON.stringify(res4.body)}`);
    }

    const updatedHero = res4.body?.data?.hero;
    if (
      updatedHero?.headlinePart1 !== newHeroData.headlinePart1 ||
      updatedHero?.rotatingWords?.length !== 4 ||
      updatedHero?.rotatingWords?.[0] !== "intellect."
    ) {
      throw new Error(`Test 4 failed: Unexpected hero data: ${JSON.stringify(updatedHero)}`);
    }
    console.log("✅ Test 4 Passed: Admin updated hero section successfully with highlighted rotating words:", updatedHero.rotatingWords);

    // Test 5: Verify public GET /api/v1/contents immediately returns updated content for homepage
    console.log("\n[Test 5] Verify public GET /api/v1/contents reflects new homepage hero text");
    const res5 = await makeRequest(port, "/api/v1/contents", "GET");
    if (
      res5.body?.data?.hero?.headlinePart1 !== newHeroData.headlinePart1 ||
      res5.body?.data?.hero?.rotatingWords?.[0] !== "intellect."
    ) {
      throw new Error(`Test 5 failed: Public GET didn't reflect update: ${JSON.stringify(res5.body?.data?.hero)}`);
    }
    console.log("✅ Test 5 Passed: Homepage public endpoint now serves updated texts!");

    // Test 5b: Admin updating Ebooks section with custom quotes and titles
    console.log("\n[Test 5b] Admin PATCH /api/v1/contents/ebooks with array of quotes and titles");
    const customEbooksData = {
      badge: "DIGITAL MASTERPIECES",
      heading: "Read everywhere,",
      headingAccent: "effortlessly.",
      description: "Swipe to browse through hand-picked literary quotes.",
      ctaText: "Read E-Books",
      ctaLink: "/books",
      books: [
        {
          title: "War and Peace",
          quote: "If everyone fought for their own convictions, there would be no war.",
          progress: 35,
        },
        {
          title: "Crime and Punishment",
          quote: "Pain and suffering are always inevitable for a large intelligence and a deep heart.",
          progress: 68,
        },
      ],
    };

    const res5b = await makeRequest(
      port,
      "/api/v1/contents/ebooks",
      "PATCH",
      customEbooksData,
      adminToken,
    );

    if (res5b.status !== 200 || !res5b.body?.success) {
      throw new Error(`Test 5b failed: Expected 200, got ${res5b.status}: ${JSON.stringify(res5b.body)}`);
    }

    const updatedEbooks = res5b.body?.data?.ebooks;
    if (
      updatedEbooks?.badge !== "DIGITAL MASTERPIECES" ||
      updatedEbooks?.books?.length !== 2 ||
      updatedEbooks?.books?.[0]?.title !== "War and Peace"
    ) {
      throw new Error(`Test 5b failed: Unexpected ebooks data: ${JSON.stringify(updatedEbooks)}`);
    }
    console.log("✅ Test 5b Passed: Admin updated ebooks array of quotes and titles successfully!");

    // Test 6: Reset section back to default
    console.log("\n[Test 6] Admin POST /api/v1/contents/reset (section: hero)");
    const res6 = await makeRequest(
      port,
      "/api/v1/contents/reset",
      "POST",
      { section: "hero" },
      adminToken,
    );

    if (res6.status !== 200 || !res6.body?.success) {
      throw new Error(`Test 6 failed: Expected 200, got ${res6.status}`);
    }

    const resetHero = res6.body?.data?.hero;
    if (resetHero?.headlinePart1 !== "The bookshop shelf,") {
      throw new Error(`Test 6 failed: Hero was not reset: ${JSON.stringify(resetHero)}`);
    }
    console.log("✅ Test 6 Passed: Section successfully reset to default");

    // Also reset ebooks
    await makeRequest(port, "/api/v1/contents/reset", "POST", { section: "ebooks" }, adminToken);

    console.log("\n=======================================================");
    console.log("   🎉 ALL CMS CONTENT TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "CMS test suite failed");
    console.error("❌ Test error:", error);
    process.exit(1);
  } finally {
    // Guaranteed cleanup (Rule 33)
    if (cleanupUserIds.length > 0) {
      await UserModel.deleteMany({ _id: { $in: cleanupUserIds } });
    }

    if (originalDbContent) {
      await SiteContentModel.findOneAndUpdate(
        { key: "default" },
        { $set: originalDbContent },
      );
    } else {
      await SiteContentModel.deleteMany({ key: "default" });
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await mongoose.disconnect();
    logger.info("MongoDB disconnected, cleanup complete");
  }
};

void runCmsTests();

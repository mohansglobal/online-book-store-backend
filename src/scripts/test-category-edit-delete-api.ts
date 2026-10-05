import http from "http";
import mongoose from "mongoose";

import app from "../app.js";
import { env } from "../config/env.js";
import { UserModel } from "../models/user.model.js";
import { CategoryModel } from "../models/category.model.js";
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

const makeMultipartRequest = async (
  port: number,
  path: string,
  method = "PATCH",
  fields: Record<string, string>,
  file?: { fieldName: string; filename: string; mimeType: string; content: Buffer },
  token?: string,
) => {
  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
      ),
    );
    chunks.push(file.content);
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const payload = Buffer.concat(chunks);

  const headers: Record<string, string> = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": payload.length.toString(),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
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
    req.write(payload);
    req.end();
  });
};

async function runTest() {
  console.log("=== Testing Category Edit, Image Upload, and Delete APIs (ADMIN ONLY) ===");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB successfully");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  console.log(`Test server running on port ${port}`);

  const testSuffix = Date.now().toString();
  const createdUserIds: mongoose.Types.ObjectId[] = [];
  const createdCategoryIds: mongoose.Types.ObjectId[] = [];

  try {
    // 1. Create test admin and seller users
    const admin = await UserModel.create({
      name: `test_admin_${testSuffix}`,
      email: `test_admin_${testSuffix}@example.com`,
      password: "test_password_12345",
      role: "ADMIN",
      isEmailVerified: true,
      isActive: true,
    });
    createdUserIds.push(admin._id as mongoose.Types.ObjectId);

    const seller = await UserModel.create({
      name: `test_seller_${testSuffix}`,
      email: `test_seller_${testSuffix}@example.com`,
      password: "test_password_12345",
      role: "SELLER",
      isEmailVerified: true,
      isActive: true,
    });
    createdUserIds.push(seller._id as mongoose.Types.ObjectId);

    const adminToken = generateAccessToken({
      sub: admin._id.toString(),
      role: admin.role,
    });

    const sellerToken = generateAccessToken({
      sub: seller._id.toString(),
      role: seller.role,
    });

    // 2. Admin creates a category
    console.log("\n--- Step 1: Admin creates a test category ---");
    const createRes = await makeRequest(
      port,
      "/api/v1/categories",
      "POST",
      {
        name: `test_category_${testSuffix}`,
        nameBn: "বাংলা ক্যাটাগরি",
        description: "Test category description",
        isActive: true,
      },
      adminToken,
    );
    console.log(`Create Category Response status: ${createRes.status}`);
    if (createRes.status !== 201) {
      throw new Error(`Expected 201, got ${createRes.status}: ${JSON.stringify(createRes.body)}`);
    }
    const createdCat = createRes.body.data;
    createdCategoryIds.push(new mongoose.Types.ObjectId(createdCat._id));
    console.log(`Created category: ID=${createdCat._id}, slug=${createdCat.slug}`);

    // 3. Test Unauthorized / Non-Admin edit attempts
    console.log("\n--- Step 2: Unauthenticated edit attempt should fail (401) ---");
    const unauthEditRes = await makeRequest(
      port,
      `/api/v1/categories/${createdCat._id}`,
      "PATCH",
      { name: "Hacked Category" },
    );
    console.log(`Unauthenticated edit status: ${unauthEditRes.status}`);
    if (unauthEditRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated edit, got ${unauthEditRes.status}`);
    }

    console.log("\n--- Step 3: Non-admin (seller) edit attempt should fail (403) ---");
    const sellerEditRes = await makeRequest(
      port,
      `/api/v1/categories/${createdCat._id}`,
      "PATCH",
      { name: "Seller Edited Category" },
      sellerToken,
    );
    console.log(`Seller edit status: ${sellerEditRes.status}`);
    if (sellerEditRes.status !== 403) {
      throw new Error(`Expected 403 for seller edit, got ${sellerEditRes.status}`);
    }

    // 4. Admin edits category via JSON (including image URL)
    console.log("\n--- Step 4: Admin edits category via JSON with image URL ---");
    const testImageUrl = "https://example.com/test-category-image.png";
    const adminEditRes = await makeRequest(
      port,
      `/api/v1/categories/${createdCat._id}`,
      "PATCH",
      {
        name: `test_category_edited_${testSuffix}`,
        description: "Updated description by admin",
        image: testImageUrl,
      },
      adminToken,
    );
    console.log(`Admin edit status: ${adminEditRes.status}`);
    if (adminEditRes.status !== 200) {
      throw new Error(`Expected 200, got ${adminEditRes.status}: ${JSON.stringify(adminEditRes.body)}`);
    }
    console.log(`Updated name: ${adminEditRes.body.data.name}`);
    console.log(`Updated image: ${adminEditRes.body.data.image}`);
    if (adminEditRes.body.data.image !== testImageUrl) {
      throw new Error(`Expected image to match ${testImageUrl}, got ${adminEditRes.body.data.image}`);
    }

    // 5. Admin edits category uploading direct file (multipart/form-data)
    console.log("\n--- Step 5: Admin edits category uploading image file directly (multipart) ---");
    const tinyPngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const multipartRes = await makeMultipartRequest(
      port,
      `/api/v1/categories/${createdCat._id}`,
      "PATCH",
      {
        description: "Updated with direct file upload",
        isActive: "true",
      },
      {
        fieldName: "image",
        filename: "test-category.png",
        mimeType: "image/png",
        content: tinyPngBuffer,
      },
      adminToken,
    );
    console.log(`Admin multipart edit status: ${multipartRes.status}`);
    if (multipartRes.status !== 200) {
      throw new Error(`Expected 200, got ${multipartRes.status}: ${JSON.stringify(multipartRes.body)}`);
    }
    console.log(`Updated category image from upload: ${multipartRes.body.data.image}`);
    if (!multipartRes.body.data.image || !multipartRes.body.data.image.startsWith("http")) {
      throw new Error(`Expected uploaded image URL, got ${multipartRes.body.data.image}`);
    }

    // 6. Non-admin delete attempt should fail (403)
    console.log("\n--- Step 6: Non-admin (seller) delete attempt should fail (403) ---");
    const sellerDeleteRes = await makeRequest(
      port,
      `/api/v1/categories/${createdCat._id}`,
      "DELETE",
      undefined,
      sellerToken,
    );
    console.log(`Seller delete status: ${sellerDeleteRes.status}`);
    if (sellerDeleteRes.status !== 403) {
      throw new Error(`Expected 403 for seller delete, got ${sellerDeleteRes.status}`);
    }

    // 7. Admin deletes category -> sets inactive status
    console.log("\n--- Step 7: Admin deletes category (DELETE means inactive status) ---");
    const adminDeleteRes = await makeRequest(
      port,
      `/api/v1/categories/${createdCat._id}`,
      "DELETE",
      undefined,
      adminToken,
    );
    console.log(`Admin delete status: ${adminDeleteRes.status}`);
    if (adminDeleteRes.status !== 200) {
      throw new Error(`Expected 200, got ${adminDeleteRes.status}: ${JSON.stringify(adminDeleteRes.body)}`);
    }
    console.log(`Category isActive after delete: ${adminDeleteRes.body.data.isActive}`);
    if (adminDeleteRes.body.data.isActive !== false) {
      throw new Error(`Expected isActive to be false after delete, got ${adminDeleteRes.body.data.isActive}`);
    }

    // 8. Verify category is in inactive status in DB
    console.log("\n--- Step 8: Verify DB state ---");
    const dbCategory = await CategoryModel.findById(createdCat._id).lean();
    if (!dbCategory || dbCategory.isActive !== false) {
      throw new Error(`Expected DB category to have isActive: false`);
    }
    console.log(`DB check passed: category ${dbCategory.name} has isActive = ${dbCategory.isActive}`);

    console.log("\n=== ALL TESTS (INCLUDING DIRECT IMAGE UPLOAD) PASSED! ===");
  } finally {
    console.log("\n--- Cleaning up test data ---");
    if (createdCategoryIds.length > 0) {
      const catRes = await CategoryModel.deleteMany({ _id: { $in: createdCategoryIds } });
      console.log(`Deleted ${catRes.deletedCount} test categories`);
    }
    if (createdUserIds.length > 0) {
      const userRes = await UserModel.deleteMany({ _id: { $in: createdUserIds } });
      console.log(`Deleted ${userRes.deletedCount} test users`);
    }
    server.close();
    await mongoose.disconnect();
    console.log("Cleanup finished and database disconnected.");
  }
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

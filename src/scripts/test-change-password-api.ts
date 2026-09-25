import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { UserModel } from "../models/user.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { changePasswordService } from "../services/auth.service.js";
import { changePasswordSchema } from "../validation/auth.schema.js";

async function runChangePasswordTests() {
  console.log("=== Change Password API Verification ===");
  await connectDB();

  // Clean up any existing test user
  const testEmail = "test.changepassword@example.com";
  await UserModel.deleteMany({ email: testEmail });

  const initialPassword = "OldPassword123!";
  const hashedPassword = await bcrypt.hash(initialPassword, 12);

  const testUser = await UserModel.create({
    name: "Password Test User",
    email: testEmail,
    password: hashedPassword,
    mobileNumber: "919988771122",
    role: "BUYER",
    isActive: true,
  });

  const userId = testUser._id.toString();

  // Create dummy refresh token for this user to test revocation
  await RefreshTokenModel.create({
    user: testUser._id,
    token: "dummy_refresh_token_for_test",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  console.log("1. Testing Zod Validation Schema...");
  const invalidSchemaResult = changePasswordSchema.safeParse({
    currentPassword: "",
    newPassword: "short",
  });
  if (invalidSchemaResult.success) {
    throw new Error("Schema should have failed for short new password and empty current password");
  }
  console.log("✅ Schema correctly rejected invalid inputs.");

  console.log("\n2. Testing incorrect current password rejection...");
  try {
    await changePasswordService({
      userId,
      currentPassword: "WrongPassword999!",
      newPassword: "BrandNewPassword123!",
    });
    throw new Error("Should have thrown error for wrong current password");
  } catch (err: any) {
    if (err.message !== "Current password is incorrect") {
      throw err;
    }
    console.log("✅ Correctly rejected with:", err.message);
  }

  console.log("\n3. Testing same password rejection...");
  try {
    await changePasswordService({
      userId,
      currentPassword: initialPassword,
      newPassword: initialPassword,
    });
    throw new Error("Should have thrown error for identical new password");
  } catch (err: any) {
    if (err.message !== "New password cannot be the same as current password") {
      throw err;
    }
    console.log("✅ Correctly rejected with:", err.message);
  }

  console.log("\n4. Testing successful password change...");
  const updatedPassword = "BrandNewPassword123!";
  const result = await changePasswordService({
    userId,
    currentPassword: initialPassword,
    newPassword: updatedPassword,
  });
  console.log("✅ Service returned:", result);

  if (result.message !== "Password updated successfully") {
    throw new Error("Expected success message 'Password updated successfully'");
  }

  console.log("\n5. Verifying database state...");
  const userInDb = await UserModel.findById(userId).select("+password");
  if (!userInDb) {
    throw new Error("User not found in DB");
  }

  const oldMatches = await bcrypt.compare(initialPassword, userInDb.password);
  const newMatches = await bcrypt.compare(updatedPassword, userInDb.password);

  if (oldMatches) {
    throw new Error("Old password still matches hash in database!");
  }
  if (!newMatches) {
    throw new Error("New password does not match hash in database!");
  }
  console.log("✅ Verified: Database stores new password hash.");

  console.log("\n6. Verifying active refresh token revocation...");
  const remainingTokens = await RefreshTokenModel.countDocuments({ user: testUser._id });
  if (remainingTokens !== 0) {
    throw new Error(`Expected 0 refresh tokens remaining, found ${remainingTokens}`);
  }
  console.log("✅ Verified: Previous refresh tokens revoked across devices.");

  // Clean up
  await UserModel.findByIdAndDelete(testUser._id);
  console.log("\n=== All Change Password API tests PASSED successfully! ===");
  await mongoose.connection.close();
}

runChangePasswordTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

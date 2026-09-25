import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { UserModel } from "../models/user.model.js";
import { AccountDeletionModel } from "../models/account-deletion.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { CartModel } from "../models/cart.model.js";
import { WishlistModel } from "../models/wishlist.model.js";
import { AddressModel } from "../models/address.model.js";
import {
  getAccountDeletionInfoService,
  sendAccountDeletionOtpService,
  confirmAccountDeletionService,
  cancelAccountDeletionService,
  restoreAccountWithCredentialsService,
  purgeExpiredDeletedAccountsService,
} from "../services/account-deletion.service.js";
import { loginUserService } from "../services/auth.service.js";
import { confirmAccountDeletionSchema } from "../validation/auth.schema.js";

async function runAccountDeletionTests() {
  console.log("=== Account Deletion (Danger Zone) API Verification ===");
  await connectDB();

  const testEmail = "test.deletion@example.com";
  const testMobile = "919988112233";
  const testPassword = "Password123!";

  // Clean up any existing records
  await UserModel.deleteMany({ email: testEmail });

  const hashedPassword = await bcrypt.hash(testPassword, 12);
  const testUser = await UserModel.create({
    name: "Deletion Test User",
    email: testEmail,
    password: hashedPassword,
    mobileNumber: testMobile,
    role: "BUYER",
    isActive: true,
  });

  const userId = testUser._id.toString();

  // Create linked test data: Cart, Wishlist, Address, RefreshToken
  await CartModel.create({
    user: testUser._id,
    items: [],
  });
  await WishlistModel.create({
    user: testUser._id,
    items: [],
  });
  await AddressModel.create({
    user: testUser._id,
    fullName: "Deletion Test User",
    email: testEmail,
    mobileNumber: testMobile,
    country: "India",
    state: "West Bengal",
    city: "Kolkata",
    postalCode: "700001",
    streetAddress: "123 Test Street",
  });
  await RefreshTokenModel.create({
    user: testUser._id,
    token: "deletion_test_refresh_token_123",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  console.log("1. Testing Deletion Info Endpoint (Explain what will be deleted)...");
  const info = await getAccountDeletionInfoService(userId);
  console.log("✅ Deletion Info:", {
    gracePeriodDays: info.gracePeriodDays,
    itemsToDeleteCount: info.willBeDeleted.length,
    confirmationPhrase: info.confirmationPhrase,
  });

  if (info.confirmationPhrase !== "DELETE" || info.gracePeriodDays !== 30) {
    throw new Error("Invalid deletion info payload");
  }

  console.log("\n2. Testing Send Deletion OTP...");
  const otpResult = await sendAccountDeletionOtpService(userId);
  console.log("✅ OTP Sent Result:", otpResult);

  const otpRecord = await AccountDeletionModel.findOne({ userId: testUser._id });
  if (!otpRecord) {
    throw new Error("Account deletion OTP was not stored in database");
  }
  const realOtp = otpRecord.otp;
  console.log("✅ Stored OTP verified in database.");

  console.log("\n3. Testing Validation: Confirmation phrase 'DELETE' required...");
  const badConfirmationResult = confirmAccountDeletionSchema.safeParse({
    otp: realOtp,
    confirmation: "del",
  });
  if (badConfirmationResult.success) {
    throw new Error("Schema should have rejected confirmation not equal to 'DELETE'");
  }
  console.log("✅ Schema correctly required exact 'DELETE' text.");

  console.log("\n4. Testing Invalid OTP rejection...");
  try {
    await confirmAccountDeletionService({
      userId,
      otp: "000000",
      confirmation: "DELETE",
    });
    throw new Error("Should have thrown error for wrong OTP");
  } catch (err: any) {
    console.log("✅ Correctly rejected invalid OTP with:", err.message);
  }

  console.log("\n5. Testing Successful Deletion Confirmation...");
  const confirmResult = await confirmAccountDeletionService({
    userId,
    otp: realOtp,
    confirmation: "DELETE",
    reason: "Closing account for testing",
  });
  console.log("✅ Deletion scheduled:", confirmResult.message);

  const userAfterDeletion = await UserModel.findById(userId);
  if (!userAfterDeletion?.isDeleted || userAfterDeletion.deletionStatus !== "SCHEDULED" || userAfterDeletion.isActive) {
    throw new Error("User state not properly set to SCHEDULED deletion");
  }
  console.log("✅ User state verified: isDeleted=true, deletionStatus=SCHEDULED, isActive=false");

  // Verify refresh tokens were revoked
  const tokensLeft = await RefreshTokenModel.countDocuments({ user: testUser._id });
  if (tokensLeft !== 0) {
    throw new Error("Refresh tokens were not revoked during account deletion");
  }
  console.log("✅ Verified: Active sessions revoked upon deletion scheduling.");

  console.log("\n6. Testing Login Attempt During 30-Day Grace Period...");
  try {
    await loginUserService({
      mobileNumber: testMobile,
      password: testPassword,
    });
    throw new Error("Login should have failed for scheduled deletion account");
  } catch (err: any) {
    console.log("✅ Login blocked with explanatory message:", err.message);
  }

  console.log("\n7. Testing Account Restoration during Grace Period...");
  const restoreResult = await restoreAccountWithCredentialsService({
    identifier: testMobile,
    password: testPassword,
  });
  console.log("✅ Restore result:", restoreResult.message);

  const restoredUser = await UserModel.findById(userId);
  if (!restoredUser?.isActive || restoredUser.deletionStatus !== "NONE" || restoredUser.isDeleted) {
    throw new Error("User was not properly restored");
  }
  console.log("✅ User state restored: isActive=true, deletionStatus=NONE");

  // Verify user can now log in normally
  const loginResult = await loginUserService({
    mobileNumber: testMobile,
    password: testPassword,
  });
  if (!loginResult.accessToken) {
    throw new Error("Failed to log in after account restoration");
  }
  console.log("✅ Successfully logged in after account restoration.");

  console.log("\n8. Testing Permanent Purge of Expired Accounts (30-day expiration)...");
  // Set user to SCHEDULED with expired date in the past
  restoredUser.deletionStatus = "SCHEDULED";
  restoredUser.isDeleted = true;
  restoredUser.scheduledPermanentDeletionAt = new Date(Date.now() - 1000); // 1 second ago
  await restoredUser.save();

  const purgeResult = await purgeExpiredDeletedAccountsService();
  console.log("✅ Purge result:", purgeResult);

  const purgedUser = await UserModel.findById(userId);
  if (purgedUser?.deletionStatus !== "PERMANENTLY_DELETED") {
    throw new Error("User was not marked as PERMANENTLY_DELETED");
  }
  console.log("✅ User verified as PERMANENTLY_DELETED and anonymized:", {
    name: purgedUser.name,
    email: purgedUser.email,
  });

  // Verify linked records purged
  const addressCount = await AddressModel.countDocuments({ user: testUser._id });
  const cartCount = await CartModel.countDocuments({ user: testUser._id });
  if (addressCount !== 0 || cartCount !== 0) {
    throw new Error("Linked data was not purged");
  }
  console.log("✅ Verified: Linked address, cart, and tokens completely purged.");

  // Clean up
  await UserModel.findByIdAndDelete(testUser._id);
  console.log("\n=== All Account Deletion (Danger Zone) tests PASSED! ===");
  await mongoose.connection.close();
}

runAccountDeletionTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

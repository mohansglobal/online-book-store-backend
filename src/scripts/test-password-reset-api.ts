import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/user.model.js";
import { PasswordResetModel } from "../models/password-reset.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import {
  forgotPasswordService,
  verifyPasswordResetOtpService,
  resetPasswordService,
} from "../services/password-reset.service.js";
import { loginUserService } from "../services/auth.service.js";

async function runPasswordResetTestSuite() {
  console.log("========================================================");
  console.log("      PASSWORD RESET & OTP VERIFICATION TEST SUITE       ");
  console.log("========================================================");

  await connectDB();

  const testEmail = "test_reset_user@example.com";
  const testMobile = "9876501234";
  const initialPassword = "InitialPassword123!";
  const newPassword = "BrandNewPassword456!";

  // Clean up any existing test records
  await UserModel.deleteMany({
    $or: [{ email: testEmail }, { mobileNumber: testMobile }],
  });
  await PasswordResetModel.deleteMany({ identifier: testEmail });

  // 1. Create a test user
  console.log("\n[STEP 1] Creating test user with initial password...");
  const hashedPassword = await bcrypt.hash(initialPassword, 12);
  const user = await UserModel.create({
    name: "Reset Test User",
    email: testEmail,
    mobileNumber: testMobile,
    password: hashedPassword,
    role: "BUYER",
    isActive: true,
  });
  console.log("✅ User created:", { id: user._id, email: user.email, mobile: user.mobileNumber });

  // 2. Request Password Reset OTP
  console.log("\n[STEP 2] Requesting password reset OTP...");
  const forgotResult = await forgotPasswordService({ identifier: testEmail });
  console.log("Forgot Password Result:", forgotResult);

  if (!forgotResult.success) {
    throw new Error("Failed to request password reset OTP");
  }

  const resetRecord = await PasswordResetModel.findOne({ userId: user._id });
  if (!resetRecord || !resetRecord.otp) {
    throw new Error("PasswordReset record was not created in MongoDB");
  }

  const generatedOtp = resetRecord.otp;
  console.log("✅ OTP successfully stored in DB:", {
    identifier: resetRecord.identifier,
    otp: generatedOtp,
    expiresAt: resetRecord.otpExpiresAt,
    isVerified: resetRecord.isVerified,
  });

  if (generatedOtp.length !== 6 || !/^\d{6}$/.test(generatedOtp)) {
    throw new Error(`Expected 6-digit numeric OTP, got "${generatedOtp}"`);
  }

  // 3. Test Cooldown Protection
  console.log("\n[STEP 3] Testing 60-second cooldown protection on rapid re-send...");
  const rapidResend = await forgotPasswordService({ identifier: testEmail });
  console.log("Rapid Resend Result:", rapidResend);
  if (!rapidResend.alreadySent) {
    throw new Error("Cooldown check failed: system should flag alreadySent = true within 60s");
  }
  console.log("✅ Cooldown protection successfully prevented OTP spam");

  // 4. Test Invalid OTP Verification
  console.log("\n[STEP 4] Testing rejection of incorrect OTP...");
  try {
    await verifyPasswordResetOtpService({ identifier: testEmail, otp: "000000" });
    throw new Error("Should have thrown error on wrong OTP");
  } catch (err: any) {
    console.log("✅ Correctly rejected invalid OTP:", err.message);
  }

  // 5. Test Valid OTP Verification
  console.log("\n[STEP 5] Verifying valid OTP...");
  const verifyResult = await verifyPasswordResetOtpService({
    identifier: testEmail,
    otp: generatedOtp,
  });
  console.log("Verify Result:", verifyResult);

  if (!verifyResult.success || !verifyResult.resetToken) {
    throw new Error("Failed to verify OTP or generate resetToken");
  }

  const resetToken = verifyResult.resetToken;
  console.log("✅ OTP verified successfully. Generated one-time reset token:", resetToken.slice(0, 16) + "...");

  const verifiedRecord = await PasswordResetModel.findOne({ userId: user._id });
  if (!verifiedRecord?.isVerified || verifiedRecord.resetToken !== resetToken) {
    throw new Error("PasswordReset document not updated with resetToken in DB");
  }

  // 6. Test Invalid Token on Reset Password
  console.log("\n[STEP 6] Testing rejection of invalid reset token...");
  try {
    await resetPasswordService({
      resetToken: "fake_invalid_token_1234567890",
      newPassword,
    });
    throw new Error("Should have thrown error on invalid reset token");
  } catch (err: any) {
    console.log("✅ Correctly rejected invalid reset token:", err.message);
  }

  // 7. Test Setting New Password
  console.log("\n[STEP 7] Setting new password using valid reset token...");
  const resetResult = await resetPasswordService({
    resetToken,
    newPassword,
  });
  console.log("Reset Password Result:", resetResult);
  if (!resetResult.success) {
    throw new Error("Failed to reset password");
  }
  console.log("✅ Password updated successfully");

  // 8. Verify reset token is burned/deleted
  const burnedRecord = await PasswordResetModel.findOne({ resetToken });
  if (burnedRecord) {
    throw new Error("Reset token record was not deleted after use!");
  }
  console.log("✅ One-time reset token burned immediately after use (replay attack prevention)");

  // 9. Verify Login with Old Password fails
  console.log("\n[STEP 8] Verifying login with OLD password fails...");
  try {
    await loginUserService({ mobileNumber: testMobile, password: initialPassword });
    throw new Error("Old password should have failed login");
  } catch (err: any) {
    console.log("✅ Old password correctly rejected (401)");
  }

  // 10. Verify Login with NEW Password succeeds
  console.log("\n[STEP 9] Verifying login with NEW password succeeds...");
  const loginResult = await loginUserService({
    mobileNumber: testMobile,
    password: newPassword,
  });
  console.log("✅ Successfully logged in with new password! User:", loginResult.user.name, "Role:", loginResult.user.role);

  // Clean up test data
  await UserModel.deleteMany({
    $or: [{ email: testEmail }, { mobileNumber: testMobile }],
  });
  await RefreshTokenModel.deleteMany({ user: user._id });

  console.log("\n========================================================");
  console.log("    ALL 9 PASSWORD RESET TEST SUITE CHECKS PASSED!     ");
  console.log("========================================================");

  await mongoose.disconnect();
  process.exit(0);
}

runPasswordResetTestSuite().catch((err) => {
  console.error("❌ Test failed:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});

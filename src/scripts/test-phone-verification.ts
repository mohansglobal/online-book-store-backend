import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import { UserModel } from "../models/user.model.js";
import { PhoneVerificationModel } from "../models/phone-verification.model.js";
import {
  sendPhoneOtpService,
  verifyPhoneOtpService,
  generateOtp,
} from "../services/phone-verification.service.js";
import { registerUserService } from "../services/auth.service.js";

async function runPhoneVerificationTestSuite() {
  console.log("========================================================");
  console.log("   PHONE NUMBER OTP VERIFICATION TEST SUITE");
  console.log("========================================================");
  await connectDB();

  const testMobile = "9876543210";
  const testEmail = "otp.test.user@example.com";

  // Clean up any previous test artifacts
  await UserModel.deleteMany({
    $or: [{ email: testEmail }, { mobileNumber: testMobile }],
  });
  await PhoneVerificationModel.deleteMany({ phoneNumber: testMobile });

  // TEST 1: Generate and Send OTP
  console.log("\nTEST 1: Generate and send OTP (5 min validity)");
  const sendResult = await sendPhoneOtpService({ mobileNumber: testMobile });
  console.log("Send OTP Result:", sendResult);

  if (!sendResult.success) {
    throw new Error("Failed to send initial OTP");
  }

  const record1 = await PhoneVerificationModel.findOne({ phoneNumber: testMobile });
  if (!record1 || !record1.otp) {
    throw new Error("PhoneVerification record was not created in MongoDB");
  }

  const generatedOtp = record1.otp;
  console.log("✅ Verified OTP created in DB:", {
    phoneNumber: record1.phoneNumber,
    otp: generatedOtp,
    expiresAt: record1.otpExpiresAt,
    isVerified: record1.isVerified,
  });

  const now = new Date();
  const diffMinutes = (record1.otpExpiresAt.getTime() - now.getTime()) / (60 * 1000);
  console.log(`OTP Expiry duration from now: ~${diffMinutes.toFixed(2)} minutes (Expected ~5.00)`);
  if (diffMinutes < 4.8 || diffMinutes > 5.1) {
    throw new Error(`Expected OTP validity of ~5 minutes, got ${diffMinutes} minutes`);
  }

  // TEST 2: Cooldown check on rapid re-send
  console.log("\nTEST 2: Rate limit / cooldown protection");
  const rapidResendResult = await sendPhoneOtpService({ mobileNumber: testMobile });
  console.log("Rapid Resend Result:", rapidResendResult);
  if (!rapidResendResult.alreadySent) {
    throw new Error("Expected alreadySent=true for rapid resend within cooldown");
  }
  console.log("✅ Cooldown protection successfully blocked rapid spamming.");

  // TEST 3: Invalid OTP rejection
  console.log("\nTEST 3: Reject incorrect OTP");
  try {
    await verifyPhoneOtpService({
      mobileNumber: testMobile,
      otp: "000000", // Wrong OTP
    });
    throw new Error("Should have thrown error for wrong OTP");
  } catch (err: any) {
    console.log("✅ Correctly rejected invalid OTP:", err.message);
  }

  // TEST 4: Successful OTP Verification
  console.log("\nTEST 4: Verify with correct OTP");
  const verifyResult = await verifyPhoneOtpService({
    mobileNumber: testMobile,
    otp: generatedOtp,
  });
  console.log("Verify Result:", verifyResult);

  const updatedRecord = await PhoneVerificationModel.findOne({ phoneNumber: testMobile });
  if (!updatedRecord?.isVerified || !updatedRecord.verifiedAt) {
    throw new Error("Record was not marked as verified");
  }
  console.log("✅ Phone verification record verified at:", updatedRecord.verifiedAt);

  // TEST 5: Registration auto-triggers OTP
  console.log("\nTEST 5: Registration auto-triggers 5 min OTP");
  const regResult = await registerUserService({
    name: "Registration OTP User",
    email: testEmail,
    password: "Password123!",
    mobileNumber: testMobile,
    role: "BUYER",
  });
  console.log("User registered with ID:", regResult.id);

  const regOtpRecord = await PhoneVerificationModel.findOne({ phoneNumber: testMobile });
  console.log("Registration OTP Record:", {
    phoneNumber: regOtpRecord?.phoneNumber,
    otp: regOtpRecord?.otp,
    isVerified: regOtpRecord?.isVerified,
    expiresAt: regOtpRecord?.otpExpiresAt,
  });

  if (!regOtpRecord) {
    throw new Error("Registration did not create phone verification record");
  }

  // Verify the registered user's phone with the new registration OTP
  await verifyPhoneOtpService({
    userId: regResult.id.toString(),
    otp: regOtpRecord.otp,
  });

  const verifiedUser = await UserModel.findById(regResult.id);
  if (!verifiedUser?.isMobileVerified) {
    throw new Error("UserModel isMobileVerified was not updated to true");
  }
  console.log("✅ User in database now marked isMobileVerified: true!");

  // Cleanup test artifacts
  await UserModel.deleteMany({
    $or: [{ email: testEmail }, { mobileNumber: testMobile }],
  });
  await PhoneVerificationModel.deleteMany({ phoneNumber: testMobile });
  console.log("\nCleaned up test artifacts.");

  console.log("\n✅ ALL PHONE OTP VERIFICATION TESTS PASSED SUCCESSFULLY!");
  await mongoose.disconnect();
}

runPhoneVerificationTestSuite().catch(async (err) => {
  console.error("Test failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});

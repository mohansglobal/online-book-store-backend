import crypto from "crypto";
import { PhoneVerificationModel } from "../models/phone-verification.model.js";
import { UserModel } from "../models/user.model.js";
import { sendOtpSms, formatMobileNumber } from "./sms.service.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";

const OTP_VALIDITY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_MS = 5*60 * 1000; // 1 minute cooldown


//Generates a crypto-secure 6-digit numeric OTP string.
 
export const generateOtp = (length = 6): string => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max + 1).toString();
};

export interface SendOtpParams {
  userId?: string;
  mobileNumber?: string;
}

export interface VerifyOtpParams {
  userId?: string;
  mobileNumber?: string;
  otp: string;
}

/**
 * Sends OTP to a phone number (with 5 min expiry and 60s cooldown).
 */
export const sendPhoneOtpService = async ({
  userId,
  mobileNumber,
}: SendOtpParams) => {
  let targetMobile = mobileNumber?.trim();

  // If userId is provided, resolve mobileNumber from UserModel if not given
  if (userId) {
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
    }
    if (!targetMobile) {
      targetMobile = user.mobileNumber || undefined;
    }
  }

  if (!targetMobile) {
    throw new AppError("Mobile number is required to send OTP", HTTP_STATUS.BAD_REQUEST);
  }

  const now = new Date();

  // Check if a valid unexpired OTP was already generated recently
  let phoneVerification = await PhoneVerificationModel.findOne({
    $or: [
      { phoneNumber: targetMobile },
      ...(userId ? [{ userId }] : []),
    ],
  });

  if (phoneVerification && phoneVerification.otpExpiresAt > now && !phoneVerification.isVerified) {
    const timeSinceCreated = now.getTime() - new Date(phoneVerification.updatedAt || now).getTime();
    if (timeSinceCreated < OTP_RESEND_COOLDOWN_MS) {
      if (userId && !phoneVerification.userId) {
        phoneVerification.userId = userId as any;
        await phoneVerification.save();
      }
      return {
        success: true,
        alreadySent: true,
        message: "OTP already sent and still valid. Please wait before requesting again.",
      };
    }
  }

  const otp = generateOtp(6);
  const otpExpiresAt = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000);

  if (phoneVerification) {
    phoneVerification.otp = otp;
    phoneVerification.phoneNumber = targetMobile;
    phoneVerification.otpExpiresAt = otpExpiresAt;
    phoneVerification.isVerified = false;
    phoneVerification.verifiedAt = undefined;
    if (userId) phoneVerification.userId = userId as any;
    await phoneVerification.save();
  } else {
    phoneVerification = await PhoneVerificationModel.create({
      userId: userId || undefined,
      phoneNumber: targetMobile,
      otp,
      otpExpiresAt,
      isVerified: false,
    });
  }

  // Dispatch SMS via SMS gateway
  await sendOtpSms(targetMobile, otp, { validityMinutes: OTP_VALIDITY_MINUTES });

  logger.info({ mobile: formatMobileNumber(targetMobile), userId }, "Phone verification OTP generated and dispatched");

  return {
    success: true,
    message: "OTP sent successfully",
  };
};

/**
 * Verifies submitted OTP against PhoneNumberVerify record and updates User verification status.
 */
export const verifyPhoneOtpService = async ({
  userId,
  mobileNumber,
  otp,
}: VerifyOtpParams) => {
  const trimmedOtp = otp.trim();
  let targetMobile = mobileNumber?.trim();

  if (userId && !targetMobile) {
    const user = await UserModel.findById(userId).lean();
    if (user?.mobileNumber) {
      targetMobile = user.mobileNumber;
    }
  }

  if (!trimmedOtp) {
    throw new AppError("OTP is required", HTTP_STATUS.BAD_REQUEST);
  }

  const query: any = {};
  if (userId && targetMobile) {
    query.$or = [{ userId }, { phoneNumber: targetMobile }];
  } else if (userId) {
    query.userId = userId;
  } else if (targetMobile) {
    query.phoneNumber = targetMobile;
  } else {
    throw new AppError("Mobile number or user context is required", HTTP_STATUS.BAD_REQUEST);
  }

  const phoneVerification = await PhoneVerificationModel.findOne(query).sort({ updatedAt: -1 });

  if (!phoneVerification) {
    throw new AppError("No OTP request found for this phone number", HTTP_STATUS.NOT_FOUND);
  }

  const now = new Date();
  if (phoneVerification.otpExpiresAt < now) {
    throw new AppError("OTP has expired. Please request a new OTP.", HTTP_STATUS.BAD_REQUEST);
  }

  if (phoneVerification.otp !== trimmedOtp) {
    throw new AppError("Invalid OTP entered. Please check and try again.", HTTP_STATUS.BAD_REQUEST);
  }

  // Mark as verified
  phoneVerification.isVerified = true;
  phoneVerification.verifiedAt = now;
  await phoneVerification.save();

  // Update matching user record if found
  const userFilter = userId ? { _id: userId } : { mobileNumber: phoneVerification.phoneNumber };
  await UserModel.updateOne(userFilter, {
    $set: { isMobileVerified: true },
  });

  logger.info(
    { mobile: phoneVerification.phoneNumber, userId },
    "Phone number successfully verified",
  );

  return {
    success: true,
    message: "Phone number verified successfully",
  };
};

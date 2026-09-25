import crypto from "crypto";
import bcrypt from "bcryptjs";

import { UserModel } from "../models/user.model.js";
import { PasswordResetModel } from "../models/password-reset.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import { dispatchPasswordResetOtpJob } from "../queues/email.queue.js";
import { sendOtpEmail } from "./email.service.js";
import { sendOtpSms, formatMobileNumber } from "./sms.service.js";
import type {
  ForgotPasswordInput,
  VerifyPasswordResetOtpInput,
  ResetPasswordInput,
} from "../validation/auth.schema.js";

const OTP_VALIDITY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_TOKEN_VALIDITY_MINUTES = 15;
const BCRYPT_SALT_ROUNDS = 12;

const maskIdentifier = (identifier: string): string => {
  if (identifier.includes("@")) {
    const [localPart, domain] = identifier.split("@");
    if (!localPart || !domain) {
      return identifier;
    }
    if (localPart.length <= 2) {
      return `${localPart[0]}*@${domain}`;
    }
    const firstChar = localPart[0];
    const lastChar = localPart[localPart.length - 1];
    return `${firstChar}***${lastChar}@${domain}`;
  }

  const digits = identifier.replace(/\D/g, "");
  if (digits.length <= 4) {
    return identifier;
  }
  const lastFour = digits.slice(-4);
  return `******${lastFour}`;
};

export const forgotPasswordService = async (input: ForgotPasswordInput) => {
  const rawIdentifier = input.identifier.trim();
  const isEmail = rawIdentifier.includes("@");

  let user = null;

  if (isEmail) {
    const normalizedEmail = rawIdentifier.toLowerCase();
    user = await UserModel.findOne({ email: normalizedEmail }).lean();
  } else {
    const formattedMobile = formatMobileNumber(rawIdentifier);
    user = await UserModel.findOne({
      $or: [
        { mobileNumber: rawIdentifier },
        { mobileNumber: formattedMobile },
        { mobileNumber: `+${formattedMobile}` },
      ],
    }).lean();
  }

  if (!user) {
    throw new AppError(
      "No account found with this email or mobile number",
      HTTP_STATUS.NOT_FOUND,
    );
  }

  if (!user.isActive) {
    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  const userId = user._id.toString();
  const normalizedIdentifier = isEmail
    ? user.email.toLowerCase()
    : user.mobileNumber || rawIdentifier;

  const now = new Date();

  // Check cooldown on existing active reset request
  const existingReset = await PasswordResetModel.findOne({
    userId: user._id,
  });

  if (existingReset && existingReset.otpExpiresAt > now && !existingReset.isVerified) {
    const lastUpdatedTime = new Date(existingReset.updatedAt || now).getTime();
    const timeSinceLastOtp = now.getTime() - lastUpdatedTime;

    if (timeSinceLastOtp < OTP_RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil(
        (existingReset.otpExpiresAt.getTime() - now.getTime()) / 1000,
      );

      return {
        success: true,
        alreadySent: true,
        message: "OTP was already sent and is still valid. Please check your inbox or phone.",
        identifier: maskIdentifier(normalizedIdentifier),
        expiresInSeconds: remainingSeconds,
      };
    }
  }

  // Generate 6-digit numeric OTP
  const min = 100000;
  const max = 999999;
  const otp = crypto.randomInt(min, max + 1).toString();
  const otpExpiresAt = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000);

  if (existingReset) {
    existingReset.identifier = normalizedIdentifier;
    existingReset.otp = otp;
    existingReset.otpExpiresAt = otpExpiresAt;
    existingReset.isVerified = false;
    existingReset.resetToken = undefined;
    existingReset.resetTokenExpiresAt = undefined;
    await existingReset.save();
  } else {
    await PasswordResetModel.create({
      userId: user._id,
      identifier: normalizedIdentifier,
      otp,
      otpExpiresAt,
      isVerified: false,
    });
  }

  // Dispatch OTP: via Email if user has email
  if (user.email) {
    try {
      await dispatchPasswordResetOtpJob({
        toEmail: user.email,
        name: user.name,
        otp,
        validityMinutes: OTP_VALIDITY_MINUTES,
      });
    } catch (queueErr) {
      logger.warn(
        { err: queueErr, email: user.email },
        "Queue dispatch failed for password reset OTP, attempting direct email send",
      );

      try {
        await sendOtpEmail(
          {
            toEmail: user.email,
            name: user.name,
            otp,
            validityMinutes: OTP_VALIDITY_MINUTES,
          },
          "PASSWORD_RESET",
        );
      } catch (emailErr) {
        logger.error(
          { err: emailErr, email: user.email },
          "Direct email send failed for password reset OTP",
        );
      }
    }
  }

  // Dispatch OTP via SMS if mobile number exists and user requested by mobile
  if (!isEmail && user.mobileNumber) {
    try {
      await sendOtpSms(user.mobileNumber, otp, {
        validityMinutes: OTP_VALIDITY_MINUTES,
      });
    } catch (smsErr) {
      logger.warn(
        { err: smsErr, mobile: user.mobileNumber },
        "Failed to send password reset OTP via SMS",
      );
    }
  }

  logger.info(
    { userId, identifier: maskIdentifier(normalizedIdentifier) },
    "Password reset OTP generated and dispatched successfully",
  );

  return {
    success: true,
    message: "Password reset OTP sent successfully",
    identifier: maskIdentifier(normalizedIdentifier),
    expiresInSeconds: OTP_VALIDITY_MINUTES * 60,
  };
};

export const verifyPasswordResetOtpService = async (
  input: VerifyPasswordResetOtpInput,
) => {
  const rawIdentifier = input.identifier.trim();
  const trimmedOtp = input.otp.trim();
  const isEmail = rawIdentifier.includes("@");
  
  let user = null;
  
  if (isEmail) {
    const normalizedEmail = rawIdentifier.toLowerCase();
    user = await UserModel.findOne({ email: normalizedEmail }).lean();
  } else {
    const formattedMobile = formatMobileNumber(rawIdentifier);
    user = await UserModel.findOne({
      $or: [
        { mobileNumber: rawIdentifier },
        { mobileNumber: formattedMobile },
        { mobileNumber: `+${formattedMobile}` },
      ],
    }).lean();
  }

  if (!user) {
    throw new AppError(
      "No account found with this email or mobile number",
      HTTP_STATUS.NOT_FOUND,
    );
  }

  const resetRecord = await PasswordResetModel.findOne({
    userId: user._id,
  });

  if (!resetRecord) {
    throw new AppError(
      "No password reset request found. Please request a new OTP.",
      HTTP_STATUS.NOT_FOUND,
    );
  }

  const now = new Date();
  const hasExpired = resetRecord.otpExpiresAt < now;

  if (hasExpired) {
    throw new AppError(
      "OTP has expired. Please request a new OTP.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const isOtpMatch = resetRecord.otp === trimmedOtp;

  if (!isOtpMatch) {
    throw new AppError(
      "Invalid OTP entered. Please check and try again.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // Generate cryptographically secure one-time reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiresAt = new Date(
    Date.now() + RESET_TOKEN_VALIDITY_MINUTES * 60 * 1000,
  );

  resetRecord.isVerified = true;
  resetRecord.resetToken = resetToken;
  resetRecord.resetTokenExpiresAt = resetTokenExpiresAt;
  await resetRecord.save();

  logger.info(
    { userId: user._id },
    "Password reset OTP verified; one-time reset token issued",
  );

  return {
    success: true,
    message: "OTP verified successfully. You may now set a new password.",
    resetToken,
  };
};

export const resetPasswordService = async (input: ResetPasswordInput) => {
  const token = input.resetToken.trim();
  const newPassword = input.newPassword;

  const resetRecord = await PasswordResetModel.findOne({
    resetToken: token,
  });

  if (!resetRecord) {
    throw new AppError(
      "Invalid or expired password reset session. Please request a new OTP.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const isVerified = resetRecord.isVerified;

  if (!isVerified) {
    throw new AppError(
      "OTP has not been verified yet",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const now = new Date();
  const hasExpired =
    !resetRecord.resetTokenExpiresAt || resetRecord.resetTokenExpiresAt < now;

  if (hasExpired) {
    throw new AppError(
      "Password reset session has expired. Please request a new OTP.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const user = await UserModel.findById(resetRecord.userId);

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!user.isActive) {
    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  user.password = hashedPassword;
  await user.save();

  // Invalidate all active refresh tokens so existing sessions across devices are logged out
  await RefreshTokenModel.deleteMany({ user: user._id });

  // Burn the reset record so it cannot be used again
  await PasswordResetModel.deleteOne({ _id: resetRecord._id });

  logger.info(
    { userId: user._id },
    "User password reset successfully; all active sessions revoked",
  );

  return {
    success: true,
    message: "Password reset successfully. Please log in with your new password.",
  };
};

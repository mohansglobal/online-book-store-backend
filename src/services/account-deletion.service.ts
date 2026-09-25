import crypto from "crypto";
import bcrypt from "bcryptjs";

import { UserModel } from "../models/user.model.js";
import { AccountDeletionModel } from "../models/account-deletion.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { AddressModel } from "../models/address.model.js";
import { CartModel } from "../models/cart.model.js";
import { WishlistModel } from "../models/wishlist.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import { sendOtpSms, formatMobileNumber } from "./sms.service.js";
import { sendEmail } from "./email.service.js";
import {
  deleteFromCloudinary,
  extractPublicIdFromUrl,
} from "./cloudinary.service.js";
import type {
  ConfirmAccountDeletionInput,
  RestoreAccountInput,
} from "../validation/auth.schema.js";

const DELETION_GRACE_PERIOD_DAYS = 30;
const OTP_VALIDITY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export const generateOtp = (length = 6): string => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const otpNumber = crypto.randomInt(min, max + 1);
  return otpNumber.toString();
};

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

/**
 * 1. Explain exactly what will be deleted and provide current deletion status.
 */
export const getAccountDeletionInfoService = async (userId: string) => {
  const user = await UserModel.findById(userId).lean();

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  const isScheduledForDeletion = user.deletionStatus === "SCHEDULED";

  const scheduledDate = user.scheduledPermanentDeletionAt || null;
  let daysRemaining: number | null = null;

  if (isScheduledForDeletion && scheduledDate) {
    const now = new Date().getTime();
    const target = new Date(scheduledDate).getTime();
    const diffMs = target - now;
    daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  return {
    isScheduledForDeletion,
    deletionStatus: user.deletionStatus,
    deletionRequestedAt: user.deletionRequestedAt || null,
    scheduledPermanentDeletionAt: scheduledDate,
    daysRemaining,
    gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
    warning: "Deleting your account will immediately revoke all active sessions and start a 30-day grace period.",
    willBeDeleted: [
      "Your personal profile information (name, email, mobile number, avatar)",
      "All saved shipping and billing addresses",
      "Active shopping cart and saved wishlist items",
      "All active login sessions across all devices",
      "Any saved preferences or saved search history",
    ],
    willBeRetained: [
      "Completed past order records will be anonymized and kept strictly for tax, invoice, and legal compliance.",
    ],
    cancellationPolicy: `You can cancel the deletion and restore your account at any time within ${DELETION_GRACE_PERIOD_DAYS} days.`,
    confirmationPhrase: "DELETE",
  };
};

/**
 * 2. Send OTP for account deletion re-authentication.
 */
export const sendAccountDeletionOtpService = async (userId: string) => {
  const user = await UserModel.findById(userId).lean();

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (user.deletionStatus === "SCHEDULED") {
    throw new AppError(
      "Your account is already scheduled for deletion. You can cancel deletion to restore it.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const now = new Date();
  const existingRequest = await AccountDeletionModel.findOne({ userId: user._id });

  if (existingRequest && existingRequest.otpExpiresAt > now) {
    const lastUpdatedTime = new Date(existingRequest.updatedAt || now).getTime();
    const timeSinceLastOtp = now.getTime() - lastUpdatedTime;

    if (timeSinceLastOtp < OTP_RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - timeSinceLastOtp) / 1000);
      throw new AppError(
        `Please wait ${waitSeconds} seconds before requesting a new OTP`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  }

  const otp = generateOtp(6);
  const otpExpiresAt = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000);

  if (existingRequest) {
    existingRequest.otp = otp;
    existingRequest.otpExpiresAt = otpExpiresAt;
    await existingRequest.save();
  } else {
    await AccountDeletionModel.create({
      userId: user._id,
      otp,
      otpExpiresAt,
    });
  }

  const maskedEmail = user.email ? maskIdentifier(user.email) : null;
  const maskedMobile = user.mobileNumber ? maskIdentifier(user.mobileNumber) : null;

  // Dispatch SMS if user has a mobile number
  if (user.mobileNumber) {
    try {
      await sendOtpSms(user.mobileNumber, otp);
    } catch (err) {
      logger.warn({ err, userId: user._id }, "Failed to send account deletion OTP via SMS");
    }
  }

  // Dispatch Email if user has an email
  if (user.email) {
    try {
      await sendEmail({
        to: user.email,
        subject: "Security Alert: Account Deletion Verification Code",
        text: `Hello ${user.name},\n\nYou have requested to delete your Online BookStore account.\n\nYour 6-digit confirmation OTP is: ${otp}\n\nThis OTP is valid for ${OTP_VALIDITY_MINUTES} minutes.\n\nIf you did not request this, please change your password immediately to secure your account.\n\nRegards,\nOnline BookStore`,
      });
    } catch (err) {
      logger.warn({ err, userId: user._id }, "Failed to send account deletion OTP via Email");
    }
  }

  logger.info({ userId: user._id }, "Account deletion OTP dispatched");

  return {
    message: "Verification OTP has been sent to your registered contact.",
    expiresInMinutes: OTP_VALIDITY_MINUTES,
    destinations: {
      email: maskedEmail,
      mobile: maskedMobile,
    },
  };
};

export interface ConfirmAccountDeletionServiceInput {
  userId: string;
  otp: string;
  confirmation: string;
  reason?: string;
}

/**
 * 3. Verify OTP, confirm "DELETE", and schedule 30-day grace period deletion.
 */
export const confirmAccountDeletionService = async ({
  userId,
  otp,
  confirmation,
  reason,
}: ConfirmAccountDeletionServiceInput) => {
  const confirmationText = confirmation.trim();

  if (confirmationText !== "DELETE") {
    throw new AppError(
      "You must type 'DELETE' exactly to confirm account deletion",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (user.deletionStatus === "SCHEDULED") {
    throw new AppError(
      "Your account is already scheduled for deletion.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const deletionRecord = await AccountDeletionModel.findOne({ userId: user._id });

  if (!deletionRecord) {
    throw new AppError(
      "No active deletion OTP request found. Please request an OTP first.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const now = new Date();
  const hasExpired = deletionRecord.otpExpiresAt < now;

  if (hasExpired) {
    await AccountDeletionModel.deleteOne({ _id: deletionRecord._id });
    throw new AppError(
      "Verification OTP has expired. Please request a new OTP.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const isOtpValid = deletionRecord.otp === otp.trim();

  if (!isOtpValid) {
    throw new AppError("Invalid verification OTP", HTTP_STATUS.BAD_REQUEST);
  }

  const deletionRequestedAt = new Date();
  const scheduledPermanentDeletionAt = new Date(
    deletionRequestedAt.getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  user.isDeleted = true;
  user.deletionStatus = "SCHEDULED";
  user.deletionRequestedAt = deletionRequestedAt;
  user.scheduledPermanentDeletionAt = scheduledPermanentDeletionAt;
  user.deletionReason = reason?.trim() || undefined;
  user.isActive = false;

  await user.save();

  // Invalidate all active sessions & refresh tokens immediately
  await RefreshTokenModel.deleteMany({ user: user._id });

  // Clean up used OTP record
  await AccountDeletionModel.deleteOne({ _id: deletionRecord._id });

  logger.info(
    { userId: user._id, scheduledPermanentDeletionAt },
    "Account deletion scheduled successfully with 30-day grace period",
  );

  return {
    message: `Account deletion scheduled. Your account has been deactivated and will be permanently deleted on ${scheduledPermanentDeletionAt.toISOString().split("T")[0]}. You can restore your account within 30 days.`,
    scheduledPermanentDeletionAt,
    gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
  };
};

/**
 * 4. Cancel deletion during 30-day grace period (for authenticated user).
 */
export const cancelAccountDeletionService = async (userId: string) => {
  const user = await UserModel.findById(userId);

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (user.deletionStatus !== "SCHEDULED") {
    throw new AppError(
      "Account is not currently scheduled for deletion.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  user.isDeleted = false;
  user.deletionStatus = "NONE";
  user.deletionRequestedAt = undefined;
  user.scheduledPermanentDeletionAt = undefined;
  user.deletionReason = undefined;
  user.isActive = true;

  await user.save();

  logger.info({ userId: user._id }, "Account deletion cancelled; account restored");

  return {
    message: "Account deletion request has been cancelled. Your account is fully restored and active.",
  };
};

/**
 * 5. Restore account with credentials during 30-day grace period (if user is logged out).
 */
export const restoreAccountWithCredentialsService = async (
  input: RestoreAccountInput,
) => {
  const rawIdentifier = input.identifier.trim();
  const password = input.password;
  const isEmail = rawIdentifier.includes("@");

  let user = null;

  if (isEmail) {
    const normalizedEmail = rawIdentifier.toLowerCase();
    user = await UserModel.findOne({ email: normalizedEmail }).select("+password");
  } else {
    const formattedMobile = formatMobileNumber(rawIdentifier);
    user = await UserModel.findOne({
      $or: [
        { mobileNumber: rawIdentifier },
        { mobileNumber: formattedMobile },
        { mobileNumber: `+${formattedMobile}` },
      ],
    }).select("+password");
  }

  if (!user) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED);
  }

  if (user.deletionStatus !== "SCHEDULED") {
    throw new AppError(
      "This account is not scheduled for deletion.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  user.isDeleted = false;
  user.deletionStatus = "NONE";
  user.deletionRequestedAt = undefined;
  user.scheduledPermanentDeletionAt = undefined;
  user.deletionReason = undefined;
  user.isActive = true;

  await user.save();

  logger.info({ userId: user._id }, "Account restored via login credentials");

  return {
    message: "Your account deletion has been cancelled and your account is active again. You may now log in normally.",
  };
};

/**
 * 6. Permanent deletion purge after the 30-day grace period expires.
 */
export const purgeExpiredDeletedAccountsService = async () => {
  const now = new Date();

  const expiredUsers = await UserModel.find({
    deletionStatus: "SCHEDULED",
    scheduledPermanentDeletionAt: { $lte: now },
  });

  let purgedCount = 0;

  for (const user of expiredUsers) {
    const userId = user._id;

    // Delete Cloudinary profile image if any
    if (user.profilePicture) {
      const publicId = extractPublicIdFromUrl(user.profilePicture);
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId);
        } catch (err) {
          logger.warn({ err, userId }, "Failed to delete Cloudinary profile picture during account purge");
        }
      }
    }

    // Delete personal linked records
    await AddressModel.deleteMany({ user: userId });
    await CartModel.deleteMany({ user: userId });
    await WishlistModel.deleteMany({ user: userId });
    await RefreshTokenModel.deleteMany({ user: userId });
    await AccountDeletionModel.deleteMany({ userId });

    // Anonymize and mark user as permanently deleted
    user.name = "Deleted User";
    user.email = `deleted_${userId.toString()}@anonymized.local`;
    user.mobileNumber = undefined;
    user.postalCode = undefined;
    user.profilePicture = undefined;
    user.isDeleted = true;
    user.deletionStatus = "PERMANENTLY_DELETED";
    user.isActive = false;

    await user.save();
    purgedCount++;

    logger.info({ userId }, "User account permanently purged and anonymized");
  }

  return {
    purgedCount,
    message: `Successfully permanently purged ${purgedCount} expired account(s).`,
  };
};

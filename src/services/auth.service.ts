import crypto from "crypto";
import bcrypt from "bcryptjs";

import { UserModel } from "../models/user.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import {
  uploadImageBuffer,
  deleteImageByPublicId,
  extractPublicIdFromUrl,
} from "./cloudinary.service.js";
import {
  sendPhoneOtpService,
  verifyPhoneOtpService,
} from "./phone-verification.service.js";
import { formatMobileNumber } from "./sms.service.js";
import { dispatchEmailVerificationOtpJob } from "../queues/email.queue.js";
import { sendOtpEmail } from "./email.service.js";
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  VerifyEmailInput,
  ResendEmailOtpInput,
} from "../validation/auth.schema.js";

const BCRYPT_SALT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export const registerUserService = async (input: RegisterInput) => {
  const normalizedEmail = input.email.toLowerCase().trim();
  const trimmedMobile = input.mobileNumber?.trim();

  const existingEmail = await UserModel.findOne({
    email: normalizedEmail,
  }).lean();

  if (existingEmail) {
    throw new AppError("Email is already registered", HTTP_STATUS.CONFLICT);
  }

  if (trimmedMobile) {
    const formattedMobile = formatMobileNumber(trimmedMobile);
    const existingMobile = await UserModel.findOne({
      $or: [
        { mobileNumber: trimmedMobile },
        { mobileNumber: formattedMobile },
        { mobileNumber: `+${formattedMobile}` },
      ],
    }).lean();

    if (existingMobile) {
      throw new AppError(
        "Mobile number is already registered",
        HTTP_STATUS.CONFLICT,
      );
    }
  }

  const hashedPassword = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  // Generate 6-digit OTP for email verification (valid for 5 minutes)
  const otpMin = 100000;
  const otpMax = 999999;
  const emailOtp = crypto.randomInt(otpMin, otpMax + 1).toString();
  const validityMinutes = 5;
  const emailOtpExpiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

  const newUser = await UserModel.create({
    name: input.name,
    email: normalizedEmail,
    password: hashedPassword,
    mobileNumber: trimmedMobile || undefined,
    country: input.country,
    postalCode: input.postalCode,
    profilePicture: input.profilePicture,
    role: input.role,
    isEmailVerified: false,
    emailVerificationOtp: emailOtp,
    emailVerificationExpiresAt: emailOtpExpiresAt,
  });

  // Dispatch OTP email to user's Gmail
  try {
    await dispatchEmailVerificationOtpJob({
      toEmail: newUser.email,
      name: newUser.name,
      otp: emailOtp,
      validityMinutes,
    });
  } catch (queueErr) {
    logger.warn(
      { err: queueErr, email: newUser.email },
      "Queue dispatch failed for registration email OTP, attempting direct email send",
    );

    try {
      await sendOtpEmail(
        {
          toEmail: newUser.email,
          name: newUser.name,
          otp: emailOtp,
          validityMinutes,
        },
        "VERIFICATION",
      );
    } catch (emailErr) {
      logger.error(
        { err: emailErr, email: newUser.email },
        "Direct email send failed for registration email OTP",
      );
    }
  }

  logger.info(
    {
      userId: newUser._id,
      email: normalizedEmail,
      role: newUser.role,
    },
    "User registered successfully and email OTP dispatched",
  );

  return {
    id: newUser._id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    mobileNumber: newUser.mobileNumber,
    country: newUser.country,
    postalCode: newUser.postalCode,
    profilePicture: newUser.profilePicture,
    isActive: newUser.isActive,
    isEmailVerified: newUser.isEmailVerified,
    isMobileVerified: newUser.isMobileVerified,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt,
  };
};

export const loginUserService = async (input: LoginInput) => {
  const rawIdentifier = (
    input.identifier ||
    input.email ||
    input.mobileNumber ||
    ""
  ).trim();

  if (!rawIdentifier) {
    throw new AppError(
      "Please provide an email address or mobile number to log in",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

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
    throw new AppError(
      "Invalid email/mobile number or password",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  if (!user.isActive) {
    if (user.deletionStatus === "SCHEDULED") {
      const scheduledDate = user.scheduledPermanentDeletionAt
        ? new Date(user.scheduledPermanentDeletionAt).toISOString().split("T")[0]
        : "in 30 days";
      throw new AppError(
        `Your account is scheduled for permanent deletion on ${scheduledDate}. You can restore your account via the restore-account endpoint.`,
        HTTP_STATUS.FORBIDDEN,
      );
    }

    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.password);

  if (!isPasswordValid) {
    throw new AppError(
      "Invalid email/mobile number or password",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  const accessToken = generateAccessToken({
    sub: user._id.toString(),
    role: user.role,
  });

  const refreshToken = generateRefreshToken({
    sub: user._id.toString(),
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await RefreshTokenModel.create({
    user: user._id,
    token: refreshToken,
    expiresAt,
  });

  logger.info(
    { userId: user._id, role: user.role },
    "User logged in successfully",
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      mobileNumber: user.mobileNumber,
      country: user.country,
      postalCode: user.postalCode,
      profilePicture: user.profilePicture,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      isMobileVerified: user.isMobileVerified,
    },
  };
};

export const refreshTokenService = async (incomingToken: string) => {
  let decoded: { sub: string };

  try {
    decoded = verifyRefreshToken(incomingToken);
    logger.info({ userId: decoded.sub }, "Refresh token JWT verified successfully");
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn(
      { error: errorMessage },
      "Refresh token failed: Invalid or expired JWT signature/payload",
    );
    throw new AppError(
      "Invalid or expired refresh token",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  const userId = decoded.sub;

  const existingTokenDoc = await RefreshTokenModel.findOne({
    token: incomingToken,
    user: userId,
  });

  if (!existingTokenDoc) {
    logger.warn(
      { userId },
      "Refresh token failed: Token document not found in database (possibly already rotated or revoked)",
    );
    throw new AppError(
      "Invalid or expired refresh token",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  // Token rotation with a 30-second grace period to allow concurrent in-flight requests to succeed
  await RefreshTokenModel.updateOne(
    { _id: existingTokenDoc._id },
    { $set: { expiresAt: new Date(Date.now() + 30 * 1000) } },
  );

  const user = await UserModel.findById(userId).lean();

  if (!user) {
    logger.warn({ userId }, "Refresh token failed: User not found");
    throw new AppError(
      "User not found or account is deactivated",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  if (!user.isActive) {
    logger.warn({ userId }, "Refresh token failed: User account is inactive");
    throw new AppError(
      "User not found or account is deactivated",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  const newAccessToken = generateAccessToken({
    sub: user._id.toString(),
    role: user.role,
  });

  const newRefreshToken = generateRefreshToken({
    sub: user._id.toString(),
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await RefreshTokenModel.create({
    user: user._id,
    token: newRefreshToken,
    expiresAt,
  });

  logger.info(
    { userId: user._id, role: user.role },
    "Refresh token rotation successful; issued new access token and refresh token",
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

export const getMeService = async (userId: string) => {
  const user = await UserModel.findById(userId)
    .populate("country", "name code phoneCode")
    .lean();

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!user.isActive) {
    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    mobileNumber: user.mobileNumber,
    country: user.country,
    postalCode: user.postalCode,
    profilePicture: user.profilePicture,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export const logoutUserService = async (token?: string) => {
  if (token) {
    await RefreshTokenModel.deleteOne({ token });
  }
};

export const updateUserProfileImageService = async (
  userId: string,
  imageBuffer: Buffer,
) => {
  const user = await UserModel.findById(userId);

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!user.isActive) {
    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  // Delete previous Cloudinary image if it exists
  if (user.profilePicture) {
    const oldPublicId = extractPublicIdFromUrl(user.profilePicture);
    if (oldPublicId) {
      try {
        await deleteImageByPublicId(oldPublicId);
      } catch (err) {
        logger.warn({ err, oldPublicId }, "Failed to delete previous profile image from Cloudinary");
      }
    }
  }

  // Upload new image to Cloudinary
  const uploadResult = await uploadImageBuffer(imageBuffer, {
    folder: "uploads",
    transformation: [
      { width: 500, height: 500, crop: "fill", gravity: "face" },
      { quality: "auto", fetch_format: "auto" },
    ],
  });

  user.profilePicture = uploadResult.secureUrl;
  await user.save();

  const populatedUser = await UserModel.findById(userId)
    .populate("country", "name code phoneCode")
    .lean();

  logger.info({ userId, publicId: uploadResult.publicId }, "Profile picture updated successfully");

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      mobileNumber: user.mobileNumber,
      country: populatedUser?.country || user.country,
      postalCode: user.postalCode,
      profilePicture: user.profilePicture,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    imageUrl: uploadResult.secureUrl,
    publicId: uploadResult.publicId,
  };
};

export const removeUserProfileImageService = async (userId: string) => {
  const user = await UserModel.findById(userId);

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!user.isActive) {
    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  if (!user.profilePicture) {
    throw new AppError("No profile picture to remove", HTTP_STATUS.BAD_REQUEST);
  }

  const oldPublicId = extractPublicIdFromUrl(user.profilePicture);
  if (oldPublicId) {
    try {
      await deleteImageByPublicId(oldPublicId);
    } catch (err) {
      logger.warn({ err, oldPublicId }, "Failed to delete profile picture from Cloudinary");
    }
  }

  user.profilePicture = undefined;
  await user.save();

  const populatedUser = await UserModel.findById(userId)
    .populate("country", "name code phoneCode")
    .lean();

  logger.info({ userId }, "Profile picture removed successfully");

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    mobileNumber: user.mobileNumber,
    country: populatedUser?.country || user.country,
    postalCode: user.postalCode,
    profilePicture: undefined,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export { sendPhoneOtpService, verifyPhoneOtpService } from "./phone-verification.service.js";

export interface ChangePasswordServiceInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export const changePasswordService = async ({
  userId,
  currentPassword,
  newPassword,
}: ChangePasswordServiceInput) => {
  const user = await UserModel.findById(userId).select("+password");

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!user.isActive) {
    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password,
  );

  if (!isCurrentPasswordValid) {
    throw new AppError(
      "Current password is incorrect",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);

  if (isSamePassword) {
    throw new AppError(
      "New password cannot be the same as current password",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  user.password = hashedPassword;
  await user.save();

  // Invalidate active refresh tokens across devices
  await RefreshTokenModel.deleteMany({ user: user._id });

  logger.info({ userId: user._id }, "User password changed successfully");

  return {
    message: "Password updated successfully",
  };
};

export const updatePasswordService = changePasswordService;

export const verifyEmailService = async (input: VerifyEmailInput) => {
  const normalizedEmail = input.email.toLowerCase().trim();
  const trimmedOtp = input.otp.trim();

  const user = await UserModel.findOne({ email: normalizedEmail }).select(
    "+emailVerificationOtp +emailVerificationExpiresAt",
  );

  if (!user) {
    throw new AppError("No account found with this email address", HTTP_STATUS.NOT_FOUND);
  }

  if (user.isEmailVerified) {
    throw new AppError("Email is already verified. Please log in.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!user.emailVerificationOtp || !user.emailVerificationExpiresAt) {
    throw new AppError(
      "No pending verification code found. Please request a new OTP.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const now = new Date();
  const hasExpired = user.emailVerificationExpiresAt < now;

  if (hasExpired) {
    throw new AppError(
      "Verification code has expired. Please request a new OTP.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const isOtpMatch = user.emailVerificationOtp === trimmedOtp;

  if (!isOtpMatch) {
    throw new AppError(
      "Invalid verification code. Please check and try again.",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  user.isEmailVerified = true;
  user.emailVerificationOtp = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();

  // Generate tokens so user is immediately logged in upon email verification
  const accessToken = generateAccessToken({
    sub: user._id.toString(),
    role: user.role,
  });

  const refreshToken = generateRefreshToken({
    sub: user._id.toString(),
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await RefreshTokenModel.create({
    user: user._id,
    token: refreshToken,
    expiresAt,
  });

  logger.info(
    { userId: user._id, email: user.email },
    "Email successfully verified and auth tokens issued",
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      mobileNumber: user.mobileNumber,
      country: user.country,
      postalCode: user.postalCode,
      profilePicture: user.profilePicture,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      isMobileVerified: user.isMobileVerified,
    },
  };
};

export const resendEmailOtpService = async (input: ResendEmailOtpInput) => {
  const normalizedEmail = input.email.toLowerCase().trim();

  const user = await UserModel.findOne({ email: normalizedEmail }).select(
    "+emailVerificationOtp +emailVerificationExpiresAt",
  );

  if (!user) {
    throw new AppError("No account found with this email address", HTTP_STATUS.NOT_FOUND);
  }

  if (user.isEmailVerified) {
    throw new AppError("Email is already verified. Please log in.", HTTP_STATUS.BAD_REQUEST);
  }

  const now = new Date();
  const cooldownMs = 60 * 1000;
  const totalValidityMs = 5 * 60 * 1000;

  if (user.emailVerificationExpiresAt) {
    const remainingValidityMs = user.emailVerificationExpiresAt.getTime() - now.getTime();
    const timeSinceSentMs = totalValidityMs - remainingValidityMs;

    if (timeSinceSentMs < cooldownMs && remainingValidityMs > 0) {
      const waitSeconds = Math.ceil((cooldownMs - timeSinceSentMs) / 1000);
      throw new AppError(
        `Please wait ${waitSeconds} seconds before requesting a new OTP.`,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }
  }

  const otpMin = 100000;
  const otpMax = 999999;
  const emailOtp = crypto.randomInt(otpMin, otpMax + 1).toString();
  const validityMinutes = 5;
  const emailOtpExpiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

  user.emailVerificationOtp = emailOtp;
  user.emailVerificationExpiresAt = emailOtpExpiresAt;
  await user.save();

  try {
    await dispatchEmailVerificationOtpJob({
      toEmail: user.email,
      name: user.name,
      otp: emailOtp,
      validityMinutes,
    });
  } catch (queueErr) {
    logger.warn(
      { err: queueErr, email: user.email },
      "Queue dispatch failed for resend email verification OTP, attempting direct email send",
    );

    try {
      await sendOtpEmail(
        {
          toEmail: user.email,
          name: user.name,
          otp: emailOtp,
          validityMinutes,
        },
        "VERIFICATION",
      );
    } catch (emailErr) {
      logger.error(
        { err: emailErr, email: user.email },
        "Direct email send failed for resend email verification OTP",
      );
    }
  }

  logger.info({ userId: user._id, email: user.email }, "Resent email verification OTP successfully");

  return {
    success: true,
    message: "A new verification code has been sent to your email.",
  };
};



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
import type { RegisterInput, LoginInput } from "../validation/auth.schema.js";

const BCRYPT_SALT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export const registerUserService = async (input: RegisterInput) => {
  const normalizedEmail = input.email.toLowerCase().trim();
  const trimmedMobile = input.mobileNumber.trim();

  const existingEmail = await UserModel.findOne({
    email: normalizedEmail,
  }).lean();
  if (existingEmail) {
    throw new AppError("Email is already registered", HTTP_STATUS.CONFLICT);
  }

  const existingMobile = await UserModel.findOne({
    mobileNumber: trimmedMobile,
  }).lean();
  if (existingMobile) {
    throw new AppError(
      "Mobile number is already registered",
      HTTP_STATUS.CONFLICT,
    );
  }

  const hashedPassword = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  const newUser = await UserModel.create({
    name: input.name,
    email: normalizedEmail,
    password: hashedPassword,
    mobileNumber: trimmedMobile,
    country: input.country,
    postalCode: input.postalCode,
    profilePicture: input.profilePicture,
    role: input.role,
  });

  // Automatically trigger OTP dispatch upon registration (5 min validity)
  try {
    await sendPhoneOtpService({
      userId: newUser._id.toString(),
      mobileNumber: trimmedMobile,
    });
  } catch (err) {
    logger.warn({ err, userId: newUser._id }, "Could not send initial registration OTP SMS");
  }

  logger.info(
    {
      userId: newUser._id,
      email: normalizedEmail,
      role: newUser.role,
    },
    "User registered successfully and OTP dispatched",
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
  const trimmedMobile = input.mobileNumber.trim();

  const user = await UserModel.findOne({ mobileNumber: trimmedMobile })
    .select("+password");

  if (!user) {
    throw new AppError(
      "Invalid mobile number or password",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  if (!user.isActive) {
    throw new AppError(
      "Account is inactive or deactivated",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.password);

  if (!isPasswordValid) {
    throw new AppError(
      "Invalid mobile number or password",
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
    },
  };
};

export const refreshTokenService = async (incomingToken: string) => {
  let decoded: { sub: string };

  try {
    decoded = verifyRefreshToken(incomingToken);
    console.log("decoded", decoded);
  } catch {
    throw new AppError(
      "Invalid or expired refresh token",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  const existingTokenDoc = await RefreshTokenModel.findOne({
    token: incomingToken,
    user: decoded.sub,
  });
  console.log("existingTokenDoc", existingTokenDoc);

  if (!existingTokenDoc) {
    throw new AppError(
      "Invalid or expired refresh token",
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  // Token rotation: delete old refresh token document
  await RefreshTokenModel.deleteOne({ _id: existingTokenDoc._id });

  const user = await UserModel.findById(decoded.sub).lean();

  if (!user || !user.isActive) {
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

  logger.info({ userId: user._id }, "Token refreshed successfully");

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



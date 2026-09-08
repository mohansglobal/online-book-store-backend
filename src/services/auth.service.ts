import bcrypt from "bcryptjs";

import { UserModel } from "../models/user.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
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

  let matchedPublisher = null;
  if (input.role === "SELLER") {
    matchedPublisher = await PublisherModel.findOne({
      $or: [{ email: normalizedEmail }, { phone: trimmedMobile }],
    });
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
    publisher: matchedPublisher?._id,
  });

  if (matchedPublisher) {
    logger.info(
      {
        userId: newUser._id,
        publisherId: matchedPublisher._id,
        publisherName: matchedPublisher.name,
      },
      "Seller successfully linked to publisher profile",
    );
  }

  logger.info(
    {
      userId: newUser._id,
      email: normalizedEmail,
      role: newUser.role,
      isPublisher: Boolean(matchedPublisher),
    },
    "User registered successfully",
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
    publisher: matchedPublisher
      ? {
          id: matchedPublisher._id,
          name: matchedPublisher.name,
          slug: matchedPublisher.slug,
          logo: matchedPublisher.logo,
        }
      : undefined,
    isActive: newUser.isActive,
    isEmailVerified: newUser.isEmailVerified,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt,
  };
};

export const loginUserService = async (input: LoginInput) => {
  const trimmedMobile = input.mobileNumber.trim();

  const user = await UserModel.findOne({ mobileNumber: trimmedMobile })
    .select("+password")
    .populate("publisher", "name nameBn slug logo website");

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
      publisher: user.publisher,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

export const refreshTokenService = async (incomingToken: string) => {
  let decoded: { sub: string };

  try {
    decoded = verifyRefreshToken(incomingToken);
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
    .populate("publisher", "name nameBn slug logo website description")
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
    publisher: user.publisher,
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

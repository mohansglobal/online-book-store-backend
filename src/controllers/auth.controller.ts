import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { AppError } from "../utils/app-error.js";
import {
  registerUserService,
  loginUserService,
  refreshTokenService,
  getMeService,
  logoutUserService,
  updateUserProfileImageService,
  removeUserProfileImageService,
  sendPhoneOtpService,
  verifyPhoneOtpService,
} from "../services/auth.service.js";
import { env } from "../config/env.js";
import { ACCESS_TOKEN_COOKIE_MAX_AGE_MS, REFRESH_TOKEN_COOKIE_MAX_AGE_MS } from "../constants/jwt-time.js";

export const register = asyncHandler(async (req, res) => {
  const user = await registerUserService(req.body);

  apiResponse(res, HTTP_STATUS.CREATED, "User registered successfully", user);
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await loginUserService(req.body);

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    path: "/",
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    path: "/",
  });

  apiResponse(res, HTTP_STATUS.OK, "Login successful", {
    accessToken,
    user,
  });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    throw new AppError("Refresh token is required", HTTP_STATUS.UNAUTHORIZED);
  }

  const { accessToken, refreshToken: newRefreshToken } = await refreshTokenService(token);

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    path: "/",
  });

  res.cookie("refreshToken", newRefreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    path: "/",
  });

  apiResponse(res, HTTP_STATUS.OK, "Access token refreshed successfully", {
    accessToken,
  });
});

export const getMe = asyncHandler(async (req, res) => {

  const user = await getMeService(req.user!.id);

  apiResponse(res, HTTP_STATUS.OK, "User profile retrieved successfully", user);
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  await logoutUserService(token);

  const clearCookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? ("strict" as const) : ("lax" as const),
    path: "/",
  };

  res.clearCookie("accessToken", clearCookieOptions);
  res.clearCookie("refreshToken", clearCookieOptions);

  apiResponse(res, HTTP_STATUS.OK, "Logged out successfully");
});

export const uploadProfileImage = asyncHandler(async (req, res) => {
  const file =
    req.file ||
    (req.files as Record<string, Express.Multer.File[]> | undefined)?.profilePicture?.[0] ||
    (req.files as Record<string, Express.Multer.File[]> | undefined)?.image?.[0] ||
    (req.files as Record<string, Express.Multer.File[]> | undefined)?.avatar?.[0] ||
    (req.files as Record<string, Express.Multer.File[]> | undefined)?.file?.[0];

  if (!file) {
    throw new AppError(
      "No image file provided. Please upload an image under field name 'profilePicture', 'image', 'avatar', or 'file'",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const result = await updateUserProfileImageService(req.user!.id, file.buffer);

  apiResponse(res, HTTP_STATUS.OK, "Profile image updated successfully", result);
});

export const removeProfileImage = asyncHandler(async (req, res) => {
  const user = await removeUserProfileImageService(req.user!.id);

  apiResponse(res, HTTP_STATUS.OK, "Profile image removed successfully", user);
});

export const sendPhoneOtp = asyncHandler(async (req, res) => {
  const userId = req.user?.id || (req as any).userId;
  const mobileNumber = req.body?.mobileNumber;

  const result = await sendPhoneOtpService({
    userId,
    mobileNumber,
  });

  apiResponse(res, HTTP_STATUS.OK, result.message, result);
});

// Explicit alias as requested
export const candidatePhoneNumberVerify = sendPhoneOtp;

export const verifyPhoneOtp = asyncHandler(async (req, res) => {
  const userId = req.user?.id || (req as any).userId;
  const { mobileNumber, otp } = req.body;

  const result = await verifyPhoneOtpService({
    userId,
    mobileNumber,
    otp,
  });

  apiResponse(res, HTTP_STATUS.OK, result.message, result);
});




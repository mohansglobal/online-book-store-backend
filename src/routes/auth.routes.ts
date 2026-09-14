import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, optionalAuthenticate } from "../middlewares/auth.middleware.js";
import { uploadProfileImageMiddleware } from "../middlewares/upload.middleware.js";
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from "../validation/auth.schema.js";
import {
  register,
  login,
  refreshToken,
  getMe,
  logout,
  uploadProfileImage,
  removeProfileImage,
  sendPhoneOtp,
  candidatePhoneNumberVerify,
  verifyPhoneOtp,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh-token", refreshToken);
router.get("/me", authenticate, getMe);
router.post("/logout", logout);

// Phone verification OTP endpoints
router.post("/send-otp", optionalAuthenticate, validate(sendOtpSchema), sendPhoneOtp);
router.post("/phone/send-otp", optionalAuthenticate, validate(sendOtpSchema), sendPhoneOtp);
router.post("/verify-otp", optionalAuthenticate, validate(verifyOtpSchema), verifyPhoneOtp);
router.post("/phone/verify-otp", optionalAuthenticate, validate(verifyOtpSchema), verifyPhoneOtp);
router.post("/phone/verify", optionalAuthenticate, validate(sendOtpSchema), candidatePhoneNumberVerify);

// Profile image endpoints
router.post(
  "/profile-image",
  authenticate,
  uploadProfileImageMiddleware,
  uploadProfileImage,
);
router.patch(
  "/profile-image",
  authenticate,
  uploadProfileImageMiddleware,
  uploadProfileImage,
);
router.delete("/profile-image", authenticate, removeProfileImage);

export default router;



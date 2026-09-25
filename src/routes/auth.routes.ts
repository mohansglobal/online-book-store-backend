import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, optionalAuthenticate, authorize } from "../middlewares/auth.middleware.js";
import { uploadProfileImageMiddleware } from "../middlewares/upload.middleware.js";
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  verifyPasswordResetOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  confirmAccountDeletionSchema,
  restoreAccountSchema,
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
  forgotPassword,
  verifyPasswordResetOtp,
  resetPassword,
  changePassword,
  getAccountDeletionInfo,
  sendAccountDeletionOtp,
  confirmAccountDeletion,
  cancelAccountDeletion,
  restoreAccount,
  purgeExpiredAccounts,
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

// Password reset endpoints
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post(
  "/password-reset/verify-otp",
  validate(verifyPasswordResetOtpSchema),
  verifyPasswordResetOtp,
);
router.post(
  "/password-reset",
  validate(resetPasswordSchema),
  resetPassword,
);
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPassword,
);

// Password update endpoints
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  changePassword,
);
router.patch(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  changePassword,
);
router.post(
  "/update-password",
  authenticate,
  validate(changePasswordSchema),
  changePassword,
);
router.patch(
  "/update-password",
  authenticate,
  validate(changePasswordSchema),
  changePassword,
);

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

// Account deletion (Danger Zone) endpoints
router.get("/delete-account", authenticate, getAccountDeletionInfo);
router.get("/delete-account/info", authenticate, getAccountDeletionInfo);
router.post("/delete-account/send-otp", authenticate, sendAccountDeletionOtp);
router.post(
  "/delete-account",
  authenticate,
  validate(confirmAccountDeletionSchema),
  confirmAccountDeletion,
);
router.delete(
  "/delete-account",
  authenticate,
  validate(confirmAccountDeletionSchema),
  confirmAccountDeletion,
);
router.post("/delete-account/cancel", authenticate, cancelAccountDeletion);
router.post("/restore-account", validate(restoreAccountSchema), restoreAccount);
router.post("/delete-account/purge-expired", authenticate, authorize("ADMIN"), purgeExpiredAccounts);

export default router;



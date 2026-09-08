import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { registerSchema, loginSchema } from "../validation/auth.schema.js";
import {
  register,
  login,
  refreshToken,
  getMe,
  logout,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh-token", refreshToken);
router.get("/me", authenticate, getMe);
router.post("/logout", logout);

export default router;

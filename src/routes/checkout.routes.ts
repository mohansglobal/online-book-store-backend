import { Router } from "express";

import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { checkoutSummaryQuerySchema } from "../validation/checkout.schema.js";
import { getCheckoutSummary } from "../controllers/checkout.controller.js";

const router = Router();

router.use(authenticate);

router.get(
  "/summary",
  validate(checkoutSummaryQuerySchema, "query"),
  getCheckoutSummary,
);

export default router;

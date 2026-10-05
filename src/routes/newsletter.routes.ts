import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  subscribeNewsletterSchema,
  unsubscribeNewsletterSchema,
  newsletterQuerySchema,
} from "../validation/newsletter.schema.js";
import {
  subscribeNewsletter,
  unsubscribeNewsletter,
  getSubscribers,
} from "../controllers/newsletter.controller.js";

const router = Router();

router.post(
  "/subscribe",
  validate(subscribeNewsletterSchema, "body"),
  subscribeNewsletter,
);

router.post(
  "/unsubscribe",
  validate(unsubscribeNewsletterSchema, "body"),
  unsubscribeNewsletter,
);

router.get(
  "/subscribers",
  authenticate,
  authorize("admin"),
  validate(newsletterQuerySchema, "query"),
  getSubscribers,
);

export default router;

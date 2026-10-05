import { Router } from "express";

import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  updateSiteContentSchema,
  contentSectionParamSchema,
  resetSectionSchema,
} from "../validation/content.schema.js";
import {
  getSiteContent,
  updateSiteContent,
  updateSectionContent,
  resetSiteContent,
} from "../controllers/content.controller.js";

const router = Router();

// Public: All visitors/homepage fetch the site content
router.get("/", getSiteContent);

// Admin-only: Update multiple or partial content sections
router.patch(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(updateSiteContentSchema, "body"),
  updateSiteContent,
);

router.put(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(updateSiteContentSchema, "body"),
  updateSiteContent,
);

// Admin-only: Reset all or a specific section
router.post(
  "/reset",
  authenticate,
  authorize("ADMIN"),
  validate(resetSectionSchema, "body"),
  resetSiteContent,
);

// Admin-only: Update a specific section (hero, ebooks, poetry, announcement)
router.patch(
  "/:section",
  authenticate,
  authorize("ADMIN"),
  validate(contentSectionParamSchema, "params"),
  updateSectionContent,
);

router.put(
  "/:section",
  authenticate,
  authorize("ADMIN"),
  validate(contentSectionParamSchema, "params"),
  updateSectionContent,
);

export default router;

import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  publisherQuerySchema,
  publisherParamSchema,
  createPublisherSchema,
  updatePublisherSchema,
} from "../validation/publisher.schema.js";
import {
  getPublishers,
  getPublisherByIdOrSlug,
  getMyPublisherProfile,
  createPublisher,
  updatePublisher,
} from "../controllers/publisher.controller.js";

const router = Router();

router.get("/", validate(publisherQuerySchema, "query"), getPublishers);
router.get(
  "/me",
  authenticate,
  authorize("SELLER", "ADMIN"),
  getMyPublisherProfile,
);
router.get(
  "/:idOrSlug",
  validate(publisherParamSchema, "params"),
  getPublisherByIdOrSlug,
);
router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createPublisherSchema, "body"),
  createPublisher,
);
router.patch(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(updatePublisherSchema, "body"),
  updatePublisher,
);

export default router;

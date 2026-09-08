import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  bookListingQuerySchema,
  bookListingParamSchema,
  createBookListingSchema,
  updateBookListingSchema,
} from "../validation/book-listing.schema.js";
import {
  getBookListings,
  getBookListingById,
  createBookListing,
  updateBookListing,
  deleteBookListing,
} from "../controllers/book-listing.controller.js";

const router = Router();

router.get("/", validate(bookListingQuerySchema, "query"), getBookListings);
router.get(
  "/:id",
  validate(bookListingParamSchema, "params"),
  getBookListingById,
);
router.post(
  "/",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(createBookListingSchema, "body"),
  createBookListing,
);
router.patch(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(bookListingParamSchema, "params"),
  validate(updateBookListingSchema, "body"),
  updateBookListing,
);
router.delete(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(bookListingParamSchema, "params"),
  deleteBookListing,
);

export default router;

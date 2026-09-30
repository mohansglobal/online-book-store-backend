import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../middlewares/auth.middleware.js";
import {
  bookListingQuerySchema,
  bestsellerQuerySchema,
  popularNovelsQuerySchema,
  bookListingParamSchema,
  createBookListingSchema,
  updateBookListingSchema,
  myBookListingQuerySchema,
  updateStockSchema,
  toggleBookListingStatusSchema,
  applyListingDiscountSchema,
} from "../validation/book-listing.schema.js";
import {
  getBookListings,
  getThisWeekBestsellers,
  getPopularNovels,
  getMyBookListings,
  getBookListingById,
  createBookListing,
  updateBookListing,
  updateListingStock,
  toggleBookListingStatus,
  deleteBookListing,
  applyListingDiscount,
} from "../controllers/book-listing.controller.js";

const router = Router();

router.get("/", validate(bookListingQuerySchema, "query"), getBookListings);

router.get(
  "/bestsellers",
  validate(bestsellerQuerySchema, "query"),
  getThisWeekBestsellers,
);

router.get(
  "/popular-novels",
  validate(popularNovelsQuerySchema, "query"),
  getPopularNovels,
);

router.get(
  "/my-listings",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(myBookListingQuerySchema, "query"),
  getMyBookListings,
);

router.get(
  "/:id",
  optionalAuthenticate,
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

router.patch(
  "/:id/stock",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(bookListingParamSchema, "params"),
  validate(updateStockSchema, "body"),
  updateListingStock,
);

router.patch(
  "/:id/discount",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(bookListingParamSchema, "params"),
  validate(applyListingDiscountSchema, "body"),
  applyListingDiscount,
);


router.patch(
  "/:id/status",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(bookListingParamSchema, "params"),
  validate(toggleBookListingStatusSchema, "body"),
  toggleBookListingStatus,
);

router.patch(
  "/:id/toggle-status",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(bookListingParamSchema, "params"),
  validate(toggleBookListingStatusSchema, "body"),
  toggleBookListingStatus,
);

router.delete(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(bookListingParamSchema, "params"),
  deleteBookListing,
);

export default router;



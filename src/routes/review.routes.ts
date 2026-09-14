import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { uploadReviewImagesMiddleware } from "../middlewares/upload.middleware.js";
import {
  createReviewSchema,
  updateReviewSchema,
  bookReviewsQuerySchema,
} from "../validation/review.schema.js";
import {
  createReview,
  updateReview,
  deleteReview,
  getMyReviewForBook,
  getBookReviews,
  checkReviewEligibility,
} from "../controllers/review.controller.js";

const router = Router();

// 1. Eligibility endpoints (check if current user bought & had delivered this book/listing)
router.get("/check-eligibility", authenticate, checkReviewEligibility);
router.get("/check-eligibility/:bookId", authenticate, checkReviewEligibility);
router.get("/eligibility", authenticate, checkReviewEligibility);
router.get("/eligibility/book/:bookId", authenticate, checkReviewEligibility);
router.get("/eligibility/:bookId", authenticate, checkReviewEligibility);

// 2. User's own review
router.get("/my", authenticate, getMyReviewForBook);
router.get("/my/book/:bookId", authenticate, getMyReviewForBook);
router.get("/my/:bookId", authenticate, getMyReviewForBook);

// 3. Public get reviews & stats (supports both query ?bookId=... and path params)
router.get("/", validate(bookReviewsQuerySchema, "query"), getBookReviews);
router.get("/book/:bookId", validate(bookReviewsQuerySchema, "query"), getBookReviews);
router.get("/listing/:listingId", validate(bookReviewsQuerySchema, "query"), getBookReviews);

// 4. Create, edit, delete review
router.post(
  "/",
  authenticate,
  uploadReviewImagesMiddleware,
  validate(createReviewSchema),
  createReview,
);

router.patch(
  "/:id",
  authenticate,
  uploadReviewImagesMiddleware,
  validate(updateReviewSchema),
  updateReview,
);

router.delete("/:id", authenticate, deleteReview);

export default router;

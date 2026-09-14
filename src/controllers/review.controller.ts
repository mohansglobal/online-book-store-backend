import type { Request } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { AppError } from "../utils/app-error.js";
import {
  createReviewService,
  updateReviewService,
  deleteReviewService,
  getMyReviewForBookService,
  getBookReviewsService,
  checkReviewEligibilityService,
} from "../services/review.service.js";
import type {
  CreateReviewInput,
  UpdateReviewInput,
  BookReviewsQueryInput,
} from "../validation/review.schema.js";

const extractFiles = (req: Request): Express.Multer.File[] => {
  if (Array.isArray(req.files)) {
    return req.files;
  }
  if (req.files && typeof req.files === "object") {
    const filesDict = req.files as Record<string, Express.Multer.File[]>;
    return [
      ...(filesDict.images || []),
      ...(filesDict.files || []),
      ...(filesDict.image || []),
    ];
  }
  if (req.file) {
    return [req.file];
  }
  return [];
};

export const createReview = asyncHandler(async (req, res) => {
  const files = extractFiles(req);

  const review = await createReviewService(
    req.user!.id,
    req.body as CreateReviewInput,
    files,
  );

  apiResponse(
    res,
    HTTP_STATUS.CREATED,
    "Review submitted successfully",
    review,
  );
});

export const updateReview = asyncHandler(async (req, res) => {
  const files = extractFiles(req);

  const review = await updateReviewService(
    req.params.id as string,
    req.user!.id,
    req.body as UpdateReviewInput,
    files,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Review updated successfully",
    review,
  );
});

export const deleteReview = asyncHandler(async (req, res) => {
  const result = await deleteReviewService(
    req.params.id as string,
    req.user!.id,
    req.user?.role,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Review deleted successfully",
    result,
  );
});

export const getMyReviewForBook = asyncHandler(async (req, res) => {
  const targetId = (req.params.bookId ||
    req.params.id ||
    req.query.bookId ||
    req.query.bookListingId ||
    req.query.id) as string;

  if (!targetId) {
    throw new AppError("Book ID or Listing ID is required", HTTP_STATUS.BAD_REQUEST);
  }

  const review = await getMyReviewForBookService(
    req.user!.id,
    targetId,
    req.query.sellerId as string | undefined,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "My review retrieved successfully",
    review,
  );
});

export const getBookReviews = asyncHandler(async (req, res) => {
  const targetId = (req.params.bookId ||
    req.params.listingId ||
    req.params.id ||
    req.query.bookId ||
    req.query.bookListingId ||
    req.query.id) as string;

  if (!targetId) {
    throw new AppError("Book ID or Listing ID is required", HTTP_STATUS.BAD_REQUEST);
  }

  const { reviews, stats, meta } = await getBookReviewsService(
    targetId,
    req.query as unknown as BookReviewsQueryInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Book reviews retrieved successfully",
    {
      reviews,
      stats,
    },
    meta,
  );
});

export const checkReviewEligibility = asyncHandler(async (req, res) => {
  const targetId = (req.params.bookId ||
    req.params.listingId ||
    req.params.id ||
    req.query.bookId ||
    req.query.bookListingId ||
    req.query.id) as string;

  if (!targetId) {
    throw new AppError("Book ID or Listing ID is required", HTTP_STATUS.BAD_REQUEST);
  }

  const result = await checkReviewEligibilityService(
    req.user!.id,
    targetId,
    req.query.sellerId as string | undefined,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    result.message,
    result,
  );
});

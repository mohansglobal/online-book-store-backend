import { Types } from "mongoose";
import { ReviewModel, type ReviewDocument } from "../models/review.model.js";
import { BookModel } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import { UserModel } from "../models/user.model.js";
import { OrderModel } from "../models/order.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { uploadImageBuffer } from "./cloudinary.service.js";
import { logger } from "../utils/logger.js";
import type {
  CreateReviewInput,
  UpdateReviewInput,
  BookReviewsQueryInput,
} from "../validation/review.schema.js";

export interface ReviewRatingStats {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  ratingPercentages: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export interface ResolvedBookContext {
  bookId: Types.ObjectId;
  bookListingId?: Types.ObjectId;
  sellerId?: Types.ObjectId;
}

/**
 * Resolves whether an input ID refers to a Book or a BookListing, returning standard bookId and sellerId.
 */
export const resolveBookContext = async (
  inputBookOrListingId: string,
  inputSellerId?: string,
): Promise<ResolvedBookContext> => {
  if (!inputBookOrListingId || !Types.ObjectId.isValid(inputBookOrListingId)) {
    throw new AppError("Invalid Book or Listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const idObj = new Types.ObjectId(inputBookOrListingId);

  // 1. Check if it's a BookListing
  const listing = await BookListingModel.findById(idObj).select("book seller").lean();
  if (listing) {
    return {
      bookId: listing.book as unknown as Types.ObjectId,
      bookListingId: listing._id,
      sellerId: inputSellerId ? new Types.ObjectId(inputSellerId) : (listing.seller as unknown as Types.ObjectId),
    };
  }

  // 2. Check if it's a Book
  const book = await BookModel.findById(idObj).select("_id").lean();
  if (book) {
    return {
      bookId: book._id,
      sellerId: inputSellerId ? new Types.ObjectId(inputSellerId) : undefined,
    };
  }

  throw new AppError("Book or Book Listing not found", HTTP_STATUS.NOT_FOUND);
};

/**
 * Validates buyer's delivered order for the book and seller, and creates a new review.
 */
export const createReviewService = async (
  userId: string,
  input: CreateReviewInput,
  files: Express.Multer.File[] = [],
) => {
  const targetId = input.bookId || input.bookListingId!;
  const resolved = await resolveBookContext(targetId, input.sellerId);

  const bookObjectId = resolved.bookId;
  const sellerObjectId = resolved.sellerId;
  const userObjectId = new Types.ObjectId(userId);

  if (!sellerObjectId) {
    throw new AppError("Seller ID is required for seller-wise book review", HTTP_STATUS.BAD_REQUEST);
  }

  // 1. Verify seller exists
  const seller = await UserModel.findById(sellerObjectId).select("_id name role").lean();
  if (!seller) {
    throw new AppError("Seller not found", HTTP_STATUS.NOT_FOUND);
  }

  // 2. Verify user has a delivered order containing this book from this seller
  const orderFilter: Record<string, unknown> = {
    buyer: userObjectId,
    orderStatus: "DELIVERED",
    items: {
      $elemMatch: {
        $or: [
          { book: bookObjectId },
          ...(resolved.bookListingId ? [{ bookListing: resolved.bookListingId }] : []),
        ],
        seller: sellerObjectId,
      },
    },
  };

  const deliveredOrder = await OrderModel.findOne(orderFilter).lean();

  if (!deliveredOrder) {
    throw new AppError(
      "Only verified buyers who have received this book from this seller can post a review",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  // 3. Check if user already reviewed this book from this seller (1 review per user + book + seller)
  const existingReview = await ReviewModel.findOne({
    user: userObjectId,
    book: bookObjectId,
    seller: sellerObjectId,
  });

  if (existingReview) {
    throw new AppError(
      "You have already reviewed this book from this seller. Please edit your existing review instead.",
      HTTP_STATUS.CONFLICT,
    );
  }

  // 4. Upload images to Cloudinary concurrently if provided
  let uploadedImageUrls: string[] = [];
  if (files && files.length > 0) {
    try {
      const uploadPromises = files.map((file) =>
        uploadImageBuffer(file.buffer, {
          folder: "bookstore/reviews",
        }),
      );
      const uploadResults = await Promise.all(uploadPromises);
      uploadedImageUrls = uploadResults.map((res) => res.secureUrl || res.url);
    } catch (error) {
      logger.error({ err: error, userId, bookId: bookObjectId.toString() }, "Failed to upload review images");
      throw new AppError("Failed to upload review images", HTTP_STATUS.BAD_REQUEST);
    }
  }

  const allImages = [...(input.images || []), ...uploadedImageUrls];

  // 5. Create Review
  const newReview = await ReviewModel.create({
    user: userObjectId,
    book: bookObjectId,
    seller: sellerObjectId,
    bookListing: resolved.bookListingId,
    order: deliveredOrder._id,
    rating: input.rating,
    title: input.title,
    review: input.review,
    images: allImages,
    isVerifiedPurchase: true,
    status: "APPROVED",
  });

  const populatedReview = await ReviewModel.findById(newReview._id)
    .populate("user", "name profilePicture")
    .populate("seller", "name")
    .lean();

  return populatedReview;
};

/**
 * Updates an existing review written by the user.
 */
export const updateReviewService = async (
  reviewId: string,
  userId: string,
  input: UpdateReviewInput,
  files: Express.Multer.File[] = [],
) => {
  const review = await ReviewModel.findById(reviewId);
  if (!review) {
    throw new AppError("Review not found", HTTP_STATUS.NOT_FOUND);
  }

  if (review.user.toString() !== userId) {
    throw new AppError("You can only edit your own review", HTTP_STATUS.FORBIDDEN);
  }

  // Upload new images if any
  let uploadedImageUrls: string[] = [];
  if (files && files.length > 0) {
    try {
      const uploadPromises = files.map((file) =>
        uploadImageBuffer(file.buffer, {
          folder: "bookstore/reviews",
        }),
      );
      const uploadResults = await Promise.all(uploadPromises);
      uploadedImageUrls = uploadResults.map((res) => res.secureUrl || res.url);
    } catch (error) {
      logger.error({ err: error, reviewId, userId }, "Failed to upload new review images");
      throw new AppError("Failed to upload review images", HTTP_STATUS.BAD_REQUEST);
    }
  }

  let finalImages = review.images;
  if (input.existingImages !== undefined) {
    finalImages = input.existingImages;
  }
  if (uploadedImageUrls.length > 0) {
    finalImages = [...finalImages, ...uploadedImageUrls];
  }

  if (input.rating !== undefined) {
    review.rating = input.rating;
  }
  if (input.title !== undefined) {
    review.title = input.title;
  }
  if (input.review !== undefined) {
    review.review = input.review;
  }
  review.images = finalImages;

  await review.save();

  const updatedReview = await ReviewModel.findById(review._id)
    .populate("user", "name profilePicture")
    .populate("seller", "name")
    .lean();

  return updatedReview;
};

/**
 * Deletes a review owned by the user (or admin).
 */
export const deleteReviewService = async (
  reviewId: string,
  userId: string,
  userRole?: string,
) => {
  const review = await ReviewModel.findById(reviewId);
  if (!review) {
    throw new AppError("Review not found", HTTP_STATUS.NOT_FOUND);
  }

  if (review.user.toString() !== userId && userRole !== "ADMIN") {
    throw new AppError("You can only delete your own review", HTTP_STATUS.FORBIDDEN);
  }

  await ReviewModel.findByIdAndDelete(reviewId);

  return { id: reviewId, deleted: true };
};

/**
 * Gets a user's own review for a specific book or listing.
 */
export const getMyReviewForBookService = async (
  userId: string,
  bookOrListingId: string,
  sellerId?: string,
) => {
  const resolved = await resolveBookContext(bookOrListingId, sellerId);

  const query: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
    book: resolved.bookId,
  };

  if (resolved.sellerId) {
    query.seller = resolved.sellerId;
  }

  const review = await ReviewModel.findOne(query)
    .populate("user", "name profilePicture")
    .populate("seller", "name")
    .lean();

  return review;
};

/**
 * Checks if the authenticated user has purchased & had delivered this book/listing, and whether they are eligible to review.
 */
export const checkReviewEligibilityService = async (
  userId: string,
  bookOrListingId: string,
  sellerId?: string,
) => {
  const resolved = await resolveBookContext(bookOrListingId, sellerId);
  const userObjectId = new Types.ObjectId(userId);
  const bookObjectId = resolved.bookId;

  // 1. Find all orders by user containing this book (or listing)
  const itemMatchQuery: Record<string, unknown>[] = [{ book: bookObjectId }];
  if (resolved.bookListingId) {
    itemMatchQuery.push({ bookListing: resolved.bookListingId });
  }

  const userOrders = await OrderModel.find({
    buyer: userObjectId,
    items: {
      $elemMatch: {
        $or: itemMatchQuery,
      },
    },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!userOrders || userOrders.length === 0) {
    return {
      canReview: false,
      hasPurchased: false,
      hasDelivered: false,
      message: "You have not purchased this book.",
      existingReview: null,
      eligibleSellers: [],
    };
  }

  // 2. Filter delivered orders
  const deliveredOrders = userOrders.filter((order) => order.orderStatus === "DELIVERED");

  if (deliveredOrders.length === 0) {
    return {
      canReview: false,
      hasPurchased: true,
      hasDelivered: false,
      message: "You have purchased this book, but your order has not been marked as delivered yet.",
      existingReview: null,
      eligibleSellers: [],
    };
  }

  // 3. Find existing reviews by this user for this book
  const userReviews = await ReviewModel.find({
    user: userObjectId,
    book: bookObjectId,
  })
    .populate("seller", "name")
    .lean();

  // 4. Build eligible sellers list from delivered orders
  const eligibleSellersMap = new Map<
    string,
    {
      sellerId: string;
      orderId: string;
      bookListingId?: string;
      deliveredAt?: Date;
      hasReviewed: boolean;
      review?: (typeof userReviews)[0] | null;
    }
  >();

  for (const order of deliveredOrders) {
    for (const item of order.items) {
      const isMatchingItem =
        item.book.toString() === bookObjectId.toString() ||
        (resolved.bookListingId && item.bookListing?.toString() === resolved.bookListingId.toString());

      if (isMatchingItem) {
        const sellerIdStr = item.seller.toString();
        if (!eligibleSellersMap.has(sellerIdStr)) {
          const existingForSeller = userReviews.find(
            (r) => (r.seller?._id?.toString() || r.seller?.toString()) === sellerIdStr,
          );
          eligibleSellersMap.set(sellerIdStr, {
            sellerId: sellerIdStr,
            orderId: order._id.toString(),
            bookListingId: item.bookListing ? item.bookListing.toString() : undefined,
            deliveredAt: (order as unknown as { updatedAt?: Date }).updatedAt || (order as unknown as { createdAt?: Date }).createdAt,
            hasReviewed: Boolean(existingForSeller),
            review: existingForSeller || null,
          });
        }
      }
    }
  }

  // Populate seller names
  const sellerIds = Array.from(eligibleSellersMap.keys()).map((id) => new Types.ObjectId(id));
  const sellers = await UserModel.find({ _id: { $in: sellerIds } })
    .select("_id name")
    .lean();
  const sellerNameMap = new Map(sellers.map((s) => [s._id.toString(), s.name]));

  const eligibleSellers = Array.from(eligibleSellersMap.values()).map((entry) => ({
    ...entry,
    sellerName: sellerNameMap.get(entry.sellerId) || "Seller",
  }));

  // If a specific sellerId was resolved or requested
  const targetSellerId = resolved.sellerId?.toString();
  if (targetSellerId) {
    const specificSellerEntry = eligibleSellers.find((s) => s.sellerId === targetSellerId);
    if (!specificSellerEntry) {
      return {
        canReview: false,
        hasPurchased: false,
        hasDelivered: false,
        message: "You have not purchased this book from this specific seller.",
        existingReview: null,
        eligibleSellers,
      };
    }

    return {
      canReview: !specificSellerEntry.hasReviewed,
      hasPurchased: true,
      hasDelivered: true,
      existingReview: specificSellerEntry.review || null,
      message: specificSellerEntry.hasReviewed
        ? "You have already reviewed this book from this seller."
        : "You are eligible to review this book.",
      eligibleSellers: [specificSellerEntry],
    };
  }

  const hasUnreviewedSeller = eligibleSellers.some((s) => !s.hasReviewed);
  const primaryExistingReview = userReviews.length > 0 ? userReviews[0] : null;

  return {
    canReview: hasUnreviewedSeller,
    hasPurchased: true,
    hasDelivered: true,
    existingReview: primaryExistingReview,
    message: hasUnreviewedSeller
      ? "You are eligible to review this book."
      : "You have already reviewed all purchased copies of this book.",
    eligibleSellers,
  };
};

/**
 * Retrieves paginated reviews and aggregate rating breakdown stats for a book (and optional seller).
 */
export const getBookReviewsService = async (
  bookOrListingId: string,
  query: BookReviewsQueryInput,
) => {
  const resolved = await resolveBookContext(bookOrListingId, query.sellerId);
  const bookObjectId = resolved.bookId;
  const sellerObjectId = resolved.sellerId;

  const filter: Record<string, unknown> = {
    book: bookObjectId,
    status: "APPROVED",
  };

  if (sellerObjectId) {
    filter.seller = sellerObjectId;
  }

  if (query.rating) {
    filter.rating = query.rating;
  }

  if (query.hasImages) {
    filter["images.0"] = { $exists: true };
  }

  // Sort mapping
  let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
  switch (query.sortBy) {
    case "oldest":
      sortOption = { createdAt: 1 };
      break;
    case "highest_rating":
      sortOption = { rating: -1, createdAt: -1 };
      break;
    case "lowest_rating":
      sortOption = { rating: 1, createdAt: -1 };
      break;
    case "most_helpful":
      sortOption = { helpfulVotes: -1, createdAt: -1 };
      break;
    case "newest":
    default:
      sortOption = { createdAt: -1 };
      break;
  }

  const page = query.page || 1;
  const limit = Math.min(query.limit || 10, 100);
  const skip = (page - 1) * limit;

  // Run list query and count in parallel
  const [reviews, totalCount, statsResult] = await Promise.all([
    ReviewModel.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate("user", "name profilePicture")
      .populate("seller", "name")
      .lean(),
    ReviewModel.countDocuments(filter),
    calculateReviewStats(bookObjectId, sellerObjectId),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return {
    reviews,
    stats: statsResult,
    meta: {
      page,
      limit,
      total: totalCount,
      totalPages,
    },
  };
};

/**
 * Fast MongoDB aggregation pipeline to calculate average rating and 1-5 star breakdown.
 */
export const calculateReviewStats = async (
  bookId: Types.ObjectId,
  sellerId?: Types.ObjectId,
): Promise<ReviewRatingStats> => {
  const matchStage: Record<string, unknown> = {
    book: bookId,
    status: "APPROVED",
  };

  if (sellerId) {
    matchStage.seller = sellerId;
  }

  const result = await ReviewModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
        rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
        rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
        rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
        rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
      },
    },
  ]);

  if (!result || result.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      ratingPercentages: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
  }

  const raw = result[0];
  const total = raw.totalReviews || 0;
  const avg = raw.averageRating ? Math.round(raw.averageRating * 10) / 10 : 0;

  const breakdown = {
    5: raw.rating5 || 0,
    4: raw.rating4 || 0,
    3: raw.rating3 || 0,
    2: raw.rating2 || 0,
    1: raw.rating1 || 0,
  };

  const percentages = {
    5: total > 0 ? Math.round((breakdown[5] / total) * 100) : 0,
    4: total > 0 ? Math.round((breakdown[4] / total) * 100) : 0,
    3: total > 0 ? Math.round((breakdown[3] / total) * 100) : 0,
    2: total > 0 ? Math.round((breakdown[2] / total) * 100) : 0,
    1: total > 0 ? Math.round((breakdown[1] / total) * 100) : 0,
  };

  return {
    averageRating: avg,
    totalReviews: total,
    ratingBreakdown: breakdown,
    ratingPercentages: percentages,
  };
};

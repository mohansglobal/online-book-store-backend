import mongoose from "mongoose";
import "../models/index.js";

import { BookListingModel, type BookListingDocument } from "../models/book-listing.model.js";
import { BookModel, type BookDocument } from "../models/book.model.js";
import { WishlistModel } from "../models/wishlist.model.js";
import { UserModel } from "../models/user.model.js";
import { CategoryModel } from "../models/category.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CountryModel } from "../models/country.model.js";
import { resolveCountryId } from "./country.service.js";
import { OrderModel } from "../models/order.model.js";
import { ReviewModel } from "../models/review.model.js";
import {
  getBatchListingRatingStats,
  getListingRatingFromMap,
  calculateReviewStats,
} from "./review.service.js";
import { validateIsbnStandards } from "./book.service.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import {
  createBookListingSchema,
  updateBookListingSchema,
  myBookListingQuerySchema,
  updateStockSchema,
  type BookListingQueryInput,
  type BestsellerQueryInput,
  type PopularNovelsQueryInput,
  type CreateBookListingInput,
  type UpdateBookListingInput,
  type MyBookListingQueryInput,
  type UpdateStockInput,
  type ApplyListingDiscountInput,
} from "../validation/book-listing.schema.js";
import { getMergedAndShuffledBookImages } from "../utils/image.helper.js";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0980-\u09FF-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
};

export const getThisWeekBestsellersService = async (
  query: BestsellerQueryInput,
) => {
  const limit = query.limit && query.limit > 0 ? query.limit : 5;
  const period = query.period || "week";

  let startDate: Date | undefined;
  if (period === "week") {
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    startDate = new Date(Date.now() - sevenDaysInMs);
  } else if (period === "month") {
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    startDate = new Date(Date.now() - thirtyDaysInMs);
  }

  const orderMatchStage: Record<string, unknown> = {
    status: { $ne: "CANCELLED" },
  };

  if (startDate) {
    orderMatchStage.createdAt = { $gte: startDate };
  }

  // 1. Aggregate top-selling books from non-cancelled orders
  const topSoldBooks = await OrderModel.aggregate([
    { $match: orderMatchStage },
    { $unwind: "$items" },
    { $match: { "items.status": { $ne: "CANCELLED" } } },
    {
      $group: {
        _id: "$items.book",
        totalSold: { $sum: "$items.quantity" },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalSold: -1, orderCount: -1 } },
    { $limit: Math.max(limit * 3, 20) },
  ]);

  const salesMap = new Map<string, { totalSold: number; orderCount: number }>();
  for (const item of topSoldBooks) {
    const bookIdString = item._id.toString();
    salesMap.set(bookIdString, {
      totalSold: item.totalSold,
      orderCount: item.orderCount,
    });
  }

  const topBookIds = topSoldBooks.map((b) => b._id);

  let rawListings: any[] = [];

  if (topBookIds.length > 0) {
    const matchedListings = await BookListingModel.aggregate([
      {
        $match: {
          book: { $in: topBookIds },
          isActive: true,
        },
      },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      {
        $unwind: {
          path: "$bookDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "bookDoc.status": "ACTIVE",
        },
      },
      {
        $sort: {
          stock: -1,
          sellingPriceInPaise: 1,
          _id: 1,
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$bookDoc.title", "$book"] },
          listing: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$listing" } },
      { $project: { bookDoc: 0 } },
    ]);

    matchedListings.sort((a, b) => {
      const bookA = a.book?.toString() || "";
      const bookB = b.book?.toString() || "";
      const soldA = salesMap.get(bookA)?.totalSold ?? 0;
      const soldB = salesMap.get(bookB)?.totalSold ?? 0;
      return soldB - soldA;
    });

    rawListings = matchedListings;
  }

  // 2. Graceful backfill if fewer than limit bestsellers found in this period
  if (rawListings.length < limit) {
    const existingBookIds = rawListings.map((l) => l.book);
    const needed = limit - rawListings.length;

    const fallbackListings = await BookListingModel.aggregate([
      {
        $match: {
          isActive: true,
          book: { $nin: existingBookIds },
        },
      },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      {
        $unwind: {
          path: "$bookDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "bookDoc.status": "ACTIVE",
        },
      },
      {
        $sort: {
          stock: -1,
          sellingPriceInPaise: 1,
          _id: 1,
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$bookDoc.title", "$book"] },
          listing: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$listing" } },
      { $project: { bookDoc: 0 } },
      { $limit: needed },
    ]);

    rawListings.push(...fallbackListings);
  }

  const selectedRawListings = rawListings.slice(0, limit);

  // 3. Populate book and seller details
  const populatedListings = await BookListingModel.populate(selectedRawListings, [
    {
      path: "book",
      populate: [
        { path: "authors", select: "name nameBn slug photo" },
        { path: "publisher", select: "name nameBn slug logo" },
        { path: "categories", select: "name nameBn slug" },
        { path: "country", select: "name code phoneCode" },
      ],
    },
    {
      path: "seller",
      select: "name email mobileNumber role profilePicture",
    },
  ]);

  // 4. Batch compute seller book ratings in a single aggregation query
  const itemsForRatings = populatedListings.map((listing) => ({
    bookId: (listing.book as { _id?: unknown })?._id || listing.book,
    sellerId: (listing.seller as { _id?: unknown })?._id || listing.seller,
    listingId: listing._id,
  }));

  const ratingMap = await getBatchListingRatingStats(itemsForRatings);

  const listings = populatedListings.map((listing) => {
    const bookObj = listing.book as unknown as BookDocument;
    const customImages = listing.listingImages ?? [];
    const resolvedImages = getMergedAndShuffledBookImages(
      bookObj?.coverImage,
      bookObj?.images,
      customImages,
    );

    const bookId = (listing.book as { _id?: unknown })?._id || listing.book;
    const sellerId = (listing.seller as { _id?: unknown })?._id || listing.seller;
    const ratingInfo = getListingRatingFromMap(ratingMap, bookId, sellerId);

    const mrpInPaise = listing.mrpInPaise ?? 0;
    const sellingPriceInPaise = listing.sellingPriceInPaise ?? 0;
    const mrp = Math.round(mrpInPaise / 100);
    const price = Math.round(sellingPriceInPaise / 100);
    const discountPercentage =
      mrpInPaise > 0
        ? Math.round(((mrpInPaise - sellingPriceInPaise) / mrpInPaise) * 100)
        : 0;

    const bookIdString = bookId?.toString() || "";
    const salesInfo = salesMap.get(bookIdString);

    const bookTitle = bookObj?.title || "";
    const bookTitleBn = bookObj?.titleBn || "";

    const authors = Array.isArray(bookObj?.authors) ? bookObj.authors : [];
    const primaryAuthorObj = authors.length > 0 ? (authors[0] as { name?: string }) : undefined;
    const authorName = primaryAuthorObj?.name || "";

    const categories = Array.isArray(bookObj?.categories) ? bookObj.categories : [];
    const primaryCategoryObj = categories.length > 0 ? (categories[0] as { name?: string }) : undefined;
    const categoryName = primaryCategoryObj?.name || "";

    const coverImageUrl = resolvedImages.coverImage || "";

    const rawBook = listing.book;
    const bookPlain =
      typeof rawBook === "object" && rawBook !== null
        ? "toObject" in rawBook && typeof (rawBook as { toObject?: () => Record<string, unknown> }).toObject === "function"
          ? (rawBook as { toObject: () => Record<string, unknown> }).toObject()
          : { ...(rawBook as unknown as Record<string, unknown>) }
        : {};

    const enrichedBook = {
      ...bookPlain,
      name: bookTitle,
      title: bookTitle,
      titleBn: bookTitleBn,
      author: authorName,
      authorName,
      authors,
      category: categoryName,
      categoryName,
      categories,
      bookcover: coverImageUrl,
      bookCover: coverImageUrl,
      coverImage: coverImageUrl,
      image: coverImageUrl,
      price,
      rating: ratingInfo.rating,
      ratings: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
    };

    return {
      ...listing,
      book: enrichedBook,
      name: bookTitle,
      title: bookTitle,
      titleBn: bookTitleBn,
      author: authorName,
      authorName,
      authors,
      category: categoryName,
      categoryName,
      categories,
      bookcover: coverImageUrl,
      bookCover: coverImageUrl,
      coverImage: coverImageUrl,
      image: coverImageUrl,
      images: resolvedImages.images,
      effectiveImages: resolvedImages.effectiveImages,
      price,
      priceInPaise: sellingPriceInPaise,
      mrp,
      mrpInPaise,
      sellingPriceInPaise,
      discountPercentage,
      rating: ratingInfo.rating,
      ratings: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
      ratingCount: ratingInfo.ratingCount,
      totalRatings: ratingInfo.totalRatings,
      totalReviews: ratingInfo.totalReviews,
      reviewCount: ratingInfo.reviewCount,
      unitsSold: salesInfo?.totalSold ?? 0,
      orderCount: salesInfo?.orderCount ?? 0,
    };
  });

  return {
    listings,
    meta: {
      page: 1,
      limit,
      total: listings.length,
      totalPages: 1,
      period,
    },
  };
};

export const getPopularNovelsService = async (
  query: BookListingQueryInput,
) => {
  const limit = query.limit && query.limit > 0 ? query.limit : 8;

  // Step 1: Resolve Novel Category ID
  let targetCategoryId: mongoose.Types.ObjectId | undefined;

  if (query.category) {
    const rawCategory = Array.isArray(query.category)
      ? query.category[0]
      : query.category;

    if (rawCategory && objectIdRegex.test(rawCategory)) {
      targetCategoryId = new mongoose.Types.ObjectId(rawCategory);
    }
  }

  if (!targetCategoryId) {
    const novelCategory = await CategoryModel.findOne({
      $or: [{ slug: "the-novel" }, { name: /novel/i }],
      isActive: true,
    })
      .select("_id")
      .lean();

    if (novelCategory) {
      targetCategoryId = novelCategory._id as mongoose.Types.ObjectId;
    }
  }

  if (!targetCategoryId) {
    return {
      listings: [],
      meta: {
        page: 1,
        limit,
        total: 0,
        totalPages: 1,
        ispopularnovel: true,
      },
    };
  }

  // Step 2: Find all active books belonging to this novel category
  const novelBooks = await BookModel.find({
    categories: targetCategoryId,
    status: "ACTIVE",
  })
    .select("_id title")
    .lean();

  if (novelBooks.length === 0) {
    return {
      listings: [],
      meta: {
        page: 1,
        limit,
        total: 0,
        totalPages: 1,
        ispopularnovel: true,
      },
    };
  }

  const novelBookIds = novelBooks.map((book) => book._id);

  // Step 3: Aggregate non-cancelled orders for these novel books
  const novelSales = await OrderModel.aggregate([
    { $match: { status: { $ne: "CANCELLED" } } },
    { $unwind: "$items" },
    {
      $match: {
        "items.book": { $in: novelBookIds },
        "items.status": { $ne: "CANCELLED" },
      },
    },
    {
      $group: {
        _id: "$items.book",
        totalSold: { $sum: "$items.quantity" },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const salesMap = new Map<string, { totalSold: number; orderCount: number }>();
  for (const item of novelSales) {
    const bookIdString = item._id.toString();
    salesMap.set(bookIdString, {
      totalSold: item.totalSold,
      orderCount: item.orderCount,
    });
  }

  // Step 4: Aggregate approved reviews for these novel books
  const novelReviews = await ReviewModel.aggregate([
    {
      $match: {
        book: { $in: novelBookIds },
        status: "APPROVED",
      },
    },
    {
      $group: {
        _id: "$book",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const reviewsMap = new Map<string, { averageRating: number; reviewCount: number }>();
  for (const rev of novelReviews) {
    const bookIdString = rev._id.toString();
    reviewsMap.set(bookIdString, {
      averageRating: rev.averageRating || 0,
      reviewCount: rev.reviewCount || 0,
    });
  }

  // Step 5: Compute composite popularity score for each novel book
  const scoredNovels: Array<{
    bookId: mongoose.Types.ObjectId;
    bookIdString: string;
    totalSold: number;
    orderCount: number;
    averageRating: number;
    reviewCount: number;
    popularityScore: number;
  }> = [];

  for (const book of novelBooks) {
    const bookIdString = book._id.toString();
    const sales = salesMap.get(bookIdString);
    const review = reviewsMap.get(bookIdString);

    const totalSold = sales ? sales.totalSold : 0;
    const orderCount = sales ? sales.orderCount : 0;
    const rawAverageRating = review ? review.averageRating : 0;
    const averageRating = Math.round(rawAverageRating * 10) / 10;
    const reviewCount = review ? review.reviewCount : 0;

    // Readable transparent popularity score:
    // - Each unit sold adds 10 points
    // - Each order adds 5 points
    // - Star ratings weighted with review volume
    const salesScore = (totalSold * 10) + (orderCount * 5);
    const ratingScore = (averageRating * 4) + (reviewCount * 2);
    const popularityScore = salesScore + ratingScore;

    scoredNovels.push({
      bookId: book._id as mongoose.Types.ObjectId,
      bookIdString,
      totalSold,
      orderCount,
      averageRating,
      reviewCount,
      popularityScore,
    });
  }

  // Sort novels: highest popularity score first, then sales, then ratings
  scoredNovels.sort((a, b) => {
    if (b.popularityScore !== a.popularityScore) {
      return b.popularityScore - a.popularityScore;
    }
    if (b.totalSold !== a.totalSold) {
      return b.totalSold - a.totalSold;
    }
    return b.averageRating - a.averageRating;
  });

  const popularBookIds = scoredNovels.map((item) => item.bookId);

  // Step 6: Match active listings for the popular novel books
  // Deduplicate by distinct book title, prioritizing in-stock and best selling price
  const matchedListings = await BookListingModel.aggregate([
    {
      $match: {
        book: { $in: popularBookIds },
        isActive: true,
      },
    },
    {
      $lookup: {
        from: "books",
        localField: "book",
        foreignField: "_id",
        as: "bookDoc",
      },
    },
    {
      $unwind: {
        path: "$bookDoc",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $match: {
        "bookDoc.status": "ACTIVE",
      },
    },
    {
      $sort: {
        stock: -1,
        sellingPriceInPaise: 1,
        _id: 1,
      },
    },
    {
      $group: {
        _id: { $ifNull: ["$bookDoc.title", "$book"] },
        listing: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$listing" } },
    { $project: { bookDoc: 0 } },
  ]);

  // Order matched listings to follow the exact popular ranking
  const rankMap = new Map<string, number>();
  for (let i = 0; i < scoredNovels.length; i++) {
    rankMap.set(scoredNovels[i].bookIdString, i);
  }

  matchedListings.sort((a, b) => {
    const bookA = a.book ? a.book.toString() : "";
    const bookB = b.book ? b.book.toString() : "";
    const rankA = rankMap.has(bookA) ? rankMap.get(bookA)! : 9999;
    const rankB = rankMap.has(bookB) ? rankMap.get(bookB)! : 9999;
    return rankA - rankB;
  });

  let rawListings = matchedListings;

  // Step 7: Graceful backfill if fewer than limit (e.g. 8) distinct novel listings
  if (rawListings.length < limit) {
    const existingBookIds = rawListings.map((l) => l.book);
    const needed = limit - rawListings.length;

    const fallbackListings = await BookListingModel.aggregate([
      {
        $match: {
          isActive: true,
          book: { $nin: existingBookIds },
        },
      },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      {
        $unwind: {
          path: "$bookDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "bookDoc.categories": targetCategoryId,
          "bookDoc.status": "ACTIVE",
        },
      },
      {
        $sort: {
          stock: -1,
          sellingPriceInPaise: 1,
          _id: 1,
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$bookDoc.title", "$book"] },
          listing: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$listing" } },
      { $project: { bookDoc: 0 } },
      { $limit: needed },
    ]);

    rawListings.push(...fallbackListings);
  }

  const selectedRawListings = rawListings.slice(0, limit);

  // Step 8: Populate canonical book details and seller details
  const populatedListings = await BookListingModel.populate(selectedRawListings, [
    {
      path: "book",
      populate: [
        { path: "authors", select: "name nameBn slug photo" },
        { path: "publisher", select: "name nameBn slug logo" },
        { path: "categories", select: "name nameBn slug" },
        { path: "country", select: "name code phoneCode" },
      ],
    },
    {
      path: "seller",
      select: "name email mobileNumber role profilePicture",
    },
  ]);

  // Step 9: Batch compute ratings for seller listings
  const itemsForRatings = populatedListings.map((listing) => ({
    bookId: (listing.book as { _id?: unknown })?._id || listing.book,
    sellerId: (listing.seller as { _id?: unknown })?._id || listing.seller,
    listingId: listing._id,
  }));

  const ratingMap = await getBatchListingRatingStats(itemsForRatings);

  // Step 10: Map listings into buyer-facing cards with all required fields
  const scoresByBookId = new Map<string, { totalSold: number; orderCount: number; popularityScore: number }>();
  for (const s of scoredNovels) {
    scoresByBookId.set(s.bookIdString, {
      totalSold: s.totalSold,
      orderCount: s.orderCount,
      popularityScore: s.popularityScore,
    });
  }

  const listings = populatedListings.map((listing) => {
    const bookObj = listing.book as unknown as BookDocument;
    const customImages = listing.listingImages ?? [];
    const resolvedImages = getMergedAndShuffledBookImages(
      bookObj?.coverImage,
      bookObj?.images,
      customImages,
    );

    const bookId = (listing.book as { _id?: unknown })?._id || listing.book;
    const sellerId = (listing.seller as { _id?: unknown })?._id || listing.seller;
    const ratingInfo = getListingRatingFromMap(ratingMap, bookId, sellerId);

    const mrpInPaise = listing.mrpInPaise ?? 0;
    const sellingPriceInPaise = listing.sellingPriceInPaise ?? 0;
    const mrp = Math.round(mrpInPaise / 100);
    const price = Math.round(sellingPriceInPaise / 100);
    const discountPercentage =
      mrpInPaise > 0
        ? Math.round(((mrpInPaise - sellingPriceInPaise) / mrpInPaise) * 100)
        : 0;

    const bookIdString = bookId ? bookId.toString() : "";
    const scoreData = scoresByBookId.get(bookIdString);

    const bookTitle = bookObj?.title || "";
    const bookTitleBn = bookObj?.titleBn || "";

    const authors = Array.isArray(bookObj?.authors) ? bookObj.authors : [];
    const primaryAuthorObj = authors.length > 0 ? (authors[0] as { name?: string }) : undefined;
    const authorName = primaryAuthorObj?.name || "";

    const categories = Array.isArray(bookObj?.categories) ? bookObj.categories : [];
    const primaryCategoryObj = categories.length > 0 ? (categories[0] as { name?: string }) : undefined;
    const categoryName = primaryCategoryObj?.name || "";

    const coverImageUrl = resolvedImages.coverImage || "";

    const rawBook = listing.book;
    const bookPlain =
      typeof rawBook === "object" && rawBook !== null
        ? "toObject" in rawBook && typeof (rawBook as { toObject?: () => Record<string, unknown> }).toObject === "function"
          ? (rawBook as { toObject: () => Record<string, unknown> }).toObject()
          : { ...(rawBook as unknown as Record<string, unknown>) }
        : {};

    const enrichedBook = {
      ...bookPlain,
      name: bookTitle,
      title: bookTitle,
      titleBn: bookTitleBn,
      author: authorName,
      authorName,
      authors,
      category: categoryName,
      categoryName,
      categories,
      bookcover: coverImageUrl,
      bookCover: coverImageUrl,
      coverImage: coverImageUrl,
      image: coverImageUrl,
      price,
      rating: ratingInfo.rating,
      ratings: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
    };

    return {
      ...listing,
      book: enrichedBook,
      name: bookTitle,
      title: bookTitle,
      titleBn: bookTitleBn,
      author: authorName,
      authorName,
      authors,
      category: categoryName,
      categoryName,
      categories,
      bookcover: coverImageUrl,
      bookCover: coverImageUrl,
      coverImage: coverImageUrl,
      image: coverImageUrl,
      images: resolvedImages.images,
      effectiveImages: resolvedImages.effectiveImages,
      price,
      priceInPaise: sellingPriceInPaise,
      mrp,
      mrpInPaise,
      sellingPriceInPaise,
      discountPercentage,
      rating: ratingInfo.rating,
      ratings: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
      ratingCount: ratingInfo.ratingCount,
      totalRatings: ratingInfo.totalRatings,
      totalReviews: ratingInfo.totalReviews,
      reviewCount: ratingInfo.reviewCount,
      unitsSold: scoreData?.totalSold ?? 0,
      orderCount: scoreData?.orderCount ?? 0,
      popularityScore: scoreData?.popularityScore ?? 0,
    };
  });

  return {
    listings,
    meta: {
      page: 1,
      limit,
      total: listings.length,
      totalPages: 1,
      ispopularnovel: true,
    },
  };
};

export const getBookListingsService = async (query: BookListingQueryInput) => {
  if (query.bestsellers) {
    return getThisWeekBestsellersService({
      limit: query.limit,
      period: query.period || "week",
    });
  }

  if (query.ispopularnovel) {
    return getPopularNovelsService(query);
  }

  const filter: Record<string, unknown> = {};

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  } else {
    filter.isActive = true;
  }

  if (query.seller) {
    filter.seller = mongoose.Types.ObjectId.isValid(query.seller)
      ? new mongoose.Types.ObjectId(query.seller)
      : query.seller;
  }

  if (query.book) {
    filter.book = mongoose.Types.ObjectId.isValid(query.book)
      ? new mongoose.Types.ObjectId(query.book)
      : query.book;
  }

  // Price filters in paise
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {};
    if (query.minPrice !== undefined) {
      priceFilter.$gte = Math.round(query.minPrice * 100);
    }
    if (query.maxPrice !== undefined) {
      priceFilter.$lte = Math.round(query.maxPrice * 100);
    }
    filter.sellingPriceInPaise = priceFilter;
  }

  // Build canonical book filter for metadata search/filtering (only active books by default)
  //
  const bookFilter: Record<string, unknown> = {
    status: "ACTIVE",
  };
  let filterBooksNeeded = true;

  if (query.category && query.category.length > 0) {
    const validIds = query.category.filter((id) => objectIdRegex.test(id));
    const matchedCategories = await CategoryModel.find({
      $or: [
        ...(validIds.length > 0 ? [{ _id: { $in: validIds } }] : []),
        { slug: { $in: query.category.map((s) => s.toLowerCase()) } },
      ],
    })
      .select("_id")
      .lean();
    const allCatIds = Array.from(
      new Set([...validIds, ...matchedCategories.map((c) => c._id.toString())]),
    );
    bookFilter.categories = { $in: allCatIds };
  }

  if (query.author && query.author.length > 0) {
    const validIds = query.author.filter((id) => objectIdRegex.test(id));
    const matchedAuthors = await AuthorModel.find({
      isDel: { $ne: true },
      $or: [
        ...(validIds.length > 0 ? [{ _id: { $in: validIds } }] : []),
        { slug: { $in: query.author.map((s) => s.toLowerCase()) } },
      ],
    })
      .select("_id")
      .lean();
    const allAuthorIds = Array.from(
      new Set([...validIds, ...matchedAuthors.map((a) => a._id.toString())]),
    );
    bookFilter.authors = { $in: allAuthorIds };
  }

  if (query.publisher && query.publisher.length > 0) {
    const validIds = query.publisher.filter((id) => objectIdRegex.test(id));
    const matchedPublishers = await PublisherModel.find({
      $or: [
        ...(validIds.length > 0 ? [{ _id: { $in: validIds } }] : []),
        { slug: { $in: query.publisher.map((s) => s.toLowerCase()) } },
      ],
    })
      .select("_id")
      .lean();
    const allPublisherIds = Array.from(
      new Set([...validIds, ...matchedPublishers.map((p) => p._id.toString())]),
    );
    bookFilter.publisher = { $in: allPublisherIds };
  }

  if (query.country && query.country.length > 0) {
    const validIds = query.country.filter((id) => objectIdRegex.test(id));
    const matchedCountries = await CountryModel.find({
      $or: [
        ...(validIds.length > 0 ? [{ _id: { $in: validIds } }] : []),
        { code: { $in: query.country.map((c) => c.toUpperCase()) } },
      ],
    })
      .select("_id")
      .lean();
    const allCountryIds = Array.from(
      new Set([...validIds, ...matchedCountries.map((c) => c._id.toString())]),
    );
    bookFilter.country = { $in: allCountryIds };
  }

  if (query.language) {
    bookFilter.language = query.language;
  }

  if (query.search) {
    const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedSearch, "i");
    bookFilter.$or = [
      { title: searchRegex },
      { titleBn: searchRegex },
      { isbn: searchRegex },
      { searchTags: searchRegex },
      { description: searchRegex },
    ];
  }

  if (filterBooksNeeded) {
    const matchingBookIds = await BookModel.find(bookFilter).distinct("_id");
    if (matchingBookIds.length === 0) {
      return {
        listings: [],
        meta: {
          page: query.page,
          limit: query.limit,
          total: 0,
          totalPages: 1,
        },
      };
    }
    if (filter.book) {
      const specifiedBookId = filter.book.toString();
      if (!matchingBookIds.some((id) => id.toString() === specifiedBookId)) {
        return {
          listings: [],
          meta: {
            page: query.page,
            limit: query.limit,
            total: 0,
            totalPages: 1,
          },
        };
      }
    } else {
      filter.book = { $in: matchingBookIds };
    }
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;
  const sortDir: 1 | -1 = query.sortOrder === "asc" ? 1 : -1;

  let rawListings: any[];
  let total = 0;

  const isTitleSort = query.sortBy === "title";
  const sortField = isTitleSort ? "bookDoc.title" : query.sortBy;

  const shouldShuffleHomepage = query.homepage && !query.hasExplicitSort;

  if (shouldShuffleHomepage) {
    const aggregatePipeline: any[] = [
      { $match: filter },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      {
        $unwind: {
          path: "$bookDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          stock: -1,
          sellingPriceInPaise: 1,
          _id: 1,
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$bookDoc.title", "$book"] },
          listing: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$listing" } },
      { $project: { bookDoc: 0 } },
      { $sample: { size: limit } },
    ];

    const [aggregatedListings, totalCountResult] = await Promise.all([
      BookListingModel.aggregate(aggregatePipeline),
      BookListingModel.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "books",
            localField: "book",
            foreignField: "_id",
            as: "bookDoc",
          },
        },
        {
          $unwind: {
            path: "$bookDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$bookDoc.title", "$book"] },
          },
        },
        { $count: "total" },
      ]),
    ]);

    rawListings = await BookListingModel.populate(aggregatedListings, [
      {
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
          { path: "country", select: "name code phoneCode" },
        ],
      },
      {
        path: "seller",
        select: "name email mobileNumber role profilePicture",
      },
    ]);

    total = totalCountResult[0]?.total ?? 0;
  } else if (query.homesection) {
    const aggregatePipeline: any[] = [
      { $match: filter },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      {
        $unwind: {
          path: "$bookDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          stock: -1,
          [sortField]: sortDir,
          _id: 1,
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$bookDoc.title", "$book"] },
          listing: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$listing" } },
      { $sort: { [sortField]: sortDir, _id: 1 } },
      { $project: { bookDoc: 0 } },
    ];

    const [aggregatedListings, totalCountResult] = await Promise.all([
      BookListingModel.aggregate([
        ...aggregatePipeline,
        { $skip: skip },
        { $limit: limit },
      ]),
      BookListingModel.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "books",
            localField: "book",
            foreignField: "_id",
            as: "bookDoc",
          },
        },
        {
          $unwind: {
            path: "$bookDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$bookDoc.title", "$book"] },
          },
        },
        { $count: "total" },
      ]),
    ]);

    rawListings = await BookListingModel.populate(aggregatedListings, [
      {
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
          { path: "country", select: "name code phoneCode" },
        ],
      },
      {
        path: "seller",
        select: "name email mobileNumber role profilePicture",
      },
    ]);

    total = totalCountResult[0]?.total ?? 0;
  } else if (isTitleSort) {
    const [aggregatedListings, count] = await Promise.all([
      BookListingModel.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "books",
            localField: "book",
            foreignField: "_id",
            as: "bookDoc",
          },
        },
        {
          $unwind: {
            path: "$bookDoc",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $sort: { "bookDoc.title": sortDir, _id: 1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { bookDoc: 0 } },
      ]),
      BookListingModel.countDocuments(filter),
    ]);

    rawListings = await BookListingModel.populate(aggregatedListings, [
      {
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
          { path: "country", select: "name code phoneCode" },
        ],
      },
      {
        path: "seller",
        select: "name email mobileNumber role profilePicture",
      },
    ]);

    total = count;
  } else {
    const [findResults, count] = await Promise.all([
      BookListingModel.find(filter)
        .populate({
          path: "book",
          populate: [
            { path: "authors", select: "name nameBn slug photo" },
            { path: "publisher", select: "name nameBn slug logo" },
            { path: "categories", select: "name nameBn slug" },
            { path: "country", select: "name code phoneCode" },
          ],
        })
        .populate("seller", "name email mobileNumber role profilePicture")
        .sort({ [query.sortBy]: sortDir, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BookListingModel.countDocuments(filter),
    ]);

    rawListings = findResults;
    total = count;
  }

  // Batch compute seller book ratings in a single aggregation query
  const itemsForRatings = rawListings.map((listing) => ({
    bookId: (listing.book as { _id?: unknown })?._id || listing.book,
    sellerId: (listing.seller as { _id?: unknown })?._id || listing.seller,
    listingId: listing._id,
  }));

  const ratingMap = await getBatchListingRatingStats(itemsForRatings);

  // Format listings with dynamic effectiveImages fallback and seller book ratings
  const listings = rawListings.map((listing) => {
    const bookObj = listing.book as unknown as BookDocument;
    const customImages = listing.listingImages ?? [];
    const resolvedImages = getMergedAndShuffledBookImages(
      bookObj?.coverImage,
      bookObj?.images,
      customImages,
    );

    const bookId = (listing.book as { _id?: unknown })?._id || listing.book;
    const sellerId = (listing.seller as { _id?: unknown })?._id || listing.seller;
    const ratingInfo = getListingRatingFromMap(ratingMap, bookId, sellerId);

    const mrpInPaise = listing.mrpInPaise ?? 0;
    const sellingPriceInPaise = listing.sellingPriceInPaise ?? 0;
    const mrp = Math.round(mrpInPaise / 100);
    const price = Math.round(sellingPriceInPaise / 100);
    const discountPercentage =
      mrpInPaise > 0
        ? Math.round(((mrpInPaise - sellingPriceInPaise) / mrpInPaise) * 100)
        : 0;

    const bookTitle = bookObj?.title || "";
    const bookTitleBn = bookObj?.titleBn || "";

    const authors = Array.isArray(bookObj?.authors) ? bookObj.authors : [];
    const primaryAuthorObj = authors.length > 0 ? (authors[0] as { name?: string }) : undefined;
    const authorName = primaryAuthorObj?.name || "";

    const categories = Array.isArray(bookObj?.categories) ? bookObj.categories : [];
    const primaryCategoryObj = categories.length > 0 ? (categories[0] as { name?: string }) : undefined;
    const categoryName = primaryCategoryObj?.name || "";

    const coverImageUrl = resolvedImages.coverImage || "";

    const rawBook = listing.book;
    const bookPlain =
      typeof rawBook === "object" && rawBook !== null
        ? "toObject" in rawBook && typeof (rawBook as { toObject?: () => Record<string, unknown> }).toObject === "function"
          ? (rawBook as { toObject: () => Record<string, unknown> }).toObject()
          : { ...(rawBook as unknown as Record<string, unknown>) }
        : {};

    const enrichedBook = {
      ...bookPlain,
      name: bookTitle,
      title: bookTitle,
      titleBn: bookTitleBn,
      author: authorName,
      authorName,
      authors,
      category: categoryName,
      categoryName,
      categories,
      bookcover: coverImageUrl,
      bookCover: coverImageUrl,
      coverImage: coverImageUrl,
      image: coverImageUrl,
      price,
      rating: ratingInfo.rating,
      ratings: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
    };

    return {
      ...listing,
      book: enrichedBook,
      name: bookTitle,
      title: bookTitle,
      titleBn: bookTitleBn,
      author: authorName,
      authorName,
      authors,
      category: categoryName,
      categoryName,
      categories,
      bookcover: coverImageUrl,
      bookCover: coverImageUrl,
      coverImage: coverImageUrl,
      image: coverImageUrl,
      images: resolvedImages.images,
      effectiveImages: resolvedImages.effectiveImages,
      price,
      priceInPaise: sellingPriceInPaise,
      mrp,
      mrpInPaise,
      sellingPriceInPaise,
      discountPercentage,
      rating: ratingInfo.rating,
      ratings: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
      ratingCount: ratingInfo.ratingCount,
      totalRatings: ratingInfo.totalRatings,
      totalReviews: ratingInfo.totalReviews,
      reviewCount: ratingInfo.reviewCount,
    };
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    listings,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const getBookListingByIdService = async (
  id: string,
  userId?: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const listing = await BookListingModel.findById(id)
    .populate({
      path: "book",
      populate: [
        { path: "authors", select: "name nameBn slug photo bio" },
        { path: "publisher", select: "name nameBn slug logo website" },
        { path: "categories", select: "name nameBn slug description" },
        { path: "country", select: "name code phoneCode currency" },
      ],
    })
    .populate("seller", "name email mobileNumber role profilePicture")
    .lean();

  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  const bookObj = listing.book as unknown as BookDocument;
  const customImages = listing.listingImages ?? [];
  const resolvedImages = getMergedAndShuffledBookImages(
    bookObj?.coverImage,
    bookObj?.images,
    customImages,
  );

  const bookId = (listing.book as { _id?: unknown })?._id || listing.book;
  const sellerId = (listing.seller as { _id?: unknown })?._id || listing.seller;

  let reviewStats = {
    averageRating: 0,
    totalReviews: 0,
    ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    ratingPercentages: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  };

  if (
    bookId &&
    sellerId &&
    mongoose.Types.ObjectId.isValid(String(bookId)) &&
    mongoose.Types.ObjectId.isValid(String(sellerId))
  ) {
    reviewStats = await calculateReviewStats(
      new mongoose.Types.ObjectId(String(bookId)),
      new mongoose.Types.ObjectId(String(sellerId)),
    );
  }

  let isWishlisted = false;

  if (userId && mongoose.Types.ObjectId.isValid(userId) && bookId) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const bookObjectId = new mongoose.Types.ObjectId(String(bookId));

    const exists = await WishlistModel.exists({
      user: userObjectId,
      "items.book": bookObjectId,
    });

    isWishlisted = Boolean(exists);
  }

  const mrpInPaise = listing.mrpInPaise ?? 0;
  const sellingPriceInPaise = listing.sellingPriceInPaise ?? 0;
  const mrp = Math.round(mrpInPaise / 100);
  const price = Math.round(sellingPriceInPaise / 100);
  const discountPercentage =
    mrpInPaise > 0
      ? Math.round(((mrpInPaise - sellingPriceInPaise) / mrpInPaise) * 100)
      : 0;

  return {
    ...listing,
    isWishlisted,
    price,
    priceInPaise: sellingPriceInPaise,
    mrp,
    mrpInPaise,
    sellingPriceInPaise,
    discountPercentage,
    coverImage: resolvedImages.coverImage,
    images: resolvedImages.images,
    effectiveImages: resolvedImages.effectiveImages,
    rating: reviewStats.averageRating,
    averageRating: reviewStats.averageRating,
    ratingCount: reviewStats.totalReviews,
    totalRatings: reviewStats.totalReviews,
    totalReviews: reviewStats.totalReviews,
    reviewCount: reviewStats.totalReviews,
    ratingBreakdown: reviewStats.ratingBreakdown,
    ratingPercentages: reviewStats.ratingPercentages,
  };
};

export const createBookListingService = async (
  rawInput: CreateBookListingInput,
  sellerId: string,
) => {
  const input = createBookListingSchema.parse(rawInput);

  // 1. Verify seller exists, is active, and has role SELLER or ADMIN
  const seller = await UserModel.findById(sellerId).lean();
  if (!seller) {
    throw new AppError("Seller account not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!seller.isActive) {
    throw new AppError("Seller account is inactive", HTTP_STATUS.FORBIDDEN);
  }

  if (seller.role !== "SELLER" && seller.role !== "ADMIN") {
    throw new AppError(
      "Only active users with role SELLER can create book listings",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  // 2. Resolve or create Book directly
  let targetBookId: mongoose.Types.ObjectId | null = null;

  if (input.book && mongoose.Types.ObjectId.isValid(input.book)) {
    targetBookId = new mongoose.Types.ObjectId(input.book);
  }

  if (!targetBookId) {
    if (!input.title) {
      throw new AppError("Book title is required", HTTP_STATUS.BAD_REQUEST);
    }

    // Validate International ISBN Agency standards
    await validateIsbnStandards(input.isbn, {
      publisher: input.publisher,
      format: input.format,
      language: input.language,
      edition: input.edition,
    });

    const baseSlug = slugify(input.title) || "-";
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
    const resolvedCountryId = await resolveCountryId(input.country);
    const bookPrice = Math.round(input.mrpInPaise / 100);

    const newBook = new BookModel({
      title: input.title,
      titleBn: input.titleBn,
      slug: uniqueSlug,
      isbn: input.isbn?.trim() || undefined,
      publisher: input.publisher ? new mongoose.Types.ObjectId(input.publisher) : undefined,
      authors: input.authors ? input.authors.map((id) => new mongoose.Types.ObjectId(id)) : [],
      categories: input.categories ? input.categories.map((id) => new mongoose.Types.ObjectId(id)) : [],
      country: resolvedCountryId,
      language: input.language || "-",
      description: input.description || "",
      coverImage: input.coverImage || "",
      images: input.images || [],
      pages: input.pages,
      edition: input.edition,
      format: input.format || "PAPERBACK",
      searchTags: input.searchTags || [],
      price: bookPrice,
      priceIn: bookPrice,
      createdBy: new mongoose.Types.ObjectId(sellerId),
    });

    await newBook.save();
    targetBookId = newBook._id as mongoose.Types.ObjectId;
  }

  // 3. Prevent duplicate listing by same seller on the same book
  const existingListing = await BookListingModel.findOne({
    book: targetBookId,
    seller: new mongoose.Types.ObjectId(sellerId),
  }).lean();

  if (existingListing) {
    throw new AppError(
      "You already have an active listing for this book. Update your existing listing instead.",
      HTTP_STATUS.CONFLICT,
    );
  }

  // 4. Create listing directly
  const newListing = new BookListingModel({
    book: targetBookId,
    seller: new mongoose.Types.ObjectId(sellerId),
    mrpInPaise: input.mrpInPaise,
    sellingPriceInPaise: input.sellingPriceInPaise,
    stock: input.stock ?? 0,
    sku: input.sku,
    listingImages: input.listingImages ?? [],
    isActive: input.isActive ?? true,
  });

  await newListing.save();

  logger.info(
    {
      listingId: newListing._id,
      bookId: targetBookId,
      sellerId,
      sellingPriceInPaise: input.sellingPriceInPaise,
    },
    "Book listing created successfully",
  );

  return newListing;
};

export const updateBookListingService = async (
  id: string,
  userContext: { id: string; role: string },
  rawInput: UpdateBookListingInput,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const input = updateBookListingSchema.parse(rawInput);

  const listing = await BookListingModel.findById(id);
  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  // Verify ownership
  if (userContext.role !== "ADMIN" && listing.seller.toString() !== userContext.id) {
    throw new AppError(
      "Forbidden: You do not own this book listing",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  const targetMrp = input.mrpInPaise !== undefined ? input.mrpInPaise : listing.mrpInPaise;
  const targetSellingPrice =
    input.sellingPriceInPaise !== undefined
      ? input.sellingPriceInPaise
      : listing.sellingPriceInPaise;

  if (targetSellingPrice > targetMrp) {
    throw new AppError(
      "Selling price cannot exceed MRP",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  if (input.mrpInPaise !== undefined) listing.mrpInPaise = input.mrpInPaise;
  if (input.sellingPriceInPaise !== undefined)
    listing.sellingPriceInPaise = input.sellingPriceInPaise;
  if (input.stock !== undefined) listing.stock = input.stock;
  if (input.sku !== undefined) listing.sku = input.sku;
  if (input.listingImages !== undefined) listing.listingImages = input.listingImages;
  if (input.isActive !== undefined) listing.isActive = input.isActive;

  await listing.save();

  logger.info({ listingId: listing._id }, "Book listing updated successfully");

  return listing;
};

export const deleteBookListingService = async (
  id: string,
  userContext: { id: string; role: string },
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const listing = await BookListingModel.findById(id);
  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  // Verify ownership
  if (userContext.role !== "ADMIN" && listing.seller.toString() !== userContext.id) {
    throw new AppError(
      "Forbidden: You do not own this book listing",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  await BookListingModel.deleteOne({ _id: listing._id });

  logger.info({ listingId: id }, "Book listing deleted successfully");
};

export const getMyBookListingsService = async (
  sellerId: string,
  rawQuery: MyBookListingQueryInput = {},
) => {
  const query = myBookListingQuerySchema.parse(rawQuery);

  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new AppError("Invalid seller ID", HTTP_STATUS.BAD_REQUEST);
  }

  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
  const filter: Record<string, unknown> = {
    seller: sellerObjectId,
  };

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  }

  if (query.inStock !== undefined) {
    if (query.inStock) {
      filter.stock = { $gt: 0 };
    } else {
      filter.stock = 0;
    }
  }

  if (query.search) {
    const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedSearch, "i");

    const matchingBookIds = await BookModel.find({
      $or: [
        { title: searchRegex },
        { titleBn: searchRegex },
        { isbn: searchRegex },
        { searchTags: searchRegex },
        { description: searchRegex },
      ],
    }).distinct("_id");

    filter.$or = [
      { book: { $in: matchingBookIds } },
      { sku: searchRegex },
    ];
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;
  const sortDir: 1 | -1 = query.sortOrder === "asc" ? 1 : -1;

  const isTitleSort = query.sortBy === "title";
  let rawListings: any[];
  let total = 0;

  if (isTitleSort) {
    const aggregatePipeline: any[] = [
      { $match: filter },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      {
        $unwind: {
          path: "$bookDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { "bookDoc.title": sortDir, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { bookDoc: 0 } },
    ];

    const [aggregatedListings, count] = await Promise.all([
      BookListingModel.aggregate(aggregatePipeline),
      BookListingModel.countDocuments(filter),
    ]);

    rawListings = await BookListingModel.populate(aggregatedListings, [
      {
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
          { path: "country", select: "name code phoneCode" },
        ],
      },
      {
        path: "seller",
        select: "name email mobileNumber role profilePicture",
      },
    ]);

    total = count;
  } else {
    const [findResults, count] = await Promise.all([
      BookListingModel.find(filter)
        .populate({
          path: "book",
          populate: [
            { path: "authors", select: "name nameBn slug photo" },
            { path: "publisher", select: "name nameBn slug logo" },
            { path: "categories", select: "name nameBn slug" },
            { path: "country", select: "name code phoneCode" },
          ],
        })
        .populate("seller", "name email mobileNumber role profilePicture")
        .sort({ [query.sortBy]: sortDir, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BookListingModel.countDocuments(filter),
    ]);

    rawListings = findResults;
    total = count;
  }

  const itemsForRatings = rawListings.map((listing) => ({
    bookId: (listing.book as { _id?: unknown })?._id || listing.book,
    sellerId: (listing.seller as { _id?: unknown })?._id || listing.seller,
    listingId: listing._id,
  }));

  const ratingMap = await getBatchListingRatingStats(itemsForRatings);

  const listings = rawListings.map((listing) => {
    const bookObj = listing.book as unknown as BookDocument;
    const customImages = listing.listingImages ?? [];
    const resolvedImages = getMergedAndShuffledBookImages(
      bookObj?.coverImage,
      bookObj?.images,
      customImages,
    );

    const bookId = (listing.book as { _id?: unknown })?._id || listing.book;
    const itemSellerId = (listing.seller as { _id?: unknown })?._id || listing.seller;
    const ratingInfo = getListingRatingFromMap(ratingMap, bookId, itemSellerId);

    return {
      ...listing,
      coverImage: resolvedImages.coverImage,
      images: resolvedImages.images,
      effectiveImages: resolvedImages.effectiveImages,
      rating: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
      ratingCount: ratingInfo.ratingCount,
      totalRatings: ratingInfo.totalRatings,
      totalReviews: ratingInfo.totalReviews,
      reviewCount: ratingInfo.reviewCount,
    };
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    listings,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const updateListingStockService = async (
  listingId: string,
  userContext: { id: string; role: string },
  rawInput: UpdateStockInput,
) => {
  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    throw new AppError("Invalid listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const input = updateStockSchema.parse(rawInput);
  const operation = input.operation;
  const quantity = input.quantity;

  const listing = await BookListingModel.findById(listingId);
  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  // Verify ownership
  const isOwner = listing.seller.toString() === userContext.id;
  const isAdmin = userContext.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw new AppError(
      "Forbidden: You do not own this book listing",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  let updatedListing: any = null;

  if (operation === "increase") {
    updatedListing = await BookListingModel.findOneAndUpdate(
      {
        _id: listingId,
      },
      {
        $inc: { stock: quantity },
      },
      {
        returnDocument: "after",
      },
    )
      .populate({
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
          { path: "country", select: "name code phoneCode" },
        ],
      })
      .populate("seller", "name email mobileNumber role profilePicture")
      .lean();
  } else if (operation === "decrease") {
    // Atomic decrease preventing negative stock
    updatedListing = await BookListingModel.findOneAndUpdate(
      {
        _id: listingId,
        stock: { $gte: quantity },
      },
      {
        $inc: { stock: -quantity },
      },
      {
        returnDocument: "after",
      },
    )
      .populate({
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
          { path: "country", select: "name code phoneCode" },
        ],
      })
      .populate("seller", "name email mobileNumber role profilePicture")
      .lean();

    if (!updatedListing) {
      const currentListing = await BookListingModel.findById(listingId).lean();
      const currentStock = currentListing?.stock ?? 0;
      throw new AppError(
        `Insufficient stock: Cannot decrease by ${quantity} because current stock is ${currentStock}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  } else if (operation === "set") {
    updatedListing = await BookListingModel.findOneAndUpdate(
      {
        _id: listingId,
      },
      {
        $set: { stock: quantity },
      },
      {
        returnDocument: "after",
      },
    )
      .populate({
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
          { path: "country", select: "name code phoneCode" },
        ],
      })
      .populate("seller", "name email mobileNumber role profilePicture")
      .lean();
  }

  if (!updatedListing) {
    throw new AppError("Failed to update stock", HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const bookObj = updatedListing.book as unknown as BookDocument;
  const customImages = updatedListing.listingImages ?? [];
  const resolvedImages = getMergedAndShuffledBookImages(
    bookObj?.coverImage,
    bookObj?.images,
    customImages,
  );

  logger.info(
    {
      listingId,
      operation,
      quantity,
      newStock: updatedListing.stock,
      userId: userContext.id,
    },
    "Listing stock updated successfully",
  );

  return {
    ...updatedListing,
    coverImage: resolvedImages.coverImage,
    images: resolvedImages.images,
    effectiveImages: resolvedImages.effectiveImages,
  };
};

export const toggleBookListingStatusService = async (
  listingId: string,
  userContext: { id: string; role: string },
  newStatus?: boolean,
) => {
  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    throw new AppError("Invalid listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const listing = await BookListingModel.findById(listingId);
  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  // Verify ownership
  const isOwner = listing.seller.toString() === userContext.id;
  const isAdmin = userContext.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw new AppError(
      "Forbidden: You do not own this book listing",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  const updatedIsActive =
    newStatus !== undefined ? newStatus : !listing.isActive;

  listing.isActive = updatedIsActive;
  await listing.save();

  logger.info(
    {
      listingId: listing._id,
      isActive: listing.isActive,
      userId: userContext.id,
    },
    "Book listing status toggled successfully",
  );

  return listing;
};

export const applyListingDiscountService = async (
  listingId: string,
  userContext: { id: string; role: string },
  input: ApplyListingDiscountInput,
) => {
  const isValidId = mongoose.Types.ObjectId.isValid(listingId);
  if (!isValidId) {
    throw new AppError("Invalid listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const listing = await BookListingModel.findById(listingId);
  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  const isOwner = listing.seller.toString() === userContext.id;
  const isAdmin = userContext.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw new AppError(
      "Forbidden: You do not own this book listing",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  // 1. Resolve MRP (use new MRP if provided, otherwise existing listing MRP)
  let mrpInPaise = listing.mrpInPaise;

  if (input.mrpInPaise !== undefined) {
    mrpInPaise = input.mrpInPaise;
  } else if (input.mrp !== undefined) {
    mrpInPaise = Math.round(input.mrp * 100);
  }

  if (mrpInPaise <= 0) {
    throw new AppError(
      "Cannot calculate discount: MRP must be greater than 0",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // 2. Calculate discount amount in paise based on MRP
  const discountType = input.discountType;
  const discountValue = input.discountValue;

  let discountAmountInPaise = 0;

  if (discountType === "PERCENTAGE") {
    const discountPercentage = discountValue;
    discountAmountInPaise = Math.round((mrpInPaise * discountPercentage) / 100);
  } else {
    const flatDiscountInRupees = discountValue;
    discountAmountInPaise = Math.round(flatDiscountInRupees * 100);
  }

  if (discountAmountInPaise > mrpInPaise) {
    throw new AppError(
      "Discount amount cannot exceed MRP",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // 3. Calculate new selling price
  const newSellingPriceInPaise = mrpInPaise - discountAmountInPaise;

  // 4. Update and persist listing
  listing.mrpInPaise = mrpInPaise;
  listing.sellingPriceInPaise = newSellingPriceInPaise;

  await listing.save();

  logger.info(
    {
      listingId: listing._id,
      mrpInPaise,
      newSellingPriceInPaise,
      discountType,
      discountValue,
      discountAmountInPaise,
    },
    "Listing discount applied and selling price updated successfully",
  );

  return listing;
};





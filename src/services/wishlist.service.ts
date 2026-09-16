import mongoose from "mongoose";

import { WishlistModel } from "../models/wishlist.model.js";
import { BookModel, type BookDocument } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import {
  getBatchListingRatingStats,
  getListingRatingFromMap,
} from "./review.service.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import { getMergedAndShuffledBookImages } from "../utils/image.helper.js";
import type {
  AddToWishlistInput,
  SyncWishlistInput,
} from "../validation/wishlist.schema.js";

export const getWishlistService = async (userId: string) => {
  let wishlist: any = await WishlistModel.findOne({ user: userId })
    .populate({
      path: "items.book",
      populate: [
        { path: "authors", select: "name nameBn slug photo bio" },
        { path: "publisher", select: "name nameBn slug logo website" },
        { path: "categories", select: "name nameBn slug description" },
        { path: "country", select: "name code phoneCode currency" },
      ],
    })
    .lean();

  if (!wishlist) {
    const created = await WishlistModel.create({
      user: new mongoose.Types.ObjectId(userId),
      items: [],
    });
    wishlist = created.toObject();
  }

  const rawItems = wishlist.items || [];
  const bookIds = rawItems
    .map((item: any) => item.book?._id)
    .filter(Boolean);

  // Fetch active marketplace listings for real-time pricing and stock
  const activeListings = bookIds.length > 0
    ? await BookListingModel.find({
        book: { $in: bookIds },
        isActive: true,
      })
        .sort({ sellingPriceInPaise: 1 })
        .lean()
    : [];

  // Batch compute ratings for the active listings
  const ratingMap = await getBatchListingRatingStats(
    activeListings.map((l) => ({
      bookId: l.book,
      sellerId: l.seller,
      listingId: l._id,
    })),
  );

  // Group listings by book ID
  const listingsByBook = new Map<string, any[]>();
  for (const listing of activeListings) {
    const bId = listing.book.toString();
    const existing = listingsByBook.get(bId) || [];
    existing.push(listing);
    listingsByBook.set(bId, existing);
  }

  const formattedItems = rawItems
    .filter((item: any) => item.book && item.book._id)
    .map((item: any) => {
      const book = item.book as BookDocument & { _id: mongoose.Types.ObjectId };
      const bookListings = listingsByBook.get(book._id.toString()) || [];

      const bestListing = bookListings[0]; // Lowest price listing
      const totalStock = bookListings.reduce((sum, l) => sum + (l.stock || 0), 0);
      const inStock = totalStock > 0;

      const priceInPaise = bestListing?.sellingPriceInPaise ?? 0;
      const mrpInPaise = bestListing?.mrpInPaise ?? priceInPaise;
      const priceInRupees = Math.round(priceInPaise / 100);
      const mrpInRupees = Math.round(mrpInPaise / 100);

      const customImages = bestListing?.listingImages ?? [];
      const resolvedImages = getMergedAndShuffledBookImages(
        book.coverImage,
        book.images,
        customImages,
      );

      const ratingInfo = bestListing
        ? getListingRatingFromMap(ratingMap, book._id, bestListing.seller)
        : {
            rating: 0,
            averageRating: 0,
            ratingCount: 0,
            totalRatings: 0,
            totalReviews: 0,
            reviewCount: 0,
          };

      return {
        id: book._id,
        bookId: book._id,
        listingId: bestListing?._id ? bestListing._id.toString() : undefined,
        title: book.title,
        titleBn: book.titleBn,
        slug: book._id,
        canonicalSlug: book.slug,
        isbn: book.isbn,
        coverImage: resolvedImages.coverImage,
        images: resolvedImages.images,
        format: book.format || "Paperback",
        authors: book.authors || [],
        publisher: book.publisher,

        categories: book.categories || [],
        priceInPaise,
        priceInRupees,
        mrpInPaise,
        mrpInRupees,
        inStock,
        totalStock,
        rating: ratingInfo.rating,
        averageRating: ratingInfo.averageRating,
        ratingCount: ratingInfo.ratingCount,
        totalRatings: ratingInfo.totalRatings,
        totalReviews: ratingInfo.totalReviews,
        reviewCount: ratingInfo.reviewCount,
        addedAt: item.addedAt,
      };
    });

  return {
    _id: wishlist._id,
    user: userId,
    items: formattedItems,
    totalItemsCount: formattedItems.length,
  };
};

/**
 * Resolves a book ID whether provided as canonical Book ID or BookListing ID.
 */
async function resolveCanonicalBookId(rawId: string): Promise<mongoose.Types.ObjectId | null> {
  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    return null;
  }

  // 1. Direct canonical Book check
  const bookExists = await BookModel.exists({ _id: rawId });
  if (bookExists) {
    return new mongoose.Types.ObjectId(rawId);
  }

  // 2. Listing check
  const listing = await BookListingModel.findById(rawId).select("book").lean();
  if (listing?.book) {
    return listing.book as unknown as mongoose.Types.ObjectId;
  }

  return null;
}

export const addToWishlistService = async (
  userId: string,
  input: AddToWishlistInput,
) => {
  const canonicalBookId = await resolveCanonicalBookId(input.bookId);
  if (!canonicalBookId) {
    throw new AppError("Book not found", HTTP_STATUS.NOT_FOUND);
  }

  let wishlist = await WishlistModel.findOne({ user: userId });
  if (!wishlist) {
    wishlist = new WishlistModel({
      user: new mongoose.Types.ObjectId(userId),
      items: [],
    });
  }

  const bookIdStr = canonicalBookId.toString();
  const alreadyInWishlist = wishlist.items.some(
    (item) => item.book.toString() === bookIdStr,
  );

  if (!alreadyInWishlist) {
    wishlist.items.push({
      book: canonicalBookId,
      addedAt: new Date(),
    });
    await wishlist.save();
    logger.info({ userId, bookId: bookIdStr }, "Book added to wishlist");
  }

  return getWishlistService(userId);
};

export const syncWishlistService = async (
  userId: string,
  input: SyncWishlistInput,
) => {
  const incomingItems = input.items || [];
  if (incomingItems.length === 0) {
    return getWishlistService(userId);
  }

  let wishlist = await WishlistModel.findOne({ user: userId });
  if (!wishlist) {
    wishlist = new WishlistModel({
      user: new mongoose.Types.ObjectId(userId),
      items: [],
    });
  }

  const rawIds = Array.from(new Set(incomingItems.map((i) => i.bookId)));

  // Batch query both Books and Listings
  const [books, listings] = await Promise.all([
    BookModel.find({ _id: { $in: rawIds } }).select("_id").lean(),
    BookListingModel.find({ _id: { $in: rawIds } }).select("_id book").lean(),
  ]);

  const validBookIdSet = new Set<string>();
  for (const b of books) {
    validBookIdSet.add(b._id.toString());
  }
  for (const l of listings) {
    if (l.book) {
      validBookIdSet.add(l.book.toString());
    }
  }

  const existingBookIdSet = new Set(
    wishlist.items.map((item) => item.book.toString()),
  );

  let addedCount = 0;
  for (const validId of validBookIdSet) {
    if (!existingBookIdSet.has(validId)) {
      wishlist.items.push({
        book: new mongoose.Types.ObjectId(validId),
        addedAt: new Date(),
      });
      existingBookIdSet.add(validId);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    await wishlist.save();
    logger.info({ userId, addedCount }, "Wishlist synced successfully");
  }

  return getWishlistService(userId);
};

export const removeFromWishlistService = async (
  userId: string,
  bookIdOrListingId: string,
) => {
  const canonicalBookId = await resolveCanonicalBookId(bookIdOrListingId);
  const targetIdStr = canonicalBookId ? canonicalBookId.toString() : bookIdOrListingId;

  const wishlist = await WishlistModel.findOne({ user: userId });
  if (!wishlist) {
    throw new AppError("Wishlist not found", HTTP_STATUS.NOT_FOUND);
  }

  wishlist.items = wishlist.items.filter(
    (item) => item.book.toString() !== targetIdStr,
  ) as unknown as typeof wishlist.items;

  await wishlist.save();
  logger.info({ userId, bookId: targetIdStr }, "Book removed from wishlist");

  return getWishlistService(userId);
};

export const clearWishlistService = async (userId: string) => {
  const wishlist = await WishlistModel.findOne({ user: userId });
  if (wishlist) {
    wishlist.items = [] as unknown as typeof wishlist.items;
    await wishlist.save();
  }
  return { message: "Wishlist cleared successfully" };
};

import mongoose from "mongoose";

import { BookListingModel } from "../models/book-listing.model.js";
import { BookModel } from "../models/book.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import {
  createBookListingSchema,
  updateBookListingSchema,
  type BookListingQueryInput,
  type CreateBookListingInput,
  type UpdateBookListingInput,
} from "../validation/book-listing.schema.js";

export const getBookListingsService = async (query: BookListingQueryInput) => {
  const filter: Record<string, unknown> = {};

  if (query.book) {
    filter.book = query.book;
  }

  if (query.seller) {
    filter.seller = query.seller;
  }

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [listings, total] = await Promise.all([
    BookListingModel.find(filter)
      .populate("book", "title titleBn slug isbn coverImage format")
      .populate({
        path: "seller",
        select: "name email mobileNumber role publisher",
        populate: {
          path: "publisher",
          select: "name nameBn slug logo",
        },
      })
      .sort({ [query.sortBy]: query.sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BookListingModel.countDocuments(filter),
  ]);

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

export const getBookListingByIdService = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid listing ID", HTTP_STATUS.BAD_REQUEST);
  }

  const listing = await BookListingModel.findById(id)
    .populate({
      path: "book",
      populate: [
        { path: "authors", select: "name slug photo" },
        { path: "publisher", select: "name slug logo" },
        { path: "categories", select: "name slug" },
      ],
    })
    .populate({
      path: "seller",
      select: "name email mobileNumber role publisher",
      populate: {
        path: "publisher",
        select: "name nameBn slug logo website",
      },
    })
    .lean();

  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  return listing;
};

export const createBookListingService = async (
  rawInput: CreateBookListingInput,
  sellerId: string,
) => {
  const input = createBookListingSchema.parse(rawInput);

  // 1. Verify seller exists, is active, and has role SELLER
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

  // 2. Verify book exists and is active
  const book = await BookModel.findById(input.book).lean();
  if (!book) {
    throw new AppError("Referenced book not found", HTTP_STATUS.NOT_FOUND);
  }

  if (book.status !== "ACTIVE") {
    throw new AppError(
      "Cannot create a listing for an inactive or draft book",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // 3. Verify unique listing per seller + book
  const existingListing = await BookListingModel.findOne({
    book: input.book,
    seller: sellerId,
  }).lean();

  if (existingListing) {
    throw new AppError(
      "You already have a listing for this book. Update your existing listing instead.",
      HTTP_STATUS.CONFLICT,
    );
  }

  // 4. Create listing
  const newListing = new BookListingModel({
    book: new mongoose.Types.ObjectId(input.book),
    seller: new mongoose.Types.ObjectId(sellerId),
    mrpInPaise: input.mrpInPaise,
    sellingPriceInPaise: input.sellingPriceInPaise,
    stock: input.stock ?? 0,
    sku: input.sku,
    isActive: input.isActive ?? true,
  });

  await newListing.save();

  logger.info(
    {
      listingId: newListing._id,
      bookId: input.book,
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

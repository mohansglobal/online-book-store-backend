import mongoose from "mongoose";

import { BookListingModel, type BookListingDocument } from "../models/book-listing.model.js";
import { BookModel, type BookDocument } from "../models/book.model.js";
import { UserModel } from "../models/user.model.js";
import { CategoryModel } from "../models/category.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CountryModel } from "../models/country.model.js";
import { createBookService } from "./book.service.js";
import {
  getBatchListingRatingStats,
  getListingRatingFromMap,
  calculateReviewStats,
} from "./review.service.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import {
  createBookListingSchema,
  updateBookListingSchema,
  myBookListingQuerySchema,
  updateStockSchema,
  type BookListingQueryInput,
  type CreateBookListingInput,
  type UpdateBookListingInput,
  type MyBookListingQueryInput,
  type UpdateStockInput,
  type ApplyListingDiscountInput,
} from "../validation/book-listing.schema.js";
import { getMergedAndShuffledBookImages } from "../utils/image.helper.js";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const getBookListingsService = async (query: BookListingQueryInput) => {
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

  if (query.homesection) {
    const aggregatePipeline: any[] = [
      { $match: filter },
      ...(isTitleSort
        ? [
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
          ]
        : []),
      { $sort: { [sortField]: sortDir, _id: 1 } },
      {
        $group: {
          _id: "$book",
          listing: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$listing" } },
      { $sort: { [sortField]: sortDir, _id: 1 } },
      ...(isTitleSort ? [{ $project: { bookDoc: 0 } }] : []),
    ];

    const [aggregatedListings, totalCountResult] = await Promise.all([
      BookListingModel.aggregate([
        ...aggregatePipeline,
        { $skip: skip },
        { $limit: limit },
      ]),
      BookListingModel.aggregate([
        { $match: filter },
        { $group: { _id: "$book" } },
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

    return {
      ...listing,
      price,
      priceInPaise: sellingPriceInPaise,
      mrp,
      mrpInPaise,
      sellingPriceInPaise,
      discountPercentage,
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

export const getBookListingByIdService = async (id: string) => {
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

  // 2. Resolve Canonical Book: Look up existing or create canonical book
  let targetBook: (BookDocument & { _id: mongoose.Types.ObjectId }) | null = null;

  if (input.book && mongoose.Types.ObjectId.isValid(input.book)) {
    targetBook = (await BookModel.findById(input.book)) as (BookDocument & {
      _id: mongoose.Types.ObjectId;
    }) | null;
  } else if (input.isbn) {
    targetBook = (await BookModel.findOne({ isbn: input.isbn })) as (BookDocument & {
      _id: mongoose.Types.ObjectId;
    }) | null;
  }

  // If not found and canonical book fields are supplied, create the master book
  if (!targetBook) {
    if (
      input.title &&
      input.publisher &&
      input.authors &&
      input.categories &&
      input.description &&
      input.coverImage
    ) {
      const bookMrpInRupees = Math.round(input.mrpInPaise / 100);

      targetBook = (await createBookService(
        {
          title: input.title,
          titleBn: input.titleBn,
          isbn: input.isbn,
          publisher: input.publisher,
          authors: input.authors,
          categories: input.categories,
          country: input.country,
          language: input.language,
          description: input.description,
          coverImage: input.coverImage,
          images: [],
          pages: input.pages,
          edition: input.edition,
          searchTags: input.searchTags,
          price: bookMrpInRupees,
          priceIn: bookMrpInRupees,
          mrp: bookMrpInRupees,
          mrpInPaise: input.mrpInPaise,
          sellingPriceInPaise: input.sellingPriceInPaise,
        },
        sellerId,
      )) as BookDocument & { _id: mongoose.Types.ObjectId };
    } else {
      throw new AppError(
        "Referenced canonical book not found. Please provide full book details to register a new book.",
        HTTP_STATUS.NOT_FOUND,
      );
    }
  }

  if (targetBook.status !== "ACTIVE") {
    throw new AppError(
      "Cannot create a listing for an inactive or draft book",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // 3. Verify unique listing per seller + book
  const existingListing = await BookListingModel.findOne({
    book: targetBook._id,
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
    book: targetBook._id,
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
      bookId: targetBook._id,
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





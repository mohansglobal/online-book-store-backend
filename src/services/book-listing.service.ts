import mongoose from "mongoose";

import { BookListingModel, type BookListingDocument } from "../models/book-listing.model.js";
import { BookModel, type BookDocument } from "../models/book.model.js";
import { UserModel } from "../models/user.model.js";
import { CategoryModel } from "../models/category.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CountryModel } from "../models/country.model.js";
import { createBookService } from "./book.service.js";
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

  // If query contains category, author, publisher, country, or search keyword,
  // find matching canonical books first
  const bookFilter: Record<string, unknown> = {};
  let filterBooksNeeded = false;

  if (query.category && query.category.length > 0) {
    filterBooksNeeded = true;
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
    filterBooksNeeded = true;
    const validIds = query.author.filter((id) => objectIdRegex.test(id));
    const matchedAuthors = await AuthorModel.find({
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
    filterBooksNeeded = true;
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
    filterBooksNeeded = true;
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
    filterBooksNeeded = true;
    bookFilter.language = query.language;
  }

  if (query.search) {
    filterBooksNeeded = true;
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

  // Format listings with dynamic effectiveImages fallback
  const listings = rawListings.map((listing) => {
    const bookObj = listing.book as unknown as BookDocument;
    const customImages = listing.listingImages ?? [];
    let effectiveImages: string[] = customImages;

    if (effectiveImages.length === 0 && bookObj) {
      if (bookObj.images && bookObj.images.length > 0) {
        effectiveImages = bookObj.images;
      } else if (bookObj.coverImage) {
        effectiveImages = [bookObj.coverImage];
      }
    }

    return {
      ...listing,
      effectiveImages,
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
  let effectiveImages: string[] = customImages;

  if (effectiveImages.length === 0 && bookObj) {
    if (bookObj.images && bookObj.images.length > 0) {
      effectiveImages = bookObj.images;
    } else if (bookObj.coverImage) {
      effectiveImages = [bookObj.coverImage];
    }
  }

  return {
    ...listing,
    effectiveImages,
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
          images: input.images,
          pages: input.pages,
          edition: input.edition,
          searchTags: input.searchTags,
          price: Math.round(input.sellingPriceInPaise / 100),
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


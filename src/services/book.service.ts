import mongoose from "mongoose";

import {
  BookModel,
  BOOK_STATUSES,
  type BookDocument,
  type BookStatus,
} from "../models/book.model.js";
import { BookListingModel, type BookListingDocument } from "../models/book-listing.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CategoryModel } from "../models/category.model.js";
import { CountryModel } from "../models/country.model.js";
import {
  getBatchListingRatingStats,
  getListingRatingFromMap,
  calculateReviewStats,
} from "./review.service.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import {
  createBookSchema,
  updateBookSchema,
  type BookQueryInput,
  type CreateBookInput,
  type UpdateBookInput,
} from "../validation/book.schema.js";
import { getMergedAndShuffledBookImages } from "../utils/image.helper.js";

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/**
 * Buyer-facing /books query:
 * Returns active marketplace listings with populated canonical book details.
 * If 20 sellers sell the same book, 20 separate listing cards appear,
 * each with its own seller-specific price, stock, seller, and images.
 */
export const getBooksService = async (query: BookQueryInput) => {
  const listingFilter: Record<string, unknown> = {
    isActive: true,
  };

  // Price filters in paise
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {};
    if (query.minPrice !== undefined) {
      priceFilter.$gte = Math.round(query.minPrice * 100);
    }
    if (query.maxPrice !== undefined) {
      priceFilter.$lte = Math.round(query.maxPrice * 100);
    }
    listingFilter.sellingPriceInPaise = priceFilter;
  }

  // Build canonical book filter for metadata search/filtering (only active books by default)
  const bookFilter: Record<string, unknown> = {
    status: query.status || "ACTIVE",
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
        books: [],
        meta: {
          page: query.page,
          limit: query.limit,
          total: 0,
          totalPages: 1,
        },
      };
    }
    listingFilter.book = { $in: matchingBookIds };
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  // Map sort fields to BookListing fields
  let sortObject: Record<string, 1 | -1> = { sellingPriceInPaise: 1 };
  if (query.sortBy === "price" || query.sortBy === "priceIn") {
    sortObject = { sellingPriceInPaise: query.sortOrder === "desc" ? -1 : 1 };
  } else if (query.sortBy === "createdAt") {
    sortObject = { createdAt: query.sortOrder === "asc" ? 1 : -1 };
  }

  const [rawListings, total] = await Promise.all([
    BookListingModel.find(listingFilter)
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
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
      .lean(),
    BookListingModel.countDocuments(listingFilter),
  ]);

  // Batch compute seller book ratings in a single aggregation query
  const itemsForRatings = rawListings.map((listing) => ({
    bookId: (listing.book as { _id?: unknown })?._id || listing.book,
    sellerId: (listing.seller as { _id?: unknown })?._id || listing.seller,
    listingId: listing._id,
  }));

  const ratingMap = await getBatchListingRatingStats(itemsForRatings);

  // Transform listings into buyer-facing book cards with fallback images, seller price, and ratings
  const books = rawListings.map((listing) => {
    const bookObj = listing.book as unknown as (BookDocument & {
      _id: mongoose.Types.ObjectId;
      country?: unknown;
    }) | null;
    const customImages = listing.listingImages ?? [];
    const resolvedImages = getMergedAndShuffledBookImages(
      bookObj?.coverImage,
      bookObj?.images,
      customImages,
    );

    const bookId = bookObj?._id || listing.book;
    const sellerId = (listing.seller as { _id?: unknown })?._id || listing.seller;
    const ratingInfo = getListingRatingFromMap(ratingMap, bookId, sellerId);

    return {
      _id: listing._id,
      listingId: listing._id,
      bookId: bookObj?._id,
      title: bookObj?.title,
      titleBn: bookObj?.titleBn,
      slug: bookObj?.slug,
      isbn: bookObj?.isbn,
      description: bookObj?.description,
      authors: bookObj?.authors,
      publisher: bookObj?.publisher,
      categories: bookObj?.categories,
      country: bookObj?.country,
      language: bookObj?.language,
      format: bookObj?.format,
      pages: bookObj?.pages,
      edition: bookObj?.edition,
      coverImage: resolvedImages.coverImage,
      images: resolvedImages.images,
      effectiveImages: resolvedImages.effectiveImages,
      listingImages: customImages,
      price: Math.round(listing.sellingPriceInPaise / 100),
      priceInPaise: listing.sellingPriceInPaise,
      mrp: Math.round(listing.mrpInPaise / 100),
      mrpInPaise: listing.mrpInPaise,
      discountPercentage:
        listing.mrpInPaise > 0
          ? Math.round(
              ((listing.mrpInPaise - listing.sellingPriceInPaise) /
                listing.mrpInPaise) *
                100,
            )
          : 0,
      stock: listing.stock,
      sku: listing.sku,
      seller: listing.seller,
      rating: ratingInfo.rating,
      averageRating: ratingInfo.averageRating,
      ratingCount: ratingInfo.ratingCount,
      totalRatings: ratingInfo.totalRatings,
      totalReviews: ratingInfo.totalReviews,
      reviewCount: ratingInfo.reviewCount,
      createdAt: listing.createdAt,
    };
  });

  return {
    books,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getBookByIdOrSlugService = async (idOrSlug: string) => {
  const trimmed = idOrSlug.trim();
  const isObjectId = mongoose.Types.ObjectId.isValid(trimmed);

  const book = await BookModel.findOne(
    isObjectId
      ? { $or: [{ _id: trimmed }, { slug: trimmed.toLowerCase() }] }
      : { slug: trimmed.toLowerCase() },
  )
    .populate("authors", "name nameBn slug photo bio")
    .populate("publisher", "name nameBn slug logo website")
    .populate("categories", "name nameBn slug description")
    .populate("country", "name code phoneCode currency")
    .populate("createdBy", "name email role")
    .lean();

  if (!book) {
    throw new AppError("Book not found", HTTP_STATUS.NOT_FOUND);
  }

  // Fetch all active seller listings for this canonical book sorted by lowest price
  const rawListings = await BookListingModel.find({
    book: book._id,
    isActive: true,
  })
    .populate("seller", "name email mobileNumber role profilePicture")
    .sort({ sellingPriceInPaise: 1 })
    .lean();

  const [bookOverallReviewStats, listingRatingMap] = await Promise.all([
    calculateReviewStats(book._id as mongoose.Types.ObjectId),
    getBatchListingRatingStats(
      rawListings.map((l) => ({
        bookId: book._id as mongoose.Types.ObjectId,
        sellerId: (l.seller as { _id?: unknown })?._id || l.seller,
        listingId: l._id,
      })),
    ),
  ]);

  const mainBookImages = getMergedAndShuffledBookImages(
    book.coverImage,
    book.images,
  );

  const listings = rawListings.map((listing) => {
    const customImages = listing.listingImages ?? [];
    const resolvedListingImages = getMergedAndShuffledBookImages(
      book.coverImage,
      book.images,
      customImages,
    );

    const sellerId = (listing.seller as { _id?: unknown })?._id || listing.seller;
    const sellerRatingInfo = getListingRatingFromMap(
      listingRatingMap,
      book._id,
      sellerId,
    );

    return {
      ...listing,
      coverImage: resolvedListingImages.coverImage,
      images: resolvedListingImages.images,
      effectiveImages: resolvedListingImages.effectiveImages,
      discountPercentage:
        listing.mrpInPaise > 0
          ? Math.round(
              ((listing.mrpInPaise - listing.sellingPriceInPaise) /
                listing.mrpInPaise) *
                100,
            )
          : 0,
      rating: sellerRatingInfo.rating,
      averageRating: sellerRatingInfo.averageRating,
      ratingCount: sellerRatingInfo.ratingCount,
      totalRatings: sellerRatingInfo.totalRatings,
      totalReviews: sellerRatingInfo.totalReviews,
      reviewCount: sellerRatingInfo.reviewCount,
    };
  });

  return {
    ...book,
    coverImage: mainBookImages.coverImage,
    images: mainBookImages.images,
    effectiveImages: mainBookImages.effectiveImages,
    rating: bookOverallReviewStats.averageRating,
    averageRating: bookOverallReviewStats.averageRating,
    ratingCount: bookOverallReviewStats.totalReviews,
    totalRatings: bookOverallReviewStats.totalReviews,
    totalReviews: bookOverallReviewStats.totalReviews,
    reviewCount: bookOverallReviewStats.totalReviews,
    reviewStats: bookOverallReviewStats,
    listings,
  };
};

export const createBookService = async (
  rawInput: CreateBookInput,
  creatorId: string,
) => {
  const input = createBookSchema.parse(rawInput);

  // 1. Validate publisher existence
  const publisherExists = await PublisherModel.exists({
    _id: input.publisher,
    isActive: true,
  });
  if (!publisherExists) {
    throw new AppError("Referenced publisher does not exist or is inactive", HTTP_STATUS.BAD_REQUEST);
  }

  // 2. Validate all authors exist
  const authorCount = await AuthorModel.countDocuments({
    _id: { $in: input.authors },
    isActive: true,
    isDel: { $ne: true },
  });
  if (authorCount !== input.authors.length) {
    throw new AppError("One or more referenced authors do not exist or are inactive", HTTP_STATUS.BAD_REQUEST);
  }

  // 3. Validate all categories exist
  const categoryCount = await CategoryModel.countDocuments({
    _id: { $in: input.categories },
    isActive: true,
  });
  if (categoryCount !== input.categories.length) {
    throw new AppError("One or more referenced categories do not exist or are inactive", HTTP_STATUS.BAD_REQUEST);
  }

  // 3b. Validate country if provided
  if (input.country) {
    const countryExists = await CountryModel.exists({
      _id: input.country,
      isActive: true,
    });
    if (!countryExists) {
      throw new AppError("Referenced country does not exist or is inactive", HTTP_STATUS.BAD_REQUEST);
    }
  }

  // 4. Validate ISBN uniqueness if provided
  if (input.isbn && input.isbn.trim()) {
    const existingIsbn = await BookModel.findOne({ isbn: input.isbn.trim() }).lean();
    if (existingIsbn) {
      throw new AppError("A book with this ISBN already exists", HTTP_STATUS.CONFLICT);
    }
  }

  // 4b. Validate legacyId uniqueness if provided
  if (input.legacyId && input.legacyId.trim()) {
    const existingLegacy = await BookModel.findOne({ legacyId: input.legacyId.trim() }).lean();
    if (existingLegacy) {
      throw new AppError("A book with this legacy ID already exists", HTTP_STATUS.CONFLICT);
    }
  }

  // 5. Generate slug
  let baseSlug = slugify(input.title);
  if (!baseSlug) {
    baseSlug = "book";
  }

  let slug = baseSlug;
  let counter = 1;
  while (await BookModel.exists({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // 5b. Resolve MRP in Rupees
  let rawMrpInRupees =
    input.priceMrp ??
    input.mrpPrice ??
    input.mrp ??
    input.price;

  if (rawMrpInRupees === undefined && input.mrpInPaise !== undefined) {
    rawMrpInRupees = Math.round(input.mrpInPaise / 100);
  }

  if (rawMrpInRupees === undefined && input.sellingPrice !== undefined) {
    rawMrpInRupees = input.sellingPrice;
  }

  if (rawMrpInRupees === undefined && input.priceIn !== undefined) {
    rawMrpInRupees = input.priceIn;
  }

  if (rawMrpInRupees === undefined && input.sellingPriceInPaise !== undefined) {
    rawMrpInRupees = Math.round(input.sellingPriceInPaise / 100);
  }

  if (rawMrpInRupees === undefined && input.priceInPaise !== undefined) {
    rawMrpInRupees = Math.round(input.priceInPaise / 100);
  }

  const bookMrp = rawMrpInRupees !== undefined ? Math.round(rawMrpInRupees) : 0;

  // 6. Create canonical master book
  const newBook = new BookModel({
    title: input.title,
    titleBn: input.titleBn,
    slug,
    legacyId: input.legacyId,
    legacyBookId: input.legacyBookId,
    price: bookMrp,
    priceIn: bookMrp,
    isbn: input.isbn,
    description: input.description,
    authors: input.authors.map((id) => new mongoose.Types.ObjectId(id)),
    publisher: new mongoose.Types.ObjectId(input.publisher),
    categories: input.categories.map((id) => new mongoose.Types.ObjectId(id)),
    country: input.country ? new mongoose.Types.ObjectId(input.country) : undefined,
    language: input.language,
    searchTags: input.searchTags,
    format: input.format,
    edition: input.edition,
    pages: input.pages,
    publicationDate: input.publicationDate,
    coverImage: input.coverImage,
    images: input.images,
    status: input.status,
    translation: input.translation,
    createdBy: new mongoose.Types.ObjectId(creatorId),
  });

  await newBook.save();

  logger.info({ bookId: newBook._id, title: newBook.title, createdBy: creatorId }, "Canonical book created successfully");

  return newBook;
};

export const updateBookService = async (
  id: string,
  userContext: { id: string; role: string },
  rawInput: UpdateBookInput,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid book ID", HTTP_STATUS.BAD_REQUEST);
  }

  const input = updateBookSchema.parse(rawInput);

  const book = await BookModel.findById(id);
  if (!book) {
    throw new AppError("Book not found", HTTP_STATUS.NOT_FOUND);
  }

  // Check authorization: must be ADMIN or the user who created this Book
  if (userContext.role !== "ADMIN" && book.createdBy.toString() !== userContext.id) {
    throw new AppError("Forbidden: You do not have permission to edit this book", HTTP_STATUS.FORBIDDEN);
  }

  if (input.publisher) {
    const publisherExists = await PublisherModel.exists({
      _id: input.publisher,
      isActive: true,
    });
    if (!publisherExists) {
      throw new AppError("Referenced publisher does not exist or is inactive", HTTP_STATUS.BAD_REQUEST);
    }
    book.publisher = new mongoose.Types.ObjectId(input.publisher);
  }

  if (input.authors) {
    const authorCount = await AuthorModel.countDocuments({
      _id: { $in: input.authors },
      isActive: true,
      isDel: { $ne: true },
    });
    if (authorCount !== input.authors.length) {
      throw new AppError("One or more referenced authors do not exist or are inactive", HTTP_STATUS.BAD_REQUEST);
    }
    book.authors = input.authors.map((authorId) => new mongoose.Types.ObjectId(authorId)) as unknown as typeof book.authors;
  }

  if (input.categories) {
    const categoryCount = await CategoryModel.countDocuments({
      _id: { $in: input.categories },
      isActive: true,
    });
    if (categoryCount !== input.categories.length) {
      throw new AppError("One or more referenced categories do not exist or are inactive", HTTP_STATUS.BAD_REQUEST);
    }
    book.categories = input.categories.map((catId) => new mongoose.Types.ObjectId(catId)) as unknown as typeof book.categories;
  }

  if (input.country) {
    const countryExists = await CountryModel.exists({
      _id: input.country,
      isActive: true,
    });
    if (!countryExists) {
      throw new AppError("Referenced country does not exist or is inactive", HTTP_STATUS.BAD_REQUEST);
    }
    book.country = new mongoose.Types.ObjectId(input.country);
  }

  if (input.isbn && input.isbn.trim() !== book.isbn) {
    const existingIsbn = await BookModel.findOne({
      isbn: input.isbn.trim(),
      _id: { $ne: book._id },
    }).lean();
    if (existingIsbn) {
      throw new AppError("A book with this ISBN already exists", HTTP_STATUS.CONFLICT);
    }
    book.isbn = input.isbn.trim();
  }

  if (input.title !== undefined) book.title = input.title;
  if (input.titleBn !== undefined) book.titleBn = input.titleBn;
  if (input.description !== undefined) book.description = input.description;
  if (input.language !== undefined) book.language = input.language;
  if (input.searchTags !== undefined) book.searchTags = input.searchTags;
  if (input.format !== undefined) book.format = input.format;
  if (input.edition !== undefined) book.edition = input.edition;
  if (input.pages !== undefined) book.pages = input.pages;
  if (input.publicationDate !== undefined) book.publicationDate = input.publicationDate;
  if (input.coverImage !== undefined) book.coverImage = input.coverImage;
  if (input.images !== undefined) book.images = input.images;
  if (input.status !== undefined) book.status = input.status;
  if (input.translation !== undefined) book.translation = input.translation;

  let updatedMrp: number | undefined;
  const rawUpdatedMrp =
    input.priceMrp ??
    input.mrpPrice ??
    input.mrp ??
    input.price ??
    input.sellingPrice ??
    input.priceIn;

  if (rawUpdatedMrp !== undefined) {
    updatedMrp = Math.round(rawUpdatedMrp);
  } else if (input.mrpInPaise !== undefined) {
    updatedMrp = Math.round(input.mrpInPaise / 100);
  } else if (input.sellingPriceInPaise !== undefined) {
    updatedMrp = Math.round(input.sellingPriceInPaise / 100);
  } else if (input.priceInPaise !== undefined) {
    updatedMrp = Math.round(input.priceInPaise / 100);
  }

  if (updatedMrp !== undefined) {
    book.price = updatedMrp;
    book.priceIn = updatedMrp;
  }

  await book.save();

  logger.info({ bookId: book._id }, "Book updated successfully");

  return book;
};

export const lookupBookByIsbnService = async (
  isbn: string,
  sellerId?: string,
) => {
  const rawIsbn = isbn.trim();
  const digitsOnly = rawIsbn.replace(/[^0-9X]/gi, "");

  const searchConditions: Record<string, unknown>[] = [
    { isbn: rawIsbn },
  ];

  if (digitsOnly.length >= 3) {
    searchConditions.push({ isbn: digitsOnly });
    const isbnRegex = new RegExp(
      `^${digitsOnly.split("").join("[- ]?")}$`,
      "i",
    );
    searchConditions.push({ isbn: { $regex: isbnRegex } });
  }

  const book = await BookModel.findOne({
    $or: searchConditions,
  })
    .populate("authors", "name nameBn slug photo bio")
    .populate("publisher", "name nameBn slug logo website")
    .populate("categories", "name nameBn slug description")
    .populate("country", "name code phoneCode currency")
    .populate("createdBy", "name email role")
    .lean();

  if (!book) {
    return {
      exists: false,
      alreadyListedBySeller: false,
      existingListingId: null,
      book: null,
    };
  }

  let alreadyListedBySeller = false;
  let existingListingId: string | null = null;

  if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
    const existingListing = await BookListingModel.findOne({
      book: book._id,
      seller: new mongoose.Types.ObjectId(sellerId),
    })
      .select("_id isActive mrpInPaise sellingPriceInPaise stock sku")
      .lean();

    if (existingListing) {
      alreadyListedBySeller = true;
      existingListingId = existingListing._id.toString();
    }
  }

  return {
    exists: true,
    alreadyListedBySeller,
    existingListingId,
    book: {
      ...book,
      images: [],
    },
  };
};

export const toggleBookStatusService = async (
  bookId: string,
  userContext: { id: string; role: string },
  inputStatus?: string | boolean,
) => {
  if (!mongoose.Types.ObjectId.isValid(bookId)) {
    throw new AppError("Invalid book ID", HTTP_STATUS.BAD_REQUEST);
  }

  const book = await BookModel.findById(bookId);
  if (!book) {
    throw new AppError("Book not found", HTTP_STATUS.NOT_FOUND);
  }

  const isCreator = book.createdBy.toString() === userContext.id;
  const isAdmin = userContext.role === "ADMIN";

  if (!isCreator && !isAdmin) {
    throw new AppError(
      "Forbidden: You do not have permission to modify this book",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  let nextStatus: BookStatus;
  if (typeof inputStatus === "boolean") {
    nextStatus = inputStatus ? "ACTIVE" : "INACTIVE";
  } else if (
    typeof inputStatus === "string" &&
    BOOK_STATUSES.includes(inputStatus as BookStatus)
  ) {
    nextStatus = inputStatus as BookStatus;
  } else {
    nextStatus = book.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  }

  book.status = nextStatus;
  await book.save();

  logger.info(
    {
      bookId: book._id,
      status: book.status,
      userId: userContext.id,
    },
    "Book status toggled successfully",
  );

  return book;
};




import mongoose from "mongoose";

import { BookModel } from "../models/book.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CategoryModel } from "../models/category.model.js";
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

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const getBooksService = async (query: BookQueryInput) => {
  const filter: Record<string, unknown> = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.language) {
    filter.language = query.language;
  }

  const publishers = query.publisher
    ? Array.isArray(query.publisher)
      ? query.publisher
      : [query.publisher]
    : [];

  const authors = query.author
    ? Array.isArray(query.author)
      ? query.author
      : [query.author]
    : [];

  const categories = query.category
    ? Array.isArray(query.category)
      ? query.category
      : [query.category]
    : [];

  if (publishers.length) {
    filter.publisher =
      publishers.length === 1
        ? publishers[0]
        : { $in: publishers };
  }

  if (authors.length) {
    filter.authors =
      authors.length === 1
        ? authors[0]
        : { $in: authors };
  }

  if (categories.length) {
    filter.categories =
      categories.length === 1
        ? categories[0]
        : { $in: categories };
  }

  if (query.search) {
    const escapedSearch = query.search.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    const searchRegex = new RegExp(escapedSearch, "i");

    filter.$or = [
      { title: searchRegex },
      { titleBn: searchRegex },
      { isbn: searchRegex },
      { searchTags: searchRegex },
      { description: searchRegex },
    ];
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [books, total] = await Promise.all([
    BookModel.find(filter)
      .populate("authors", "name nameBn slug photo")
      .populate("publisher", "name nameBn slug logo")
      .populate("categories", "name nameBn slug")
      .sort({
        [query.sortBy]: query.sortOrder === "asc" ? 1 : -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    BookModel.countDocuments(filter),
  ]);

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
    .populate("createdBy", "name email role")
    .lean();

  if (!book) {
    throw new AppError("Book not found", HTTP_STATUS.NOT_FOUND);
  }

  return book;
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

  // 6. Create canonical book
  const newBook = new BookModel({
    ...input,
    slug,
    createdBy: new mongoose.Types.ObjectId(creatorId),
  });

  await newBook.save();

  logger.info({ bookId: newBook._id, title: newBook.title, createdBy: creatorId }, "Book created successfully");

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
  if (input.price !== undefined) book.price = input.price;
  if (input.priceIn !== undefined) book.priceIn = input.priceIn;

  await book.save();

  logger.info({ bookId: book._id }, "Book updated successfully");

  return book;
};

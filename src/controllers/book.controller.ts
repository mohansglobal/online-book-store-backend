import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getBooksService,
  getBookByIdOrSlugService,
  lookupBookByIsbnService,
  createBookService,
  updateBookService,
  toggleBookStatusService,
} from "../services/book.service.js";
import type {
  BookQueryInput,
  CreateBookInput,
  UpdateBookInput,
  ToggleBookStatusInput,
} from "../validation/book.schema.js";

export const getBooks = asyncHandler(async (req, res) => {
  const { books, meta } = await getBooksService(
    req.query as unknown as BookQueryInput,
  );

  apiResponse(res, HTTP_STATUS.OK, "Books retrieved successfully", books, meta);
});

export const getBookByIdOrSlug = asyncHandler(async (req, res) => {
  const book = await getBookByIdOrSlugService(req.params.idOrSlug as string);

  apiResponse(res, HTTP_STATUS.OK, "Book retrieved successfully", book);
});

export const lookupBookByIsbn = asyncHandler(async (req, res) => {
  const sellerId = req.user?.id;
  const result = await lookupBookByIsbnService(
    req.params.isbn as string,
    sellerId,
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    exists: result.exists,
    alreadyListedBySeller: result.alreadyListedBySeller,
    existingListingId: result.existingListingId,
    message: result.exists
      ? "Book found in catalog"
      : "No Book found with this ISBN",
    data: result.book,
  });
});

export const createBook = asyncHandler(async (req, res) => {
  const book = await createBookService(
    req.body as CreateBookInput,
    req.user!.id,
  );

  apiResponse(res, HTTP_STATUS.CREATED, "Book created successfully", book);
});

export const updateBook = asyncHandler(async (req, res) => {
  const book = await updateBookService(
    req.params.id as string,
    req.user!,
    req.body as UpdateBookInput,
  );

  apiResponse(res, HTTP_STATUS.OK, "Book updated successfully", book);
});

export const toggleBookStatus = asyncHandler(async (req, res) => {
  const bookId = req.params.id as string;
  const userContext = req.user!;
  const body = req.body as ToggleBookStatusInput;

  const targetStatus = body?.status !== undefined ? body.status : body?.isActive;
  const book = await toggleBookStatusService(
    bookId,
    userContext,
    targetStatus,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    `Book ${book.status === "ACTIVE" ? "activated" : "deactivated"} successfully`,
    book,
  );
});



import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getBooksService,
  getBookByIdOrSlugService,
  createBookService,
  updateBookService,
} from "../services/book.service.js";
import type {
  BookQueryInput,
  CreateBookInput,
  UpdateBookInput,
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

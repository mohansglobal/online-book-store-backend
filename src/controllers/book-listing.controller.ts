import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getBookListingsService,
  getBookListingByIdService,
  createBookListingService,
  updateBookListingService,
  deleteBookListingService,
} from "../services/book-listing.service.js";
import type {
  BookListingQueryInput,
  CreateBookListingInput,
  UpdateBookListingInput,
} from "../validation/book-listing.schema.js";

export const getBookListings = asyncHandler(async (req, res) => {
  const { listings, meta } = await getBookListingsService(
    req.query as unknown as BookListingQueryInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Book listings retrieved successfully",
    listings,
    meta,
  );
});

export const getBookListingById = asyncHandler(async (req, res) => {
  const listing = await getBookListingByIdService(req.params.id as string);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Book listing retrieved successfully",
    listing,
  );
});

export const createBookListing = asyncHandler(async (req, res) => {
  const listing = await createBookListingService(
    req.body as CreateBookListingInput,
    req.user!.id,
  );

  apiResponse(
    res,
    HTTP_STATUS.CREATED,
    "Book listing created successfully",
    listing,
  );
});

export const updateBookListing = asyncHandler(async (req, res) => {
  const listing = await updateBookListingService(
    req.params.id as string,
    req.user!,
    req.body as UpdateBookListingInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Book listing updated successfully",
    listing,
  );
});

export const deleteBookListing = asyncHandler(async (req, res) => {
  await deleteBookListingService(req.params.id as string, req.user!);

  apiResponse(res, HTTP_STATUS.OK, "Book listing deleted successfully");
});

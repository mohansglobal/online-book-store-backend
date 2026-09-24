import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getBookListingsService,
  getBookListingByIdService,
  createBookListingService,
  updateBookListingService,
  deleteBookListingService,
  getMyBookListingsService,
  updateListingStockService,
  toggleBookListingStatusService,
  applyListingDiscountService,
} from "../services/book-listing.service.js";
import type {
  BookListingQueryInput,
  CreateBookListingInput,
  UpdateBookListingInput,
  MyBookListingQueryInput,
  UpdateStockInput,
  ToggleBookListingStatusInput,
  ApplyListingDiscountInput,
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

export const getMyBookListings = asyncHandler(async (req, res) => {
  const sellerId = req.user!.id;
  const { listings, meta } = await getMyBookListingsService(
    sellerId,
    req.query as unknown as MyBookListingQueryInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Seller book listings retrieved successfully",
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

export const updateListingStock = asyncHandler(async (req, res) => {
  const listingId = req.params.id as string;
  const userContext = req.user!;
  const input = req.body as UpdateStockInput;

  const listing = await updateListingStockService(
    listingId,
    userContext,
    input,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Book listing stock updated successfully",
    listing,
  );
});

export const deleteBookListing = asyncHandler(async (req, res) => {
  await deleteBookListingService(req.params.id as string, req.user!);

  apiResponse(res, HTTP_STATUS.OK, "Book listing deleted successfully");
});

export const toggleBookListingStatus = asyncHandler(async (req, res) => {
  const listingId = req.params.id as string;
  const userContext = req.user!;
  const body = req.body as ToggleBookListingStatusInput;

  const listing = await toggleBookListingStatusService(
    listingId,
    userContext,
    body?.isActive,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    `Book listing ${listing.isActive ? "activated" : "deactivated"} successfully`,
    listing,
  );
});

export const applyListingDiscount = asyncHandler(async (req, res) => {
  const listingId = req.params.id as string;
  const userContext = req.user!;
  const input = req.body as ApplyListingDiscountInput;

  const listing = await applyListingDiscountService(
    listingId,
    userContext,
    input,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Listing discount applied and selling price updated successfully",
    listing,
  );
});




import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getWishlistService,
  addToWishlistService,
  syncWishlistService,
  removeFromWishlistService,
  clearWishlistService,
} from "../services/wishlist.service.js";
import type {
  AddToWishlistInput,
  SyncWishlistInput,
} from "../validation/wishlist.schema.js";

export const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await getWishlistService(req.user!.id);
  apiResponse(res, HTTP_STATUS.OK, "Wishlist retrieved successfully", wishlist);
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const wishlist = await addToWishlistService(
    req.user!.id,
    req.body as AddToWishlistInput,
  );
  apiResponse(res, HTTP_STATUS.OK, "Book added to wishlist successfully", wishlist);
});

export const syncWishlist = asyncHandler(async (req, res) => {
  const wishlist = await syncWishlistService(
    req.user!.id,
    req.body as SyncWishlistInput,
  );
  apiResponse(res, HTTP_STATUS.OK, "Wishlist synced successfully", wishlist);
});

export const removeFromWishlist = asyncHandler(async (req, res) => {
  const bookId = (req.params.bookId || req.params.id) as string;
  const wishlist = await removeFromWishlistService(req.user!.id, bookId);
  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Book removed from wishlist successfully",
    wishlist,
  );
});

export const clearWishlist = asyncHandler(async (req, res) => {
  const result = await clearWishlistService(req.user!.id);
  apiResponse(res, HTTP_STATUS.OK, "Wishlist cleared successfully", result);
});

import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getCartService,
  addToCartService,
  syncCartService,
  updateCartItemService,
  removeFromCartService,
  clearCartService,
} from "../services/cart.service.js";
import type {
  AddToCartInput,
  SyncCartInput,
  UpdateCartItemInput,
} from "../validation/cart.schema.js";

export const getCart = asyncHandler(async (req, res) => {
  const cart = await getCartService(req.user!.id);
  apiResponse(res, HTTP_STATUS.OK, "Cart retrieved successfully", cart);
});

export const addToCart = asyncHandler(async (req, res) => {
  const cart = await addToCartService(req.user!.id, req.body as AddToCartInput);
  apiResponse(res, HTTP_STATUS.OK, "Item added to cart successfully", cart);
});

export const syncCart = asyncHandler(async (req, res) => {
  const cart = await syncCartService(req.user!.id, req.body as SyncCartInput);
  apiResponse(res, HTTP_STATUS.OK, "Cart synced successfully", cart);
});

export const updateCartItem = asyncHandler(async (req, res) => {
  const cart = await updateCartItemService(
    req.user!.id,
    req.params.bookListingId as string,
    req.body as UpdateCartItemInput,
  );
  apiResponse(res, HTTP_STATUS.OK, "Cart item updated successfully", cart);
});

export const removeFromCart = asyncHandler(async (req, res) => {
  const cart = await removeFromCartService(
    req.user!.id,
    req.params.bookListingId as string,
  );
  apiResponse(res, HTTP_STATUS.OK, "Item removed from cart successfully", cart);
});

export const clearCart = asyncHandler(async (req, res) => {
  const result = await clearCartService(req.user!.id);
  apiResponse(res, HTTP_STATUS.OK, "Cart cleared successfully", result);
});

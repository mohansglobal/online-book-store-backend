import { Router } from "express";

import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  addToCartSchema,
  syncCartSchema,
  updateCartItemSchema,
  cartParamSchema,
} from "../validation/cart.schema.js";
import {
  getCart,
  addToCart,
  syncCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from "../controllers/cart.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getCart);
router.post("/", validate(addToCartSchema, "body"), addToCart);
router.post("/sync", validate(syncCartSchema, "body"), syncCart);
router.patch(
  "/:bookListingId",
  validate(cartParamSchema, "params"),
  validate(updateCartItemSchema, "body"),
  updateCartItem,
);
router.delete("/:bookListingId", validate(cartParamSchema, "params"), removeFromCart);
router.delete("/", clearCart);

export default router;

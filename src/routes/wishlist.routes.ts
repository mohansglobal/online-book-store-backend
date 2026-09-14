import { Router } from "express";

import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  addToWishlistSchema,
  syncWishlistSchema,
  wishlistParamSchema,
} from "../validation/wishlist.schema.js";
import {
  getWishlist,
  addToWishlist,
  syncWishlist,
  removeFromWishlist,
  clearWishlist,
} from "../controllers/wishlist.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getWishlist);
router.post("/", validate(addToWishlistSchema, "body"), addToWishlist);
router.post("/sync", validate(syncWishlistSchema, "body"), syncWishlist);
router.delete(
  "/:bookId",
  validate(wishlistParamSchema, "params"),
  removeFromWishlist,
);
router.delete("/", clearWishlist);

export default router;

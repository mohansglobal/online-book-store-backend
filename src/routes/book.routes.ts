import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../middlewares/auth.middleware.js";
import {
  bookQuerySchema,
  bookParamSchema,
  bookIsbnParamSchema,
  createBookSchema,
  updateBookSchema,
  toggleBookStatusSchema,
} from "../validation/book.schema.js";
import {
  getBooks,
  getBookByIdOrSlug,
  lookupBookByIsbn,
  createBook,
  updateBook,
  toggleBookStatus,
} from "../controllers/book.controller.js";

const router = Router();

router.get("/", validate(bookQuerySchema, "query"), getBooks);
router.get(
  "/isbn/:isbn",
  optionalAuthenticate,
  validate(bookIsbnParamSchema, "params"),
  lookupBookByIsbn,
);
router.get("/:idOrSlug", validate(bookParamSchema, "params"), getBookByIdOrSlug);
router.post(
  "/",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(createBookSchema, "body"),
  createBook,
);
router.patch(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(updateBookSchema, "body"),
  updateBook,
);
router.patch(
  "/:id/status",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(toggleBookStatusSchema, "body"),
  toggleBookStatus,
);
router.patch(
  "/:id/toggle-status",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(toggleBookStatusSchema, "body"),
  toggleBookStatus,
);

export default router;


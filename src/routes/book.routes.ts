import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  bookQuerySchema,
  bookParamSchema,
  createBookSchema,
  updateBookSchema,
} from "../validation/book.schema.js";
import {
  getBooks,
  getBookByIdOrSlug,
  createBook,
  updateBook,
} from "../controllers/book.controller.js";

const router = Router();

router.get("/", validate(bookQuerySchema, "query"), getBooks);
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

export default router;

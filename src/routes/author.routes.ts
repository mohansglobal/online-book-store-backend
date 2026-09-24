import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  authorQuerySchema,
  authorParamSchema,
  authorIdParamSchema,
  createAuthorSchema,
  updateAuthorSchema,
} from "../validation/author.schema.js";
import {
  getAuthors,
  getAuthorByIdOrSlug,
  createAuthor,
  updateAuthor,
  deleteAuthor,
} from "../controllers/author.controller.js";

const router = Router();

router.get("/", validate(authorQuerySchema, "query"), getAuthors);
router.get(
  "/:idOrSlug",
  validate(authorParamSchema, "params"),
  getAuthorByIdOrSlug,
);
router.post(
  "/",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(createAuthorSchema, "body"),
  createAuthor,
);
router.patch(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(authorIdParamSchema, "params"),
  validate(updateAuthorSchema, "body"),
  updateAuthor,
);
router.delete(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(authorIdParamSchema, "params"),
  deleteAuthor,
);

export default router;




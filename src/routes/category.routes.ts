import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { uploadFlexibleImagesMiddleware } from "../middlewares/upload.middleware.js";
import {
  categoryQuerySchema,
  categorySlugParamSchema,
  categoryIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
} from "../validation/category.schema.js";
import {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller.js";

const router = Router();

router.get("/", validate(categoryQuerySchema, "query"), getCategories);
router.get("/:slug", validate(categorySlugParamSchema, "params"), getCategoryBySlug);

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  uploadFlexibleImagesMiddleware,
  validate(createCategorySchema, "body"),
  createCategory,
);

router.patch(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  uploadFlexibleImagesMiddleware,
  validate(categoryIdParamSchema, "params"),
  validate(updateCategorySchema, "body"),
  updateCategory,
);

router.put(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  uploadFlexibleImagesMiddleware,
  validate(categoryIdParamSchema, "params"),
  validate(updateCategorySchema, "body"),
  updateCategory,
);

router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(categoryIdParamSchema, "params"),
  deleteCategory,
);

export default router;


import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import {
  categoryQuerySchema,
  categorySlugParamSchema,
} from "../validation/category.schema.js";
import {
  getCategories,
  getCategoryBySlug,
} from "../controllers/category.controller.js";

const router = Router();

router.get("/", validate(categoryQuerySchema, "query"), getCategories);
router.get("/:slug", validate(categorySlugParamSchema, "params"), getCategoryBySlug);

export default router;

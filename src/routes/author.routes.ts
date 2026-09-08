import { Router } from "express";

import { validate } from "../middlewares/validate.middleware.js";
import {
  authorQuerySchema,
  authorSlugParamSchema,
} from "../validation/author.schema.js";
import {
  getAuthors,
  getAuthorBySlug,
} from "../controllers/author.controller.js";

const router = Router();

router.get("/", validate(authorQuerySchema, "query"), getAuthors);
router.get("/:slug", validate(authorSlugParamSchema, "params"), getAuthorBySlug);

export default router;

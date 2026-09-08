import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getCategoriesService,
  getCategoryBySlugService,
} from "../services/category.service.js";
import type { CategoryQueryInput } from "../validation/category.schema.js";

export const getCategories = asyncHandler(async (req, res) => {
  const { categories, meta } = await getCategoriesService(
    req.query as unknown as CategoryQueryInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Categories retrieved successfully",
    categories,
    meta,
  );
});

export const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await getCategoryBySlugService(req.params.slug as string);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Category retrieved successfully",
    category,
  );
});

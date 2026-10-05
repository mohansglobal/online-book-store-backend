import type { Request } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getCategoriesService,
  getCategoryBySlugService,
  createCategoryService,
  updateCategoryService,
  deleteCategoryService,
} from "../services/category.service.js";
import type {
  CategoryQueryInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../validation/category.schema.js";

const extractSingleFile = (req: Request): Express.Multer.File | undefined => {
  if (req.file) {
    return req.file;
  }
  if (Array.isArray(req.files) && req.files.length > 0) {
    return req.files[0];
  }
  if (req.files && typeof req.files === "object") {
    const filesDict = req.files as Record<string, Express.Multer.File[]>;
    const fileList =
      filesDict.image ||
      filesDict.file ||
      filesDict.coverImage ||
      Object.values(filesDict).flat();
    if (fileList && fileList.length > 0) {
      return fileList[0];
    }
  }
  return undefined;
};

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

export const createCategory = asyncHandler(async (req, res) => {
  const file = extractSingleFile(req);
  const input = req.body as CreateCategoryInput;
  const category = await createCategoryService(input, file);

  apiResponse(
    res,
    HTTP_STATUS.CREATED,
    "Category created successfully",
    category,
  );
});

export const updateCategory = asyncHandler(async (req, res) => {
  const file = extractSingleFile(req);
  const categoryId = req.params.id as string;
  const input = req.body as UpdateCategoryInput;

  const category = await updateCategoryService(categoryId, input, file);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Category updated successfully",
    category,
  );
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const categoryId = req.params.id as string;

  const category = await deleteCategoryService(categoryId);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Category deactivated successfully",
    category,
  );
});


import { CategoryModel } from "../models/category.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import type { CategoryQueryInput } from "../validation/category.schema.js";

export const getCategoriesService = async (query: CategoryQueryInput) => {
  const filter: Record<string, unknown> = {};

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  }

  if (query.search) {
    const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedSearch, "i");
    filter.$or = [
      { name: { $regex: searchRegex } },
      { nameBn: { $regex: searchRegex } },
      { slug: { $regex: searchRegex } },
    ];
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [categories, total] = await Promise.all([
    CategoryModel.find(filter)
      .sort({ [query.sortBy]: query.sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CategoryModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    categories,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const getCategoryBySlugService = async (slug: string) => {
  const normalizedSlug = slug.toLowerCase().trim();

  const category = await CategoryModel.findOne({ slug: normalizedSlug }).lean();

  if (!category) {
    throw new AppError("Category not found", HTTP_STATUS.NOT_FOUND);
  }

  return category;
};

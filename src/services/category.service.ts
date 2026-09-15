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

  const page = query.page ?? 1;
  const limit = query.limit;
  const isUnlimited = limit === undefined || limit === 0;

  let queryBuilder = CategoryModel.find(filter).sort({
    [query.sortBy]: query.sortOrder === "asc" ? 1 : -1,
  });

  if (!isUnlimited) {
    const skip = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(skip).limit(limit);
  }

  const [categories, total] = await Promise.all([
    queryBuilder.lean(),
    CategoryModel.countDocuments(filter),
  ]);

  const totalPages = isUnlimited ? 1 : Math.ceil(total / limit) || 1;

  return {
    categories,
    meta: {
      page: isUnlimited ? 1 : page,
      limit: isUnlimited ? total : limit,
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

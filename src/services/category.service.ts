import mongoose from "mongoose";
import { CategoryModel } from "../models/category.model.js";
import { BookModel } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
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

  if (query.hasBooks) {
    const activeBookIds = await BookListingModel.find({ isActive: true }).distinct("book");
    const categoriesWithListings = await BookModel.find({
      _id: { $in: activeBookIds },
      status: "ACTIVE",
    }).distinct("categories");
    filter._id = { ...((filter._id as object) || {}), $in: categoriesWithListings };
  }

  const page = query.page ?? 1;
  const limit = query.limit;
  const isUnlimited = limit === undefined || limit === 0;

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  let queryBuilder = CategoryModel.find(filter).sort({
    [query.sortBy]: sortDirection,
  });

  if (!isUnlimited) {
    const skip = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(skip).limit(limit);
  }

  const [categories, total] = await Promise.all([
    queryBuilder.lean(),
    CategoryModel.countDocuments(filter),
  ]);

  // Fetch book listing counts for the retrieved categories from BookListing table
  const categoryIds = categories.map((c) => c._id);
  let countMap = new Map<string, number>();

  if (categoryIds.length > 0) {
    const listingCounts = await BookListingModel.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      { $unwind: "$bookDoc" },
      {
        $match: {
          "bookDoc.status": "ACTIVE",
          "bookDoc.categories": { $in: categoryIds },
        },
      },
      { $unwind: "$bookDoc.categories" },
      { $match: { "bookDoc.categories": { $in: categoryIds } } },
      {
        $group: {
          _id: "$bookDoc.categories",
          count: { $sum: 1 },
        },
      },
    ]);

    countMap = new Map(
      listingCounts.map((b) => [b._id.toString(), b.count]),
    );
  }

  const categoriesWithCount = categories.map((c) => ({
    ...c,
    bookCount: countMap.get(c._id.toString()) || 0,
  }));

  const totalPages = isUnlimited ? 1 : Math.ceil(total / limit) || 1;

  return {
    categories: categoriesWithCount,
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

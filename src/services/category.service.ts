import mongoose from "mongoose";
import { CategoryModel } from "../models/category.model.js";
import { BookModel } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import { uploadImageBuffer } from "./cloudinary.service.js";
import type {
  CategoryQueryInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../validation/category.schema.js";

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

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

export const getCategoryBySlugService = async (slugOrId: string) => {
  const trimmed = slugOrId.trim();
  const normalizedSlug = trimmed.toLowerCase();
  const isObjectId = mongoose.Types.ObjectId.isValid(trimmed);

  const filter = isObjectId
    ? { $or: [{ _id: trimmed }, { slug: normalizedSlug }] }
    : { slug: normalizedSlug };

  const category = await CategoryModel.findOne(filter).lean();

  if (!category) {
    throw new AppError("Category not found", HTTP_STATUS.NOT_FOUND);
  }

  return category;
};

export const createCategoryService = async (
  input: CreateCategoryInput,
  file?: Express.Multer.File,
) => {
  let image = input.image ? input.image.trim() : undefined;

  if (file) {
    const uploadResult = await uploadImageBuffer(file.buffer, {
      folder: "bookstore/categories",
    });
    image = uploadResult.secureUrl || uploadResult.url;
  }

  const name = input.name.trim();
  const nameBn = input.nameBn ? input.nameBn.trim() : undefined;
  const description = input.description ? input.description.trim() : undefined;
  const isActive = input.isActive ?? true;

  let baseSlug = input.slug?.toLowerCase().trim();
  if (!baseSlug) {
    baseSlug = slugify(name);
    if (!baseSlug) {
      baseSlug = "category";
    }
  }

  let slug = baseSlug;
  let counter = 1;
  while (await CategoryModel.exists({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  const category = await CategoryModel.create({
    name,
    nameBn,
    slug,
    description,
    image,
    isActive,
  });

  logger.info(
    {
      categoryId: category._id,
      name: category.name,
      slug: category.slug,
    },
    "Category created successfully by admin",
  );

  return category;
};

export const updateCategoryService = async (
  id: string,
  input: UpdateCategoryInput,
  file?: Express.Multer.File,
) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(id);

  if (!isObjectId) {
    throw new AppError("Invalid category ID", HTTP_STATUS.BAD_REQUEST);
  }

  const category = await CategoryModel.findById(id);

  if (!category) {
    throw new AppError("Category not found", HTTP_STATUS.NOT_FOUND);
  }

  if (file) {
    const uploadResult = await uploadImageBuffer(file.buffer, {
      folder: "bookstore/categories",
    });
    category.image = uploadResult.secureUrl || uploadResult.url;
  } else if (input.image !== undefined) {
    category.image = input.image ? input.image.trim() : undefined;
  }

  if (input.slug !== undefined) {
    const normalizedSlug = input.slug.toLowerCase().trim();
    const existing = await CategoryModel.findOne({
      slug: normalizedSlug,
      _id: { $ne: id },
    }).lean();

    if (existing) {
      throw new AppError(
        "A category with this slug already exists",
        HTTP_STATUS.CONFLICT,
      );
    }

    category.slug = normalizedSlug;
  }

  if (input.name !== undefined) {
    category.name = input.name.trim();
  }

  if (input.nameBn !== undefined) {
    category.nameBn = input.nameBn ? input.nameBn.trim() : undefined;
  }

  if (input.description !== undefined) {
    category.description = input.description ? input.description.trim() : undefined;
  }

  if (input.isActive !== undefined) {
    category.isActive = input.isActive;
  }

  await category.save();

  logger.info(
    {
      categoryId: category._id,
      name: category.name,
      slug: category.slug,
      isActive: category.isActive,
    },
    "Category updated successfully by admin",
  );

  return category;
};

export const deleteCategoryService = async (id: string) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(id);

  if (!isObjectId) {
    throw new AppError("Invalid category ID", HTTP_STATUS.BAD_REQUEST);
  }

  const category = await CategoryModel.findById(id);

  if (!category) {
    throw new AppError("Category not found", HTTP_STATUS.NOT_FOUND);
  }

  category.isActive = false;
  await category.save();

  logger.info(
    {
      categoryId: category._id,
      name: category.name,
      slug: category.slug,
      isActive: category.isActive,
    },
    "Category deactivated (soft-deleted) successfully by admin",
  );

  return category;
};


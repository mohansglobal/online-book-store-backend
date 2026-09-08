import { AuthorModel } from "../models/author.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import type { AuthorQueryInput } from "../validation/author.schema.js";

export const getAuthorsService = async (query: AuthorQueryInput) => {
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
      { bio: { $regex: searchRegex } },
    ];
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [authors, total] = await Promise.all([
    AuthorModel.find(filter)
      .sort({ [query.sortBy]: query.sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuthorModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    authors,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const getAuthorBySlugService = async (slug: string) => {
  const normalizedSlug = slug.toLowerCase().trim();

  const author = await AuthorModel.findOne({ slug: normalizedSlug }).lean();

  if (!author) {
    throw new AppError("Author not found", HTTP_STATUS.NOT_FOUND);
  }

  return author;
};

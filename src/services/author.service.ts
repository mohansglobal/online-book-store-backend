import mongoose from "mongoose";

import { AuthorModel } from "../models/author.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import type {
  AuthorQueryInput,
  CreateAuthorInput,
  UpdateAuthorInput,
} from "../validation/author.schema.js";

export const getAuthorsService = async (query: AuthorQueryInput) => {
  const filter: Record<string, unknown> = {
    isDel: { $ne: true },
  };

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

  const page = query.page ?? 1;
  const limit = query.limit;
  const isUnlimited = limit === undefined || limit === 0;

  const sortBy = query.sortBy ?? "createdAt";
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  let queryBuilder = AuthorModel.find(filter).sort({
    [sortBy]: sortDirection,
  });

  if (!isUnlimited) {
    const skip = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(skip).limit(limit);
  }

  const [authors, total] = await Promise.all([
    queryBuilder.lean(),
    AuthorModel.countDocuments(filter),
  ]);

  const totalPages = isUnlimited ? 1 : Math.ceil(total / limit) || 1;

  return {
    authors,
    meta: {
      page: isUnlimited ? 1 : page,
      limit: isUnlimited ? total : limit,
      total,
      totalPages,
    },
  };
};

export const getAuthorByIdOrSlugService = async (idOrSlug: string) => {
  const trimmed = idOrSlug.trim();
  const normalizedSlug = trimmed.toLowerCase();
  const isObjectId = mongoose.Types.ObjectId.isValid(trimmed);

  const filter: Record<string, unknown> = {
    isDel: { $ne: true },
  };

  if (isObjectId) {
    filter.$or = [{ _id: trimmed }, { slug: normalizedSlug }];
  } else {
    filter.slug = normalizedSlug;
  }

  const author = await AuthorModel.findOne(filter).lean();

  if (!author) {
    throw new AppError("Author not found", HTTP_STATUS.NOT_FOUND);
  }

  return author;
};

export const getAuthorBySlugService = getAuthorByIdOrSlugService;

export const createAuthorService = async (input: CreateAuthorInput) => {
  const authorName = input.name.trim();
  const authorNameBn = input.nameBn?.trim();
  const bio = input.bio?.trim();
  const photo = input.photo?.trim();
  const birthDate = input.birthDate;
  const deathDate = input.deathDate;
  const isActive = input.isActive ?? true;

  const author = await AuthorModel.create({
    name: authorName,
    nameBn: authorNameBn,
    bio,
    photo,
    birthDate,
    deathDate,
    isActive,
    isDel: false,
  });

  logger.info(
    {
      authorId: author._id,
      name: author.name,
      slug: author.slug,
    },
    "Author created successfully by admin",
  );

  return author;
};

export const updateAuthorService = async (
  id: string,
  input: UpdateAuthorInput,
) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(id);

  if (!isObjectId) {
    throw new AppError("Invalid author ID", HTTP_STATUS.BAD_REQUEST);
  }

  const author = await AuthorModel.findOne({
    _id: id,
    isDel: { $ne: true },
  });

  if (!author) {
    throw new AppError("Author not found", HTTP_STATUS.NOT_FOUND);
  }

  if (input.name !== undefined) {
    author.name = input.name.trim();
  }

  if (input.nameBn !== undefined) {
    author.nameBn = input.nameBn.trim();
  }

  if (input.bio !== undefined) {
    author.bio = input.bio.trim();
  }

  if (input.photo !== undefined) {
    author.photo = input.photo.trim();
  }

  if (input.birthDate !== undefined) {
    author.birthDate = input.birthDate;
  }

  if (input.deathDate !== undefined) {
    author.deathDate = input.deathDate;
  }

  if (input.isActive !== undefined) {
    author.isActive = input.isActive;
  }

  await author.save();

  logger.info(
    {
      authorId: author._id,
      name: author.name,
      slug: author.slug,
    },
    "Author updated successfully",
  );

  return author;
};

export const deleteAuthorService = async (id: string) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(id);

  if (!isObjectId) {
    throw new AppError("Invalid author ID", HTTP_STATUS.BAD_REQUEST);
  }

  const author = await AuthorModel.findOne({
    _id: id,
    isDel: { $ne: true },
  });

  if (!author) {
    throw new AppError("Author not found", HTTP_STATUS.NOT_FOUND);
  }

  author.isDel = true;
  await author.save();

  logger.info(
    {
      authorId: author._id,
      name: author.name,
      slug: author.slug,
    },
    "Author soft-deleted successfully",
  );

  return author;
};




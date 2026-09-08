import mongoose from "mongoose";

import { PublisherModel } from "../models/publisher.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import type {
  PublisherQueryInput,
  CreatePublisherInput,
  UpdatePublisherInput,
} from "../validation/publisher.schema.js";

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const getPublishersService = async (query: PublisherQueryInput) => {
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
      { description: { $regex: searchRegex } },
    ];
  }

  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [publishers, total] = await Promise.all([
    PublisherModel.find(filter)
      .sort({ [query.sortBy]: query.sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PublisherModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    publishers,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const getPublisherByIdOrSlugService = async (idOrSlug: string) => {
  const trimmed = idOrSlug.trim();
  const isObjectId = mongoose.Types.ObjectId.isValid(trimmed);

  const publisher = await PublisherModel.findOne(
    isObjectId
      ? { $or: [{ _id: trimmed }, { slug: trimmed.toLowerCase() }] }
      : { slug: trimmed.toLowerCase() },
  ).lean();

  if (!publisher) {
    throw new AppError("Publisher not found", HTTP_STATUS.NOT_FOUND);
  }

  return publisher;
};

export const createPublisherService = async (input: CreatePublisherInput) => {
  let baseSlug = slugify(input.name);
  if (!baseSlug) {
    baseSlug = "publisher";
  }

  let slug = baseSlug;
  let counter = 1;
  while (await PublisherModel.exists({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  if (input.email) {
    const existingEmail = await PublisherModel.findOne({
      email: input.email.toLowerCase(),
    }).lean();
    if (existingEmail) {
      throw new AppError(
        "A publisher with this email already exists",
        HTTP_STATUS.CONFLICT,
      );
    }
  }

  if (input.phone) {
    const existingPhone = await PublisherModel.findOne({
      phone: input.phone.trim(),
    }).lean();
    if (existingPhone) {
      throw new AppError(
        "A publisher with this phone number already exists",
        HTTP_STATUS.CONFLICT,
      );
    }
  }

  const newPublisher = await PublisherModel.create({
    name: input.name,
    nameBn: input.nameBn,
    slug,
    email: input.email?.toLowerCase(),
    phone: input.phone?.trim(),
    website: input.website,
    logo: input.logo,
    description: input.description,
    isActive: true,
  });

  logger.info(
    { publisherId: newPublisher._id, name: newPublisher.name },
    "Publisher created by admin",
  );

  return newPublisher;
};

export const updatePublisherService = async (
  id: string,
  userContext: { id: string; role: string },
  input: UpdatePublisherInput,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid publisher ID", HTTP_STATUS.BAD_REQUEST);
  }

  const publisher = await PublisherModel.findById(id);
  if (!publisher) {
    throw new AppError("Publisher not found", HTTP_STATUS.NOT_FOUND);
  }

  // Check authorization: must be ADMIN or a SELLER linked to this publisher profile
  if (userContext.role !== "ADMIN") {
    const isOwner = await UserModel.exists({
      _id: userContext.id,
      publisher: publisher._id,
      role: "SELLER",
      isActive: true,
    });
    if (!isOwner) {
      throw new AppError(
        "Forbidden: You do not own this publisher profile",
        HTTP_STATUS.FORBIDDEN,
      );
    }
  }

  if (input.email && input.email.toLowerCase() !== publisher.email) {
    const existingEmail = await PublisherModel.findOne({
      email: input.email.toLowerCase(),
      _id: { $ne: publisher._id },
    }).lean();
    if (existingEmail) {
      throw new AppError(
        "Email is already used by another publisher",
        HTTP_STATUS.CONFLICT,
      );
    }
    publisher.email = input.email.toLowerCase();
  }

  if (input.phone && input.phone.trim() !== publisher.phone) {
    const existingPhone = await PublisherModel.findOne({
      phone: input.phone.trim(),
      _id: { $ne: publisher._id },
    }).lean();
    if (existingPhone) {
      throw new AppError(
        "Phone number is already used by another publisher",
        HTTP_STATUS.CONFLICT,
      );
    }
    publisher.phone = input.phone.trim();
  }

  if (input.name && input.name.trim() !== publisher.name) {
    publisher.name = input.name.trim();
  }

  if (input.nameBn !== undefined) publisher.nameBn = input.nameBn;
  if (input.website !== undefined) publisher.website = input.website;
  if (input.logo !== undefined) publisher.logo = input.logo;
  if (input.description !== undefined) publisher.description = input.description;
  if (input.isActive !== undefined && userContext.role === "ADMIN") {
    publisher.isActive = input.isActive;
  }

  await publisher.save();

  logger.info({ publisherId: publisher._id }, "Publisher updated successfully");

  return publisher;
};

export const getMyPublisherProfileService = async (userId: string) => {
  const user = await UserModel.findById(userId)
    .populate("publisher")
    .lean();

  if (!user || !user.publisher) {
    throw new AppError(
      "No publisher profile linked to your account",
      HTTP_STATUS.NOT_FOUND,
    );
  }

  return user.publisher;
};

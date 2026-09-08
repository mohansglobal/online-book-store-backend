import fs from "fs";
import path from "path";
import mongoose from "mongoose";

import { env } from "../config/env.js";
import { PublisherModel } from "../models/publisher.model.js";
import { logger } from "../utils/logger.js";

type RawShopPublisher = {
  id: string;
  origin_country?: string;
  name: string;
  name_bn?: string | null;
  address?: string | null;
  phone?: string | null;
  dob?: string | null;
  description?: string | null;
  image?: string | null;
  is_image?: string | null;
  role_id?: string | null;
  user_id?: string | null;
  status: string;
};

type PublisherSeedData = {
  legacyId: string;
  originCountry?: string;
  name: string;
  nameBn?: string;
  slug: string;
  address?: string;
  phone?: string;
  dob?: string;
  description?: string;
  image?: string;
  logo?: string;
  isImage?: string;
  roleId?: string;
  userId?: string;
  status: string;
  isActive: boolean;
};

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const cleanText = (str?: string | null): string | undefined => {
  if (str === null || str === undefined) return undefined;
  const trimmed = String(str).trim();
  if (!trimmed || trimmed === "null" || trimmed === "0000-00-00") return undefined;
  return trimmed;
};

const cleanPhone = (phone?: string | null): string | undefined => {
  if (!phone) return undefined;
  const trimmed = String(phone).trim();
  if (!trimmed || trimmed === "0" || trimmed === "null") return undefined;
  return trimmed;
};

const extractShopPublisherData = (): RawShopPublisher[] => {
  const filePath = path.join(process.cwd(), "src", "data", "shop_publisher (1).json");
  const rawFile = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(rawFile);

  if (Array.isArray(parsed)) {
    const tableObj = parsed.find(
      (item) => item.type === "table" && "data" in item && Array.isArray(item.data),
    ) as { data: RawShopPublisher[] } | undefined;

    if (tableObj && Array.isArray(tableObj.data)) {
      return tableObj.data;
    }
  }
  throw new Error("Could not find table data in shop_publisher (1).json");
};

const seedPublishers = async (): Promise<void> => {
  try {
    logger.info("Connecting to MongoDB for publisher seeding...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    // 1. Delete existing publishers table/collection as requested
    logger.info("Clearing existing publishers collection...");
    const deleteResult = await PublisherModel.deleteMany({});
    logger.info({ deletedCount: deleteResult.deletedCount }, "Publishers collection cleared");

    // 2. Extract raw data from shop_publisher (1).json
    const rawPublishers = extractShopPublisherData();
    logger.info(`Raw publishers extracted from JSON: ${rawPublishers.length}`);

    // 3. Process, clean, and deduplicate
    const usedSlugs = new Set<string>();
    const publishersToInsert: PublisherSeedData[] = [];

    for (const raw of rawPublishers) {
      const name = cleanText(raw.name);
      if (!name) continue;

      let baseSlug = slugify(name);
      if (!baseSlug) baseSlug = `publisher-${raw.id}`;

      let slug = baseSlug;
      let counter = 1;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      usedSlugs.add(slug);

      const phone = cleanPhone(raw.phone);
      const nameBn = cleanText(raw.name_bn);
      const address = cleanText(raw.address);
      const description = cleanText(raw.description);
      const image = cleanText(raw.image);
      const dob = cleanText(raw.dob);
      const originCountry = cleanText(raw.origin_country);
      const isImage = cleanText(raw.is_image) || "0";
      const roleId = cleanText(raw.role_id);
      const userId = cleanText(raw.user_id);
      const status = raw.status?.trim() || "1";
      const isActive = status === "1";

      publishersToInsert.push({
        legacyId: raw.id.trim(),
        originCountry,
        name,
        nameBn,
        slug,
        address,
        phone,
        dob,
        description,
        image,
        logo: image,
        isImage,
        roleId,
        userId,
        status,
        isActive,
      });
    }

    logger.info(`Cleaned into ${publishersToInsert.length} complete publisher documents to insert.`);

    // 4. Bulk insert
    const insertResult = await PublisherModel.insertMany(publishersToInsert, {
      ordered: true,
    });

    logger.info(
      { insertedCount: insertResult.length },
      "Publisher seeding completed successfully with all fields mapped perfectly.",
    );
  } catch (error) {
    logger.error(error, "Failed to seed publishers");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void seedPublishers();

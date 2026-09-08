import mongoose from "mongoose";

import { env } from "../config/env.js";
import { AuthorModel } from "../models/author.model.js";
import { logger } from "../utils/logger.js";
import shopAuthorData from "../data/shop_author.json";

type RawAuthor = {
  id: string;
  name: string;
  name_bn?: string;
  dob?: string;
  description?: string;
  image?: string;
  status: string;
  origin_country?: string;
  is_indian?: string;
  is_image?: string;
};

type AuthorSeedData = {
  name: string;
  nameBn?: string;
  slug: string;
  bio?: string;
  photo?: string;
  birthDate?: Date;
  deathDate?: Date;
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

const parseBirthDate = (dob?: string): Date | undefined => {
  if (!dob || dob === "0000-00-00" || dob === "1970-01-01") {
    return undefined;
  }
  const date = new Date(dob);
  return isNaN(date.getTime()) ? undefined : date;
};

const extractAuthorData = (): RawAuthor[] => {
  if (Array.isArray(shopAuthorData)) {
    const tableObj = shopAuthorData.find(
      (item) => item.type === "table" && "data" in item && Array.isArray(item.data),
    ) as { data: RawAuthor[] } | undefined;

    if (tableObj && Array.isArray(tableObj.data)) {
      return tableObj.data;
    }
  }
  throw new Error("Could not find table data in shop_author.json");
};

const seedAuthors = async (): Promise<void> => {
  try {
    logger.info("Connecting to MongoDB for author seeding...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    const rawAuthors = extractAuthorData();
    logger.info(`Raw authors extracted from JSON: ${rawAuthors.length}`);

    // Deduplicate and merge records by slug so richer data is preserved
    const authorsMap = new Map<string, AuthorSeedData>();

    for (const raw of rawAuthors) {
      const name = raw.name?.trim();
      if (!name) continue;

      const slug = slugify(name);
      if (!slug) continue;

      const nameBn = raw.name_bn?.trim() || undefined;
      const bio = raw.description?.trim() || undefined;
      const photo = raw.image?.trim() || undefined;
      const birthDate = parseBirthDate(raw.dob);
      const isActive = raw.status === "1" || Boolean(bio);

      const existing = authorsMap.get(slug);
      if (!existing) {
        authorsMap.set(slug, {
          name,
          nameBn,
          slug,
          bio,
          photo,
          birthDate,
          isActive,
        });
      } else {
        // Merge preferring non-empty details
        authorsMap.set(slug, {
          name: existing.name || name,
          nameBn: existing.nameBn || nameBn,
          slug,
          bio: existing.bio || bio,
          photo: existing.photo || photo,
          birthDate: existing.birthDate || birthDate,
          isActive: existing.isActive || isActive,
        });
      }
    }

    const cleanAuthors = Array.from(authorsMap.values());
    logger.info(`Cleaned and merged into ${cleanAuthors.length} unique authors to seed.`);

    const bulkOps = cleanAuthors.map((author) => ({
      updateOne: {
        filter: { slug: author.slug },
        update: {
          $set: {
            name: author.name,
            nameBn: author.nameBn,
            slug: author.slug,
            bio: author.bio,
            photo: author.photo,
            birthDate: author.birthDate,
            deathDate: author.deathDate,
            isActive: author.isActive,
          },
        },
        upsert: true,
      },
    }));

    const result = await AuthorModel.bulkWrite(bulkOps);

    logger.info(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      },
      "Author seeding completed successfully",
    );
  } catch (error) {
    logger.error(error, "Failed to seed authors");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void seedAuthors();

import mongoose from "mongoose";

import { env } from "../config/env.js";
import { CategoryModel } from "../models/category.model.js";
import { logger } from "../utils/logger.js";
import shopBookCategoryData from "../data/shop_book_category.json";

type RawCategory = {
  id: string;
  name: string;
  name_bn?: string;
  dob?: string;
  description?: string;
  image?: string;
  status: string;
};

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const extractCategoryData = (): RawCategory[] => {
  if (Array.isArray(shopBookCategoryData)) {
    const tableObj = shopBookCategoryData.find(
      (item) => item.type === "table" && "data" in item && Array.isArray(item.data),
    ) as { data: RawCategory[] } | undefined;

    if (tableObj && Array.isArray(tableObj.data)) {
      return tableObj.data;
    }
  }
  throw new Error("Could not find table data in shop_book_category.json");
};

const seedCategories = async (): Promise<void> => {
  try {
    logger.info("Connecting to MongoDB for category seeding...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    const categories = extractCategoryData();
    logger.info(`Processing ${categories.length} categories...`);

    const bulkOps = categories.map((cat) => {
      const slug = slugify(cat.name);
      return {
        updateOne: {
          filter: { slug },
          update: {
            $set: {
              name: cat.name.trim(),
              nameBn: cat.name_bn?.trim() || undefined,
              slug,
              description: cat.description?.trim() || undefined,
              image: cat.image?.trim() || undefined,
              isActive: cat.status === "1",
            },
          },
          upsert: true,
        },
      };
    });

    const result = await CategoryModel.bulkWrite(bulkOps);

    logger.info(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      },
      "Category seeding completed successfully",
    );
  } catch (error) {
    logger.error(error, "Failed to seed categories");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void seedCategories();

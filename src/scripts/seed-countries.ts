import "dotenv/config";
import mongoose from "mongoose";

import { CountryModel } from "../models/country.model.js";
import { logger } from "../utils/logger.js";
import countriesData from "../data/countries.json";

const seedCountries = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    logger.error("MONGODB_URI is not defined in environment variables");
    process.exit(1);
  }

  try {
    logger.info("Connecting to MongoDB for country seeding...");
    await mongoose.connect(mongoUri);
    logger.info("MongoDB connected successfully");

    logger.info(`Processing ${countriesData.length} countries...`);

    const bulkOps = countriesData.map((country) => ({
      updateOne: {
        filter: { code: country.code.toUpperCase() },
        update: {
          $set: {
            name: country.name,
            code: country.code.toUpperCase(),
            phoneCode: country.phoneCode,
            isActive: true,
          },
        },
        upsert: true,
      },
    }));

    const result = await CountryModel.bulkWrite(bulkOps);

    logger.info(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      },
      "Country seeding completed successfully",
    );
  } catch (error) {
    logger.error(error, "Failed to seed countries");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void seedCountries();

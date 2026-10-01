import { CountryModel } from "../models/country.model.js";

export const getCountriesService = async (search?: string, limit?: number) => {
  const filter: Record<string, unknown> = { isActive: true };

  if (search && search.trim()) {
    const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedSearch, "i");
    filter.$or = [
      { name: { $regex: searchRegex } },
      { code: { $regex: searchRegex } },
    ];
  }

  let queryBuilder = CountryModel.find(filter).sort({ name: 1 });

  if (limit && limit > 0) {
    queryBuilder = queryBuilder.limit(limit);
  }

  const countries = await queryBuilder.lean();

  return countries;
};

/**
 * Resolves a country input (which could be an ObjectId, country name like "India", or code like "IN")
 * to a verified mongoose.Types.ObjectId.
 */
export const resolveCountryId = async (
  countryInput?: string | null,
): Promise<import("mongoose").Types.ObjectId | undefined> => {
  if (!countryInput || !countryInput.trim()) {
    return undefined;
  }

  const cleanInput = countryInput.trim();
  const mongoose = await import("mongoose");

  // 1. If it is already a valid 24-hex ObjectId, verify in DB
  if (mongoose.default.Types.ObjectId.isValid(cleanInput) && /^[0-9a-fA-F]{24}$/.test(cleanInput)) {
    const existingById = await CountryModel.findOne({
      _id: new mongoose.default.Types.ObjectId(cleanInput),
      isActive: true,
    }).lean();

    if (existingById) {
      return existingById._id as import("mongoose").Types.ObjectId;
    }
  }

  // 2. Lookup by country name (case-insensitive) or country code (e.g. "India", "IN")
  const escapedName = cleanInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existingByNameOrCode = await CountryModel.findOne({
    $or: [
      { name: { $regex: new RegExp(`^${escapedName}$`, "i") } },
      { code: cleanInput.toUpperCase() },
    ],
  }).lean();

  if (existingByNameOrCode) {
    return existingByNameOrCode._id as import("mongoose").Types.ObjectId;
  }

  // 3. Fallback: if "India" or "IN" is passed and not yet seeded, upsert it
  if (cleanInput.toLowerCase() === "india" || cleanInput.toUpperCase() === "IN") {
    const indiaDoc = await CountryModel.findOneAndUpdate(
      { code: "IN" },
      {
        $setOnInsert: {
          name: "India",
          code: "IN",
          phoneCode: "+91",
          currency: "INR",
          isActive: true,
        },
      },
      { upsert: true, new: true },
    );

    return indiaDoc._id as import("mongoose").Types.ObjectId;
  }

  return undefined;
};

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

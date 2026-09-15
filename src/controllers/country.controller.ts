import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { getCountriesService } from "../services/country.service.js";

export const getCountries = asyncHandler(async (req, res) => {
  const search = req.query.search as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const countries = await getCountriesService(search, limit);

  apiResponse(res, HTTP_STATUS.OK, "Countries retrieved successfully", countries);
});

import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { getHeroStatsService } from "../services/stats.service.js";

export const getHeroStats = asyncHandler(async (_req, res) => {
  const stats = await getHeroStatsService();

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Hero stats retrieved successfully",
    stats,
  );
});

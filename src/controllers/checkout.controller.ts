import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { getCheckoutSummaryService } from "../services/checkout.service.js";
import type { CheckoutSummaryQuery } from "../validation/checkout.schema.js";

export const getCheckoutSummary = asyncHandler(async (req, res) => {
  const summary = await getCheckoutSummaryService(
    req.user!.id,
    req.query as unknown as CheckoutSummaryQuery,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Checkout summary fetched successfully",
    summary,
  );
});

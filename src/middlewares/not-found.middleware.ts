import type { RequestHandler } from "express";

import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  apiResponse(
    res,
    HTTP_STATUS.NOT_FOUND,
    `Route ${req.method} ${req.originalUrl} not found`,
  );
};

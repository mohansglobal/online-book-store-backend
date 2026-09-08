import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { AppError } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { apiResponse } from "../utils/api-response.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (error instanceof AppError) {
    apiResponse(res, error.statusCode, error.message);
    return;
  }

  if (error instanceof ZodError) {
    const formattedErrors = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    apiResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Validation failed",
      formattedErrors,
      false,
    );
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  ) {
    apiResponse(
      res,
      HTTP_STATUS.CONFLICT,
      "Duplicate resource field value entered",
    );
    return;
  }

  logger.error(error);

  apiResponse(
    res,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    "Internal server error",
  );
};
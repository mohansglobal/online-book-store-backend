import type { Response } from "express";

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export const apiResponse = <T>(
  res: Response,
  statusCode = 200,
  message = "Success",
  data?: T,
  metaOrSuccess?: PaginationMeta | boolean,
  success = typeof metaOrSuccess === "boolean"
    ? metaOrSuccess
    : statusCode >= 200 && statusCode < 300,
) => {
  const meta =
    typeof metaOrSuccess === "object" && metaOrSuccess !== null
      ? metaOrSuccess
      : undefined;

  return res.status(statusCode).json({
    success,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(meta !== undefined ? { meta } : {}),
  });
};
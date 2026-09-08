import type { Request, Response, NextFunction } from "express";

import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  let token: string | undefined = req.cookies?.accessToken as string | undefined;

  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    throw new AppError("Authentication required. Please log in.", HTTP_STATUS.UNAUTHORIZED);
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
    };
    next();
  } catch {
    throw new AppError("Invalid or expired access token", HTTP_STATUS.UNAUTHORIZED);
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError("Authentication required", HTTP_STATUS.UNAUTHORIZED);
    }
    logger.info(req.user.role)
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        "Forbidden: You do not have permission to access this resource",
        HTTP_STATUS.FORBIDDEN,
      );
    }

    next();
  };
};

import multer from "multer";
import type { Request } from "express";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
): void => {
  if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    callback(null, true);
  } else {
    callback(
      new AppError(
        `Unsupported file type: ${file.mimetype}. Allowed formats: JPEG, PNG, WEBP, GIF, SVG, AVIF`,
        HTTP_STATUS.BAD_REQUEST,
      ),
    );
  }
};

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter,
});

export const uploadSingleImage = (fieldName = "image") => upload.single(fieldName);

export const uploadMultipleImages = (fieldName = "images", maxCount = 5) =>
  upload.array(fieldName, maxCount);

export const uploadImageFields = (fields: { name: string; maxCount: number }[]) =>
  upload.fields(fields);

export const uploadProfileImageMiddleware = upload.fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "avatar", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

export const uploadReviewImagesMiddleware = upload.fields([
  { name: "images", maxCount: 5 },
  { name: "files", maxCount: 5 },
  { name: "image", maxCount: 5 },
]);

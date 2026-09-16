import type { Request, Response } from "express";

import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { AppError } from "../utils/app-error.js";
import {
  uploadImagesService,
  deleteImageService,
  type UploadFileInput,
} from "../services/upload.service.js";

const extractFilesFromRequest = (req: Request): UploadFileInput[] => {
  const extractedFiles: UploadFileInput[] = [];

  if (req.file) {
    extractedFiles.push({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
    return extractedFiles;
  }

  if (Array.isArray(req.files)) {
    for (const file of req.files) {
      extractedFiles.push({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
    }
    return extractedFiles;
  }

  if (req.files && typeof req.files === "object") {
    const fileFields = Object.values(req.files);
    for (const fieldFiles of fileFields) {
      if (Array.isArray(fieldFiles)) {
        for (const file of fieldFiles) {
          extractedFiles.push({
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          });
        }
      }
    }
  }

  return extractedFiles;
};

export const uploadImages = asyncHandler(async (req: Request, res: Response) => {
  const files = extractFilesFromRequest(req);

  if (files.length === 0) {
    throw new AppError(
      "No image files provided. Please attach files under field name 'image', 'images', 'file', 'files', or 'coverImage'",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const rawFolder = (req.body?.folder || req.query?.folder) as string | undefined;
  const userId = req.user?.id;

  const result = await uploadImagesService({
    files,
    folder: rawFolder,
    userId,
  });

  const message =
    result.count === 1
      ? "Image uploaded successfully"
      : "Images uploaded successfully";

  apiResponse(res, HTTP_STATUS.CREATED, message, result);
});

export const deleteImage = asyncHandler(async (req: Request, res: Response) => {
  const publicId =
    (req.params.publicId as string | undefined) ||
    (req.query.publicId as string | undefined) ||
    (req.body?.publicId as string | undefined);

  if (!publicId) {
    throw new AppError(
      "Public ID is required to delete an image",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const userId = req.user?.id;
  await deleteImageService(publicId, userId);

  apiResponse(res, HTTP_STATUS.OK, "Image deleted successfully");
});

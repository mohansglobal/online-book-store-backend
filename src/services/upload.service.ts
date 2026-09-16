import { uploadToCloudinary, deleteFromCloudinary } from "./cloudinary.service.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";

export interface UploadFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadImagesServiceInput {
  files: UploadFileInput[];
  folder?: string;
  userId?: string;
}

export interface UploadedImageFileResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  originalName: string;
}

export interface UploadImagesServiceResult {
  url: string;
  urls: string[];
  files: UploadedImageFileResult[];
  count: number;
}

const sanitizeFolderName = (rawFolder?: string): string => {
  if (!rawFolder) {
    return "online-book-store/uploads";
  }

  const cleaned = rawFolder
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9_\-\/]/g, "");

  if (!cleaned) {
    return "online-book-store/uploads";
  }

  if (!cleaned.startsWith("online-book-store")) {
    return `online-book-store/${cleaned}`;
  }

  return cleaned;
};

export const uploadImagesService = async (
  input: UploadImagesServiceInput,
): Promise<UploadImagesServiceResult> => {
  const files = input.files;
  const folder = sanitizeFolderName(input.folder);
  const userId = input.userId;

  if (!files || files.length === 0) {
    throw new AppError(
      "No image files provided for upload",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const maxAllowedFiles = 10;
  if (files.length > maxAllowedFiles) {
    throw new AppError(
      `Cannot upload more than ${maxAllowedFiles} images at once`,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const uploadedFiles: UploadedImageFileResult[] = [];
  const uploadedUrls: string[] = [];

  for (const file of files) {
    const fileBuffer = file.buffer;
    const originalName = file.originalname;

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new AppError(
        `Empty file buffer received for file: ${originalName}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const cloudinaryResult = await uploadToCloudinary(fileBuffer, folder, null, {
      resourceType: "image",
    });

    const fileResult: UploadedImageFileResult = {
      url: cloudinaryResult.url,
      secureUrl: cloudinaryResult.secure_url,
      publicId: cloudinaryResult.public_id,
      format: cloudinaryResult.format,
      width: cloudinaryResult.width,
      height: cloudinaryResult.height,
      bytes: cloudinaryResult.bytes,
      originalName,
    };

    uploadedFiles.push(fileResult);
    uploadedUrls.push(cloudinaryResult.secure_url);
  }

  const primaryUrl = uploadedUrls[0] || "";
  const totalCount = uploadedFiles.length;

  logger.info(
    {
      userId,
      folder,
      count: totalCount,
      primaryUrl,
    },
    "Images uploaded to Cloudinary successfully",
  );

  return {
    url: primaryUrl,
    urls: uploadedUrls,
    files: uploadedFiles,
    count: totalCount,
  };
};

export const deleteImageService = async (
  publicId: string,
  userId?: string,
): Promise<boolean> => {
  const trimmedPublicId = publicId.trim();

  if (!trimmedPublicId) {
    throw new AppError("Public ID is required to delete image", HTTP_STATUS.BAD_REQUEST);
  }

  const isDeleted = await deleteFromCloudinary(trimmedPublicId, "image");

  if (!isDeleted) {
    throw new AppError(
      "Failed to delete image from Cloudinary or image not found",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  logger.info(
    {
      userId,
      publicId: trimmedPublicId,
    },
    "Image deleted from Cloudinary successfully",
  );

  return true;
};

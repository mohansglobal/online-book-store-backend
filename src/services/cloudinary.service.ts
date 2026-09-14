import type { UploadApiResponse, UploadApiOptions } from "cloudinary";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";

export interface UploadOptions {
  folder?: string;
  publicId?: string | null;
  resourceType?: "auto" | "image" | "raw" | "video";
  transformation?: UploadApiOptions["transformation"];
  overwrite?: boolean;
}

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  resourceType: string;
}

/**
 * Directly streams a buffer to Cloudinary using upload_stream.end(buffer).
 */
export const uploadToCloudinary = (
  buffer: Buffer,
  folder = "uploads",
  publicId: string | null = null,
  options: UploadOptions = {},
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured) {
      return reject(
        new AppError(
          "Cloudinary credentials are not configured in environment",
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ),
      );
    }

    if (!buffer || buffer.length === 0) {
      return reject(new AppError("No file buffer provided for upload", HTTP_STATUS.BAD_REQUEST));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId || undefined,
        resource_type: options.resourceType || "auto",
        transformation: options.transformation,
        overwrite: options.overwrite ?? true,
        timeout: 30000,
      },
      (error, result) => {
        if (error || !result) {
          logger.error({ err: error }, "Cloudinary upload failed");
          return reject(
            new AppError(error?.message || "Failed to upload file to Cloudinary", HTTP_STATUS.BAD_REQUEST),
          );
        }
        resolve(result);
      },
    );

    uploadStream.end(buffer);
  });
};

/**
 * Deletes an asset from Cloudinary by its public ID.
 */
export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: "image" | "raw" | "video" = "image",
): Promise<boolean> => {
  if (!isCloudinaryConfigured || !publicId) return false;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    return result.result === "ok";
  } catch (error) {
    logger.warn({ err: error, publicId }, "Failed to delete file from Cloudinary");
    return false;
  }
};

/**
 * Extracts publicId from a Cloudinary URL string.
 */
export const extractPublicIdFromUrl = (url: string): string | null => {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  return match?.[1] || null;
};

// Aliases for compatibility
export const uploadImageBuffer = async (
  buffer: Buffer,
  options: UploadOptions = {},
): Promise<CloudinaryUploadResult> => {
  const result = await uploadToCloudinary(
    buffer,
    options.folder || "uploads",
    options.publicId || null,
    { ...options, resourceType: options.resourceType || "image" },
  );

  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    resourceType: result.resource_type,
  };
};

export const deleteImageByPublicId = deleteFromCloudinary;

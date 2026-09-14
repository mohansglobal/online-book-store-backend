import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const cloudName = (env.CLOUDINARY_NAME || env.CLOUDINARY_CLOUD_NAME || "").trim();
const apiKey = (env.CLOUDINARY_API_KEY || "").trim();
const apiSecret = (env.CLOUDINARY_API_SECRET || "").trim();

export const isCloudinaryConfigured = Boolean(
  (cloudName && apiKey && apiSecret) || env.CLOUDINARY_URL,
);

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  logger.info({ cloudName }, "Cloudinary initialized");
} else if (env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
  logger.info("Cloudinary initialized using CLOUDINARY_URL");
} else {
  logger.warn("Cloudinary credentials are not configured in environment");
}

export { cloudinary };
export default cloudinary;

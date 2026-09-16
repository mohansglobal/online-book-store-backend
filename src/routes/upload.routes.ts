import { Router } from "express";

import { authenticate } from "../middlewares/auth.middleware.js";
import { uploadFlexibleImagesMiddleware } from "../middlewares/upload.middleware.js";
import {
  uploadImages,
  deleteImage,
} from "../controllers/upload.controller.js";

const router = Router();

// Single / Multiple image upload endpoint
router.post(
  "/",
  authenticate,
  uploadFlexibleImagesMiddleware,
  uploadImages,
);

router.post(
  "/multiple",
  authenticate,
  uploadFlexibleImagesMiddleware,
  uploadImages,
);

router.post(
  "/single",
  authenticate,
  uploadFlexibleImagesMiddleware,
  uploadImages,
);

// Delete image by publicId param, query, or body
router.delete("/:publicId", authenticate, deleteImage);
router.delete("/", authenticate, deleteImage);

export default router;

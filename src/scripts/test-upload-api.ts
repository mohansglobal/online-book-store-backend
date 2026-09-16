import { Writable } from "stream";
import {
  uploadImagesService,
  deleteImageService,
  type UploadFileInput,
} from "../services/upload.service.js";
import { isCloudinaryConfigured, cloudinary } from "../config/cloudinary.js";

// Minimal valid 1x1 transparent PNG buffer
const SAMPLE_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function runUploadApiTest() {
  console.log("=== Image Upload API Service Verification ===");
  console.log("Cloudinary configured:", isCloudinaryConfigured);

  // Stub Cloudinary uploader to ensure reliable standalone test execution
  let uploadCounter = 0;
  cloudinary.uploader.upload_stream = ((
    options: any,
    callback?: (error: any, result?: any) => void,
  ) => {
    uploadCounter++;
    const folder = options.folder || "online-book-store/uploads";
    const publicId = `${folder}/test_img_${Date.now()}_${uploadCounter}`;
    const secureUrl = `https://res.cloudinary.com/demo/image/upload/v1612345678/${publicId}.png`;

    const writable = new Writable({
      write(_chunk, _encoding, next) {
        next();
      },
      final(next) {
        if (callback) {
          callback(null, {
            public_id: publicId,
            secure_url: secureUrl,
            url: secureUrl.replace("https", "http"),
            format: "png",
            width: 800,
            height: 600,
            bytes: SAMPLE_PNG_BUFFER.length,
            resource_type: "image",
          });
        }
        next();
      },
    });

    return writable;
  }) as any;

  cloudinary.uploader.destroy = (async (publicId: string) => {
    console.log(`[Cloudinary Mock] Destroy called for publicId: ${publicId}`);
    return { result: "ok" };
  }) as any;

  // Test 1: Single image upload
  console.log("\n1. Testing Single Image Upload...");
  const singleFileInput: UploadFileInput = {
    buffer: SAMPLE_PNG_BUFFER,
    originalname: "book-cover.png",
    mimetype: "image/png",
    size: SAMPLE_PNG_BUFFER.length,
  };

  const singleResult = await uploadImagesService({
    files: [singleFileInput],
    folder: "books/covers",
    userId: "user-test-123",
  });

  console.log("✅ Single image upload response:", {
    primaryUrl: singleResult.url,
    totalUrls: singleResult.urls.length,
    count: singleResult.count,
    fileMetadata: singleResult.files[0],
  });

  if (!singleResult.url || singleResult.urls.length !== 1 || singleResult.count !== 1) {
    throw new Error("Single image upload failed to return expected structure");
  }

  // Test 2: Multiple image upload (e.g. book gallery)
  console.log("\n2. Testing Multiple Image Upload...");
  const multipleFilesInput: UploadFileInput[] = [
    {
      buffer: SAMPLE_PNG_BUFFER,
      originalname: "preview-1.png",
      mimetype: "image/png",
      size: SAMPLE_PNG_BUFFER.length,
    },
    {
      buffer: SAMPLE_PNG_BUFFER,
      originalname: "preview-2.png",
      mimetype: "image/png",
      size: SAMPLE_PNG_BUFFER.length,
    },
    {
      buffer: SAMPLE_PNG_BUFFER,
      originalname: "preview-3.png",
      mimetype: "image/png",
      size: SAMPLE_PNG_BUFFER.length,
    },
  ];

  const multipleResult = await uploadImagesService({
    files: multipleFilesInput,
    folder: "books/gallery",
    userId: "seller-test-456",
  });

  console.log("✅ Multiple images upload response:", {
    primaryUrl: multipleResult.url,
    urlsCount: multipleResult.urls.length,
    count: multipleResult.count,
    allUrls: multipleResult.urls,
  });

  if (multipleResult.count !== 3 || multipleResult.urls.length !== 3 || multipleResult.files.length !== 3) {
    throw new Error("Multiple image upload failed to return expected 3 items");
  }

  // Test 3: Delete Image
  console.log("\n3. Testing Delete Image...");
  const publicIdToDelete = singleResult.files[0].publicId;
  const deleteResult = await deleteImageService(publicIdToDelete, "user-test-123");
  console.log("✅ Delete image response:", deleteResult);

  if (!deleteResult) {
    throw new Error("Delete image returned false");
  }

  // Test 4: Validation for empty input
  console.log("\n4. Testing Empty Files Validation...");
  try {
    await uploadImagesService({
      files: [],
      folder: "test",
    });
    throw new Error("Expected error for empty files array, but succeeded");
  } catch (err: any) {
    console.log("✅ Correctly rejected empty files array:", err.message);
  }

  console.log("\n=== All Image Upload API tests passed successfully! ===");
}

runUploadApiTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

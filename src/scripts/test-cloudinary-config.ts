import { isCloudinaryConfigured, cloudinary } from "../config/cloudinary.js";
import { extractPublicIdFromUrl } from "../services/cloudinary.service.js";

async function runCloudinaryConfigTest() {
  console.log("=== Cloudinary Configuration Verification ===");
  console.log("Cloudinary configured:", isCloudinaryConfigured);

  // Test URL extractor
  const sampleUrl =
    "https://res.cloudinary.com/demo/image/upload/v1612345678/online-book-store/sample-book-cover.png";
  const extractedId = extractPublicIdFromUrl(sampleUrl);
  console.log("Test URL:", sampleUrl);
  console.log("Extracted Public ID:", extractedId);

  if (extractedId !== "online-book-store/sample-book-cover") {
    throw new Error(`Public ID extraction failed. Expected 'online-book-store/sample-book-cover', got '${extractedId}'`);
  }

  console.log("✅ Public ID extraction unit test passed.");

  // Check config object
  const config = cloudinary.config();
  console.log("Cloudinary SDK Config Active:", {
    cloud_name: config.cloud_name || "not set",
    secure: config.secure,
  });

  console.log("=== All Cloudinary configuration checks completed successfully ===");
}

runCloudinaryConfigTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

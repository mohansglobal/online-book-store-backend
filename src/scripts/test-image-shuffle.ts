import { resolveBookImages } from "../utils/image.helper.js";

function runTest() {
  console.log("=== Testing resolveBookImages ===");

  const coverImage = "https://res.cloudinary.com/demo/image/upload/v1/covers/cover1.jpg";
  const canonicalGallery = [
    "https://res.cloudinary.com/demo/image/upload/v1/gallery/page1.jpg",
    "https://res.cloudinary.com/demo/image/upload/v1/gallery/page2.jpg",
  ];

  console.log("Input coverImage:", coverImage);
  console.log("Input canonicalGallery:", canonicalGallery);

  const result1 = resolveBookImages(coverImage, canonicalGallery);
  console.log("\nResult 1 (1 cover + 2 canonical gallery):", result1);

  if (result1.coverImage !== coverImage) {
    throw new Error(`Expected coverImage ${coverImage}, got ${result1.coverImage}`);
  }
  if (result1.images.length !== 3) {
    throw new Error(`Expected 3 images, got ${result1.images.length}`);
  }
  if (result1.images[0] !== coverImage) {
    throw new Error("Expected index 0 to be coverImage");
  }

  // Test with seller listingImages
  const listingImages = ["https://res.cloudinary.com/demo/image/upload/v1/seller/condition1.jpg"];
  const result2 = resolveBookImages(coverImage, canonicalGallery, listingImages);
  console.log("\nResult 2 (1 cover + 1 seller listing image):", result2);

  if (result2.images.length !== 2) {
    throw new Error(`Expected 2 images (1 cover + 1 seller condition), got ${result2.images.length}`);
  }
  if (result2.images[0] !== coverImage || result2.images[1] !== listingImages[0]) {
    throw new Error("Expected [coverImage, listingImages[0]] in exact order");
  }

  console.log("\n✅ All image resolution tests passed successfully!");
}

runTest();


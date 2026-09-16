import { getMergedAndShuffledBookImages } from "../utils/image.helper.js";

function runTest() {
  console.log("=== Testing getMergedAndShuffledBookImages ===");

  const coverImage = "https://res.cloudinary.com/demo/image/upload/v1/covers/cover1.jpg";
  const images = [
    "https://res.cloudinary.com/demo/image/upload/v1/gallery/page1.jpg",
    "https://res.cloudinary.com/demo/image/upload/v1/gallery/page2.jpg",
  ];

  console.log("Input coverImage:", coverImage);
  console.log("Input images:", images);

  const result1 = getMergedAndShuffledBookImages(coverImage, images);
  console.log("\nResult 1 (3 merged images shuffled):", result1);

  if (result1.images.length !== 3) {
    throw new Error(`Expected 3 merged images, got ${result1.images.length}`);
  }

  // Ensure all 3 images are present in the shuffled array
  if (!result1.images.includes(coverImage) || !result1.images.includes(images[0]) || !result1.images.includes(images[1])) {
    throw new Error("Missing images in merged result");
  }

  // Test with custom listingImages
  const listingImages = ["https://res.cloudinary.com/demo/image/upload/v1/seller/condition1.jpg"];
  const result2 = getMergedAndShuffledBookImages(coverImage, images, listingImages);
  console.log("\nResult 2 (4 merged images with listingImages):", result2);

  if (result2.images.length !== 4) {
    throw new Error(`Expected 4 merged images, got ${result2.images.length}`);
  }

  console.log("\n✅ All image merge and shuffle tests passed successfully!");
}

runTest();

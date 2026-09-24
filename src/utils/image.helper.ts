/**
 * Image helper utility for resolving book cover & listing gallery images.
 *
 * Rules:
 * - coverImage: Master book-level cover image (shared across all sellers).
 * - listingImages: Seller-level extra photos (condition, edition, details).
 * - The primary cover image is always at index 0 in the images list.
 * - When a seller provides listingImages (e.g. 4 extra pictures), the listing's
 *   image array consists of [coverImage, ...listingImages] (1 cover + 4 extra = 5 total).
 * - If no listingImages are provided, images array consists of [coverImage] (or canonical gallery if available).
 */

export interface ResolvedBookImages {
  coverImage: string;
  images: string[];
  effectiveImages: string[];
}

/**
 * Resolves the primary cover image and gallery array for a book or seller listing.
 */
export const resolveBookImages = (
  coverImage?: string | null,
  canonicalImages?: string[] | null,
  listingImages?: string[] | null,
): ResolvedBookImages => {
  const cleanCover = typeof coverImage === "string" ? coverImage.trim() : "";

  // 1. Clean listing images (seller-specific extra photos)
  const cleanListingImages: string[] = [];
  if (Array.isArray(listingImages)) {
    for (const img of listingImages) {
      if (typeof img === "string" && img.trim().length > 0) {
        cleanListingImages.push(img.trim());
      }
    }
  }

  // 2. Clean canonical master images (book gallery)
  const cleanCanonicalImages: string[] = [];
  if (Array.isArray(canonicalImages)) {
    for (const img of canonicalImages) {
      if (typeof img === "string" && img.trim().length > 0) {
        cleanCanonicalImages.push(img.trim());
      }
    }
  }

  // 3. Determine the primary cover image
  // Canonical master coverImage takes first priority, then fallback to first listing image, then first gallery image.
  let primaryCover = cleanCover;
  if (!primaryCover && cleanListingImages.length > 0) {
    primaryCover = cleanListingImages[0];
  }
  if (!primaryCover && cleanCanonicalImages.length > 0) {
    primaryCover = cleanCanonicalImages[0];
  }

  // 4. Build deterministic image array
  // If primary cover is available, it is always the first image (index 0).
  const imageList: string[] = [];
  if (primaryCover) {
    imageList.push(primaryCover);
  }

  // If seller provided extra listing images, append them to the cover
  if (cleanListingImages.length > 0) {
    for (const img of cleanListingImages) {
      if (!imageList.includes(img)) {
        imageList.push(img);
      }
    }
  } else if (cleanCanonicalImages.length > 0) {
    // Otherwise fallback to canonical gallery images
    for (const img of cleanCanonicalImages) {
      if (!imageList.includes(img)) {
        imageList.push(img);
      }
    }
  }

  return {
    coverImage: primaryCover,
    images: imageList,
    effectiveImages: imageList,
  };
};

// Backwards-compatible alias for existing service imports
export const getMergedAndShuffledBookImages = resolveBookImages;


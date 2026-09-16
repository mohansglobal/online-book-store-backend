/**
 * Image helper utility for merging and shuffling book cover & gallery images.
 */

/**
 * Shuffles an array randomly using the Fisher-Yates algorithm.
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
};

export interface ResolvedBookImages {
  coverImage: string;
  images: string[];
  effectiveImages: string[];
}

/**
 * Merges coverImage, canonical images[], and listingImages[] into a single
 * deduplicated pool and shuffles them randomly so that all book pages
 * (home page, book catalog, book details, book listings) show randomized gallery & cover.
 */
export const getMergedAndShuffledBookImages = (
  coverImage?: string | null,
  canonicalImages?: string[] | null,
  listingImages?: string[] | null,
): ResolvedBookImages => {
  const imagePool: string[] = [];

  // 1. Add canonical cover image if present
  if (typeof coverImage === "string" && coverImage.trim().length > 0) {
    imagePool.push(coverImage.trim());
  }

  // 2. Add canonical gallery images
  if (Array.isArray(canonicalImages)) {
    for (const img of canonicalImages) {
      if (typeof img === "string" && img.trim().length > 0) {
        imagePool.push(img.trim());
      }
    }
  }

  // 3. Add seller custom listing images
  if (Array.isArray(listingImages)) {
    for (const img of listingImages) {
      if (typeof img === "string" && img.trim().length > 0) {
        imagePool.push(img.trim());
      }
    }
  }

  // Deduplicate while preserving non-empty strings
  const uniqueImages = Array.from(new Set(imagePool));

  if (uniqueImages.length === 0) {
    const fallback = (coverImage || "").trim();
    return {
      coverImage: fallback,
      images: fallback ? [fallback] : [],
      effectiveImages: fallback ? [fallback] : [],
    };
  }

  // Randomly shuffle all combined images
  const shuffled = shuffleArray(uniqueImages);
  const selectedCover = shuffled[0] || (coverImage || "").trim();

  return {
    coverImage: selectedCover,
    images: shuffled,
    effectiveImages: shuffled,
  };
};

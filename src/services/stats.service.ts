import { BookListingModel } from "../models/book-listing.model.js";
import { AuthorModel } from "../models/author.model.js";
import { UserModel } from "../models/user.model.js";
import { ReviewModel } from "../models/review.model.js";

export interface HeroStatItem {
  id: string;
  label: string;
  value: string;
  rawCount: number;
  type: "count" | "rating";
  hasStar?: boolean;
}

export interface HeroStatsData {
  curatedTitles: {
    rawCount: number;
    display: string;
    label: string;
  };
  indieAuthors: {
    rawCount: number;
    display: string;
    label: string;
  };
  verifiedSellers: {
    rawCount: number;
    display: string;
    label: string;
  };
  readerRating: {
    rawCount: number;
    display: string;
    label: string;
    totalReviews: number;
  };
  stats: HeroStatItem[];
}


//Rounds a raw number down to a human-friendly milestone string (e.g. 346 -> "300
const formatMilestoneCount = (count: number): string => {
  if (count <= 0) {
    return "0+";
  }

  if (count >= 10000) {
    const thousands = Math.floor(count / 1000);
    return `${thousands}k+`;
  }

  if (count >= 1000) {
    const hundreds = Math.floor(count / 100) * 100;
    return `${hundreds.toLocaleString()}+`;
  }

  if (count >= 200) {
    const hundreds = Math.floor(count / 50) * 50;
    return `${hundreds}+`;
  }

  if (count >= 100) {
    const tens = Math.floor(count / 10) * 10;
    return `${tens}+`;
  }

  if (count >= 20) {
    const fives = Math.floor(count / 5) * 5;
    return `${fives}+`;
  }

  return `${count}+`;
};


 //Aggregates live platform numbers for the homepage hero stats strip.

export const getHeroStatsService = async (): Promise<HeroStatsData> => {
  // 1. Run live count and rating queries in parallel
  const [activeListingsCount, activeAuthorsCount, verifiedSellersCount, reviewStatsResult] =
    await Promise.all([
      BookListingModel.countDocuments({ isActive: true }),
      AuthorModel.countDocuments({ isActive: true, isDel: { $ne: true } }),
      UserModel.countDocuments({ role: "SELLER", isActive: true }),
      ReviewModel.aggregate([
        {
          $match: {
            status: "APPROVED",
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]),
    ]);

  // 2. Format listing count
  const curatedTitlesDisplay = formatMilestoneCount(activeListingsCount);

  // 3. Format author count
  const indieAuthorsDisplay = formatMilestoneCount(activeAuthorsCount);

  // 4. Format seller count
  const verifiedSellersDisplay = formatMilestoneCount(verifiedSellersCount);

  // 5. Format review rating score
  let averageRatingValue = 4.9;
  let totalReviewsCount = 0;

  if (reviewStatsResult && reviewStatsResult.length > 0) {
    const rawAverage = reviewStatsResult[0].averageRating;
    totalReviewsCount = reviewStatsResult[0].totalReviews || 0;

    if (typeof rawAverage === "number" && rawAverage > 0) {
      averageRatingValue = Math.round(rawAverage * 10) / 10;
    }
  }

  const readerRatingDisplay = averageRatingValue.toFixed(1);

  // 6. Assemble ordered list matching the homepage hero 4-column layout
  const statsList: HeroStatItem[] = [
    {
      id: "curated-titles",
      label: "Curated Titles",
      value: curatedTitlesDisplay,
      rawCount: activeListingsCount,
      type: "count",
    },
    {
      id: "indie-authors",
      label: "Indie Authors",
      value: indieAuthorsDisplay,
      rawCount: activeAuthorsCount,
      type: "count",
    },
    {
      id: "verified-sellers",
      label: "Verified Sellers",
      value: verifiedSellersDisplay,
      rawCount: verifiedSellersCount,
      type: "count",
    },
    {
      id: "reader-rating",
      label: "Reader Rating",
      value: readerRatingDisplay,
      rawCount: averageRatingValue,
      type: "rating",
      hasStar: true,
    },
  ];

  return {
    curatedTitles: {
      rawCount: activeListingsCount,
      display: curatedTitlesDisplay,
      label: "Curated Titles",
    },
    indieAuthors: {
      rawCount: activeAuthorsCount,
      display: indieAuthorsDisplay,
      label: "Indie Authors",
    },
    verifiedSellers: {
      rawCount: verifiedSellersCount,
      display: verifiedSellersDisplay,
      label: "Verified Sellers",
    },
    readerRating: {
      rawCount: averageRatingValue,
      display: readerRatingDisplay,
      label: "Reader Rating",
      totalReviews: totalReviewsCount,
    },
    stats: statsList,
  };
};

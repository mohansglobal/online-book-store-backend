import { SiteContentModel } from "../models/content.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import type {
  UpdateSiteContentInput,
  HeroContentInput,
  EbooksContentInput,
  PoetryContentInput,
  AnnouncementContentInput,
  NewsletterContentInput,
} from "../validation/content.schema.js";

const DEFAULT_CONTENT_KEY = "default";

export const DEFAULT_SITE_CONTENT = {
  hero: {
    headlinePart1: "The bookshop shelf,",
    headlinePart2: "curated for your",
    rotatingWords: ["journey.", "curiosity.", "character.", "escapism."],
    description:
      "Discover handpicked literary masterpieces, rare editions, and timeless voices waiting to be explored by passionate readers and thoughtful minds.",
    searchPlaceholder: "Search by title, author, publisher, ISBN...",
  },
  ebooks: {
    badge: "DIGITAL EDITIONS",
    heading: "Carry your library",
    headingAccent: "everywhere.",
    description:
      "Discover thousands of books available instantly as digital editions. Drag or swipe the text on the reader to experience seamless page turning.",
    ctaText: "Explore E-Books",
    ctaLink: "/books",
    books: [
      {
        title: "Pride and Prejudice",
        quote:
          "“It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.”",
        progress: 42,
      },
      {
        title: "Alice's Adventures in Wonderland",
        quote: "“Curiouser and curiouser!”",
        progress: 56,
      },
      {
        title: "The Great Gatsby",
        quote:
          "“So we beat on, boats against the current, borne back ceaselessly into the past.”",
        progress: 71,
      },
      {
        title: "The Adventures of Sherlock Holmes",
        quote: "“There is nothing more deceptive than an obvious fact.”",
        progress: 84,
      },
    ],
  },
  poetry: {
    badge: "POETRY & PROSE",
    quote: "“A poem begins in delight and ends in wisdom.”",
    quoteAccent: "wisdom.",
    author: "— Robert Frost",
    ctaText: "Explore the collection",
    ctaLink: "/books",
  },
  announcement: {
    badge: "20% FLAT OFF",
    text: "Get 20% Flat Discount on all books! Use coupon",
    code: "FLAT20",
    cta: "Shop Now",
    link: "/books",
  },
  newsletter: {
    heading: "Good books deserve",
    headingAccent: "good company.",
    description:
      "Get thoughtful recommendations, new releases and reading inspiration delivered occasionally.",
  },
};

export const getSiteContentService = async () => {
  const existingContent = await SiteContentModel.findOne({
    key: DEFAULT_CONTENT_KEY,
  }).lean();

  if (!existingContent) {
    const created = await SiteContentModel.create({
      key: DEFAULT_CONTENT_KEY,
      hero: DEFAULT_SITE_CONTENT.hero,
      ebooks: DEFAULT_SITE_CONTENT.ebooks,
      poetry: DEFAULT_SITE_CONTENT.poetry,
      announcement: DEFAULT_SITE_CONTENT.announcement,
    });

    return {
      hero: created.hero,
      ebooks: created.ebooks,
      poetry: created.poetry,
      announcement: created.announcement,
      newsletter: created.newsletter,
      updatedAt: created.updatedAt,
    };
  }

  const hero = existingContent.hero;
  const ebooks = {
    ...existingContent.ebooks,
    books:
      existingContent.ebooks?.books && existingContent.ebooks.books.length > 0
        ? existingContent.ebooks.books
        : DEFAULT_SITE_CONTENT.ebooks.books,
  };
  const poetry = existingContent.poetry;
  const announcement = existingContent.announcement;
  const newsletter = existingContent.newsletter || DEFAULT_SITE_CONTENT.newsletter;
  const updatedAt = existingContent.updatedAt;

  return {
    hero,
    ebooks,
    poetry,
    announcement,
    newsletter,
    updatedAt,
  };
};

export const updateSiteContentService = async (
  input: UpdateSiteContentInput,
  adminUserId?: string,
) => {
  const updatePayload: Record<string, unknown> = {};

  if (input.hero) {
    for (const [field, value] of Object.entries(input.hero)) {
      if (value !== undefined) {
        updatePayload[`hero.${field}`] = value;
      }
    }
  }

  if (input.ebooks) {
    for (const [field, value] of Object.entries(input.ebooks)) {
      if (value !== undefined) {
        updatePayload[`ebooks.${field}`] = value;
      }
    }
  }

  if (input.poetry) {
    for (const [field, value] of Object.entries(input.poetry)) {
      if (value !== undefined) {
        updatePayload[`poetry.${field}`] = value;
      }
    }
  }

  if (input.announcement) {
    for (const [field, value] of Object.entries(input.announcement)) {
      if (value !== undefined) {
        updatePayload[`announcement.${field}`] = value;
      }
    }
  }

  if (input.newsletter) {
    for (const [field, value] of Object.entries(input.newsletter)) {
      if (value !== undefined) {
        updatePayload[`newsletter.${field}`] = value;
      }
    }
  }

  if (adminUserId) {
    updatePayload.lastUpdatedBy = adminUserId;
  }

  const updatedContent = await SiteContentModel.findOneAndUpdate(
    { key: DEFAULT_CONTENT_KEY },
    { $set: updatePayload },
    {
      returnDocument: "after",
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  if (!updatedContent) {
    throw new AppError(
      "Failed to update site content",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }

  return {
    hero: updatedContent.hero,
    ebooks: updatedContent.ebooks,
    poetry: updatedContent.poetry,
    announcement: updatedContent.announcement,
    newsletter: updatedContent.newsletter,
    updatedAt: updatedContent.updatedAt,
  };
};

export const updateSectionContentService = async (
  section: "hero" | "ebooks" | "poetry" | "announcement" | "newsletter",
  sectionData:
    | HeroContentInput
    | EbooksContentInput
    | PoetryContentInput
    | AnnouncementContentInput
    | NewsletterContentInput,
  adminUserId?: string,
) => {
  const updatePayload: Record<string, unknown> = {
    [section]: sectionData,
  };

  if (adminUserId) {
    updatePayload.lastUpdatedBy = adminUserId;
  }

  const updatedContent = await SiteContentModel.findOneAndUpdate(
    { key: DEFAULT_CONTENT_KEY },
    { $set: updatePayload },
    {
      returnDocument: "after",
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  if (!updatedContent) {
    throw new AppError(
      "Failed to update section content",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }

  return {
    hero: updatedContent.hero,
    ebooks: updatedContent.ebooks,
    poetry: updatedContent.poetry,
    announcement: updatedContent.announcement,
    newsletter: updatedContent.newsletter,
    updatedAt: updatedContent.updatedAt,
  };
};

export const resetSiteContentService = async (
  section?: "hero" | "ebooks" | "poetry" | "announcement" | "newsletter",
  adminUserId?: string,
) => {
  const updatePayload: Record<string, unknown> = {};

  if (!section) {
    updatePayload.hero = DEFAULT_SITE_CONTENT.hero;
    updatePayload.ebooks = DEFAULT_SITE_CONTENT.ebooks;
    updatePayload.poetry = DEFAULT_SITE_CONTENT.poetry;
    updatePayload.announcement = DEFAULT_SITE_CONTENT.announcement;
    updatePayload.newsletter = DEFAULT_SITE_CONTENT.newsletter;
  } else {
    updatePayload[section] = DEFAULT_SITE_CONTENT[section];
  }

  if (adminUserId) {
    updatePayload.lastUpdatedBy = adminUserId;
  }

  const updatedContent = await SiteContentModel.findOneAndUpdate(
    { key: DEFAULT_CONTENT_KEY },
    { $set: updatePayload },
    {
      returnDocument: "after",
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  if (!updatedContent) {
    throw new AppError(
      "Failed to reset site content",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }

  return {
    hero: updatedContent.hero,
    ebooks: updatedContent.ebooks,
    poetry: updatedContent.poetry,
    announcement: updatedContent.announcement,
    newsletter: updatedContent.newsletter,
    updatedAt: updatedContent.updatedAt,
  };
};

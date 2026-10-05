import { Schema, model, type InferSchemaType } from "mongoose";

const heroContentSchema = new Schema(
  {
    headlinePart1: {
      type: String,
      required: true,
      default: "The bookshop shelf,",
      trim: true,
    },
    headlinePart2: {
      type: String,
      required: true,
      default: "curated for your",
      trim: true,
    },
    rotatingWords: {
      type: [String],
      required: true,
      default: ["journey.", "curiosity.", "character.", "escapism."],
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length > 0,
        message: "Rotating words must contain at least one word",
      },
    },
    description: {
      type: String,
      required: true,
      default:
        "Discover handpicked literary masterpieces, rare editions, and timeless voices waiting to be explored by passionate readers and thoughtful minds.",
      trim: true,
    },
    searchPlaceholder: {
      type: String,
      default: "Search by title, author, publisher, ISBN...",
      trim: true,
    },
  },
  { _id: false },
);

const ebookPageSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    quote: {
      type: String,
      required: true,
      trim: true,
    },
    progress: {
      type: Number,
      default: 50,
    },
  },
  { _id: false },
);

const ebooksContentSchema = new Schema(
  {
    badge: {
      type: String,
      default: "DIGITAL EDITIONS",
      trim: true,
    },
    heading: {
      type: String,
      default: "Carry your library",
      trim: true,
    },
    headingAccent: {
      type: String,
      default: "everywhere.",
      trim: true,
    },
    description: {
      type: String,
      default:
        "Discover thousands of books available instantly as digital editions. Drag or swipe the text on the reader to experience seamless page turning.",
      trim: true,
    },
    ctaText: {
      type: String,
      default: "Explore E-Books",
      trim: true,
    },
        ctaLink: {
      type: String,
      default: "/books",
      trim: true,
    },
    books: {
      type: [ebookPageSchema],
      default: () => [
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
  },
  { _id: false },
);

const poetryContentSchema = new Schema(
  {
    badge: {
      type: String,
      default: "POETRY & PROSE",
      trim: true,
    },
    quote: {
      type: String,
      default: "“A poem begins in delight and ends in wisdom.”",
      trim: true,
    },
    quoteAccent: {
      type: String,
      default: "wisdom.",
      trim: true,
    },
    author: {
      type: String,
      default: "— Robert Frost",
      trim: true,
    },
    ctaText: {
      type: String,
      default: "Explore the collection",
      trim: true,
    },
    ctaLink: {
      type: String,
      default: "/books",
      trim: true,
    },
  },
  { _id: false },
);

const announcementContentSchema = new Schema(
  {
    badge: {
      type: String,
      default: "20% FLAT OFF",
      trim: true,
    },
    text: {
      type: String,
      default: "Get 20% Flat Discount on all books! Use coupon",
      trim: true,
    },
    code: {
      type: String,
      default: "FLAT20",
      trim: true,
    },
    cta: {
      type: String,
      default: "Shop Now",
      trim: true,
    },
    link: {
      type: String,
      default: "/books",
      trim: true,
    },
  },
  { _id: false },
);

const newsletterContentSchema = new Schema(
  {
    heading: {
      type: String,
      default: "Good books deserve",
      trim: true,
    },
    headingAccent: {
      type: String,
      default: "good company.",
      trim: true,
    },
    description: {
      type: String,
      default:
        "Get thoughtful recommendations, new releases and reading inspiration delivered occasionally.",
      trim: true,
    },
  },
  { _id: false },
);

const siteContentSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      trim: true,
    },
    hero: {
      type: heroContentSchema,
      default: () => ({}),
    },
    ebooks: {
      type: ebooksContentSchema,
      default: () => ({}),
    },
    poetry: {
      type: poetryContentSchema,
      default: () => ({}),
    },
    announcement: {
      type: announcementContentSchema,
      default: () => ({}),
    },
    newsletter: {
      type: newsletterContentSchema,
      default: () => ({}),
    },
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type SiteContentDocument = InferSchemaType<typeof siteContentSchema>;
export const SiteContentModel = model("SiteContent", siteContentSchema);

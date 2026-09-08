import { Schema, model, type InferSchemaType, type Types } from "mongoose";

export const BOOK_FORMATS = [
  "PAPERBACK",
  "HARDCOVER",
  "EBOOK",
  "AUDIOBOOK",
] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];

export const BOOK_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "OUT_OF_STOCK",
  "DRAFT",
] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

const translationSchema = new Schema(
  {
    originalTitle: {
      type: String,
      trim: true,
    },
    originalLanguage: {
      type: String,
      trim: true,
    },
    translator: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const bookSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    titleBn: {
      type: String,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    legacyId: {
      type: String,
      trim: true,
    },
    legacyBookId: {
      type: String,
      trim: true,
    },
    isbn: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    authors: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Author",
        },
      ],
      required: true,
      validate: {
        validator: (authors: Types.ObjectId[]) => authors.length > 0,
        message: "A book must have at least one author",
      },
    },
    publisher: {
      type: Schema.Types.ObjectId,
      ref: "Publisher",
      required: true,
    },
    categories: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      required: true,
      validate: {
        validator: (categories: Types.ObjectId[]) => categories.length > 0,
        message: "A book must belong to at least one category",
      },
    },
    language: {
      type: String,
      required: true,
      default: "English",
      trim: true,
    },
    searchTags: {
      type: [String],
      default: [],
    },
    format: {
      type: String,
      enum: BOOK_FORMATS,
      default: "PAPERBACK",
    },
    edition: {
      type: String,
      trim: true,
    },
    pages: {
      type: Number,
      min: 1,
    },
    publicationDate: {
      type: Date,
    },
    coverImage: {
      type: String,
      required: true,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: BOOK_STATUSES,
      default: "ACTIVE",
    },
    translation: {
      type: translationSchema,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

bookSchema.index({ authors: 1 });
bookSchema.index({ categories: 1 });
bookSchema.index({ publisher: 1 });
bookSchema.index({ createdBy: 1 });
bookSchema.index({ status: 1 });
bookSchema.index({ legacyId: 1 }, { unique: true, sparse: true });
bookSchema.index({ legacyBookId: 1 }, { sparse: true });
bookSchema.index(
  { title: "text", titleBn: "text", description: "text", searchTags: "text" },
  { default_language: "none", language_override: "none" },
);

export type BookDocument = InferSchemaType<typeof bookSchema>;

export const BookModel = model("Book", bookSchema);

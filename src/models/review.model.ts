import { Schema, model, type InferSchemaType, type Types } from "mongoose";

export const REVIEW_STATUSES = ["APPROVED", "PENDING", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const reviewSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    book: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookListing: {
      type: Schema.Types.ObjectId,
      ref: "BookListing",
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be an integer between 1 and 5",
      },
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    review: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 2000,
    },
    images: {
      type: [String],
      default: [],
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: REVIEW_STATUSES,
      default: "APPROVED",
    },
    helpfulVotes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for fast scalable lookups
reviewSchema.index({ user: 1, book: 1, seller: 1 }, { unique: true });
reviewSchema.index({ book: 1, createdAt: -1 });
reviewSchema.index({ book: 1, seller: 1, createdAt: -1 });
reviewSchema.index({ seller: 1, createdAt: -1 });
reviewSchema.index({ book: 1, rating: -1 });
reviewSchema.index({ user: 1, createdAt: -1 });

export type ReviewDocument = InferSchemaType<typeof reviewSchema> & {
  _id: Types.ObjectId;
};

export const ReviewModel = model("Review", reviewSchema);

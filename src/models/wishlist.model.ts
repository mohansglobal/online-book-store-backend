import { Schema, model, type InferSchemaType } from "mongoose";

const wishlistItemSchema = new Schema(
  {
    book: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const wishlistSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [wishlistItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

wishlistSchema.index({ user: 1 }, { unique: true });

export type WishlistDocument = InferSchemaType<typeof wishlistSchema>;

export const WishlistModel = model("Wishlist", wishlistSchema);

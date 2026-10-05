import { Schema, model, type InferSchemaType } from "mongoose";

const newsletterSubscriberSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    isSubscribed: {
      type: Boolean,
      default: true,
      index: true,
    },
    source: {
      type: String,
      trim: true,
      default: "footer",
    },
    preferences: {
      newReleases: {
        type: Boolean,
        default: true,
      },
      priceDrops: {
        type: Boolean,
        default: true,
      },
      offers: {
        type: Boolean,
        default: true,
      },
    },
    unsubscribedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type NewsletterSubscriberDocument = InferSchemaType<
  typeof newsletterSubscriberSchema
>;

export const NewsletterSubscriberModel = model(
  "NewsletterSubscriber",
  newsletterSubscriberSchema,
);

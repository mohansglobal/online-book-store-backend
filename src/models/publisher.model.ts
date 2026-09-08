import { Schema, model, type InferSchemaType } from "mongoose";

const publisherSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameBn: {
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
    originCountry: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    dob: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
    },
    isImage: {
      type: String,
      trim: true,
      default: "0",
    },
    roleId: {
      type: String,
      trim: true,
    },
    userId: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
      default: "1",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

publisherSchema.index({ name: 1 });
publisherSchema.index({ legacyId: 1 }, { sparse: true });
publisherSchema.index({ email: 1 }, { unique: true, sparse: true });
publisherSchema.index({ phone: 1 }, { sparse: true });

export type PublisherDocument = InferSchemaType<typeof publisherSchema>;

export const PublisherModel = model("Publisher", publisherSchema);


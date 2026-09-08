import { Schema, model, type InferSchemaType } from "mongoose";

const authorSchema = new Schema(
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
    bio: {
      type: String,
      trim: true,
    },
    photo: {
      type: String,
      trim: true,
    },
    birthDate: {
      type: Date,
    },
    deathDate: {
      type: Date,
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

authorSchema.index({ name: "text", nameBn: "text" });

export type AuthorDocument = InferSchemaType<typeof authorSchema>;

export const AuthorModel = model("Author", authorSchema);

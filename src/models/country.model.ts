import { Schema, model, type InferSchemaType } from "mongoose";

const countrySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    phoneCode: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      uppercase: true,
      trim: true,
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

export type CountryDocument = InferSchemaType<typeof countrySchema>;

export const CountryModel = model("Country", countrySchema);

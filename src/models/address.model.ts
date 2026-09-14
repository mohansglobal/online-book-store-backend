import { Schema, model, type InferSchemaType } from "mongoose";

export const ADDRESS_TYPES = ["BILLING", "SHIPPING"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

const addressSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    addressType: {
      type: String,
      enum: ADDRESS_TYPES,
      required: true,
      default: "SHIPPING",
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    countryRef: {
      type: Schema.Types.ObjectId,
      ref: "Country",
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
    },
    streetAddress: {
      type: String,
      required: true,
      trim: true,
    },
    apartment: {
      type: String,
      trim: true,
      default: "",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

addressSchema.index({ user: 1, addressType: 1 });
addressSchema.index({ user: 1, isDefault: 1 });

export type AddressDocument = InferSchemaType<typeof addressSchema>;

export const AddressModel = model("Address", addressSchema);

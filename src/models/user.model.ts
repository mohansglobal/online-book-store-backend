import { Schema, model, type InferSchemaType } from "mongoose";

export const USER_ROLES = ["BUYER", "SELLER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    mobileNumber: {
      type: String,
      trim: true,
    },
    country: {
      type: Schema.Types.ObjectId,
      ref: "Country",
    },
    postalCode: {
      type: String,
      trim: true,
    },
    profilePicture: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "BUYER",
    },
    publisher: {
      type: Schema.Types.ObjectId,
      ref: "Publisher",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ country: 1 });
userSchema.index({ publisher: 1 }, { sparse: true });
userSchema.index({ mobileNumber: 1 }, { unique: true, sparse: true });

export type UserDocument = InferSchemaType<typeof userSchema>;

export const UserModel = model("User", userSchema);

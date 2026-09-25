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
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isMobileVerified: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletionStatus: {
      type: String,
      enum: ["NONE", "SCHEDULED", "PERMANENTLY_DELETED"],
      default: "NONE",
    },
    deletionRequestedAt: {
      type: Date,
    },
    scheduledPermanentDeletionAt: {
      type: Date,
    },
    deletionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ country: 1 });
userSchema.index({ mobileNumber: 1 }, { unique: true, sparse: true });
userSchema.index({ deletionStatus: 1, scheduledPermanentDeletionAt: 1 });

export type UserDocument = InferSchemaType<typeof userSchema>;

export const UserModel = model("User", userSchema);

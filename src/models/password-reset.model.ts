import { Schema, model, type InferSchemaType } from "mongoose";

const passwordResetSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    identifier: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
      trim: true,
    },
    otpExpiresAt: {
      type: Date,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    resetToken: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    resetTokenExpiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Automatic TTL cleanup: MongoDB deletes records 1 hour after creation
passwordResetSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });
passwordResetSchema.index({ identifier: 1, isVerified: 1 });

export type PasswordResetDocument = InferSchemaType<typeof passwordResetSchema>;

export const PasswordResetModel = model("PasswordReset", passwordResetSchema);

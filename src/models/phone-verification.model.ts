import { Schema, model, type InferSchemaType } from "mongoose";

const phoneVerificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
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
    verifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Expire document automatically after otpExpiresAt so MongoDB cleans up
phoneVerificationSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 86400 });
phoneVerificationSchema.index({ phoneNumber: 1, isVerified: 1 });

export type PhoneVerificationDocument = InferSchemaType<typeof phoneVerificationSchema>;

export const PhoneVerificationModel = model("PhoneNumberVerify", phoneVerificationSchema);
export const PhoneNumberVerify = PhoneVerificationModel;

import { Schema, model, type InferSchemaType } from "mongoose";

const accountDeletionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Automatic TTL cleanup: MongoDB deletes records 1 hour after creation
accountDeletionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export type AccountDeletionDocument = InferSchemaType<typeof accountDeletionSchema>;

export const AccountDeletionModel = model("AccountDeletion", accountDeletionSchema);

import { Schema, model, type InferSchemaType } from "mongoose";

const cartItemSchema = new Schema(
  {
    bookListing: {
      type: Schema.Types.ObjectId,
      ref: "BookListing",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
    },
  },
  {
    _id: false,
  },
);

const cartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

cartSchema.index({ user: 1 }, { unique: true });

export type CartDocument = InferSchemaType<typeof cartSchema>;

export const CartModel = model("Cart", cartSchema);

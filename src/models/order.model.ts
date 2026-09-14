import { Schema, model, type InferSchemaType } from "mongoose";

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const orderItemSchema = new Schema(
  {
    bookListing: {
      type: Schema.Types.ObjectId,
      ref: "BookListing",
      required: true,
    },
    book: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    coverImage: {
      type: String,
      trim: true,
    },
    priceInPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotalInPaise: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const orderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "Order must contain at least one item",
      },
    },
    subtotalInPaise: {
      type: Number,
      min: 0,
    },
    deliveryChargeInPaise: {
      type: Number,
      min: 0,
      default: 0,
    },
    couponDiscountInPaise: {
      type: Number,
      min: 0,
      default: 0,
    },
    couponCode: {
      type: String,
      trim: true,
    },
    totalAmountInPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["ONLINE_PAY", "CASH_ON_DELIVERY"],
      default: "ONLINE_PAY",
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "PENDING",
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "PENDING",
    },
    shippingAddress: {
      fullName: { type: String, required: true, trim: true },
      email: { type: String, trim: true },
      mobileNumber: { type: String, required: true, trim: true },
      street: { type: String, trim: true },
      streetAddress: { type: String, trim: true },
      apartment: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true },
    },
    billingAddress: {
      fullName: { type: String, trim: true },
      email: { type: String, trim: true },
      mobileNumber: { type: String, trim: true },
      street: { type: String, trim: true },
      streetAddress: { type: String, trim: true },
      apartment: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    billingSameAsShipping: {
      type: Boolean,
      default: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    refundStatus: {
      type: String,
      enum: ["NONE", "PENDING", "PROCESSED", "FAILED"],
      default: "NONE",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ "items.seller": 1, createdAt: -1 });
orderSchema.index({ "items.bookListing": 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ razorpayOrderId: 1 }, { sparse: true });
orderSchema.index({ razorpayPaymentId: 1 }, { sparse: true });

export type OrderDocument = InferSchemaType<typeof orderSchema>;

export const OrderModel = model("Order", orderSchema);

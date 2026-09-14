import type { AddressDocument } from "../models/address.model.js";

export type UnavailableReason =
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK"
  | "LISTING_INACTIVE";

export type CheckoutIssueCode =
  | "EMPTY_CART"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK"
  | "LISTING_INACTIVE"
  | "SHIPPING_ADDRESS_REQUIRED"
  | "BILLING_ADDRESS_REQUIRED"
  | "ADDRESS_NOT_FOUND"
  | "COD_UNAVAILABLE";

export type CheckoutIssue = {
  code: CheckoutIssueCode;
  message: string;
  bookListingId?: string;
};

export type CheckoutItem = {
  bookListingId: string;
  bookId: string;
  title: string;
  titleBn?: string;
  author: string;
  format: string;
  coverImage: string;
  quantity: number;
  stockAvailable: number;
  isAvailable: boolean;
  unavailableReason?: UnavailableReason;
  mrpInPaise: number;
  sellingPriceInPaise: number;
  subtotalInPaise: number;
  itemDiscountInPaise: number;
  seller: {
    id: string;
    name?: string;
  };
};

export type CheckoutPricing = {
  itemsCount: number;
  totalQuantity: number;
  mrpTotalInPaise: number;
  subtotalInPaise: number;
  itemDiscountInPaise: number;
  couponDiscountInPaise: number;
  deliveryChargeInPaise: number;
  totalSavingsInPaise: number;
  totalAmountInPaise: number;
  currency: "INR";
};

export type CheckoutCoupon = {
  code: string;
  isValid: boolean;
  discountInPaise: number;
  message: string;
};

export type PaymentMethod = {
  id: "ONLINE_PAY" | "CASH_ON_DELIVERY";
  label: string;
  isAvailable: boolean;
  unavailableReason?: string;
};

export type CheckoutSummary = {
  items: CheckoutItem[];
  pricing: CheckoutPricing;
  coupon: CheckoutCoupon | null;
  addresses: {
    shippingAddress: AddressDocument | null;
    billingAddress: AddressDocument | null;
    billingSameAsShipping: boolean;
  };
  paymentMethods: PaymentMethod[];
  delivery: {
    estimatedMinDays: number;
    estimatedMaxDays: number;
  };
  checkoutState: {
    canCheckout: boolean;
    issues: CheckoutIssue[];
  };
};

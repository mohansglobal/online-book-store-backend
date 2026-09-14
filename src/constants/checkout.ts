/**
 * Centralized configuration and constants for the checkout workflow.
 * All monetary amounts are defined strictly in Paise (1 INR = 100 Paise).
 */

export const CHECKOUT_CONFIG = {
  // Free delivery threshold: Orders of ₹500 (50,000 paise) or more get free delivery
  FREE_DELIVERY_THRESHOLD_IN_PAISE: 50000,

  // Standard delivery fee: ₹50 (5,000 paise)
  STANDARD_DELIVERY_CHARGE_IN_PAISE: 5000,

  // Maximum order value permitted for Cash On Delivery: ₹5,000 (500,000 paise)
  COD_MAX_AMOUNT_IN_PAISE: 500000,

  // Estimated delivery timeframe in business days
  ESTIMATED_DELIVERY_MIN_DAYS: 2,
  ESTIMATED_DELIVERY_MAX_DAYS: 5,

  // Currency
  CURRENCY: "INR" as const,
};

export type PromoRule = {
  code: string;
  minSubtotalInPaise: number;
  discountType: "PERCENTAGE" | "FLAT";
  discountValue: number; // e.g. 10 for 10%, or 5000 for ₹50
  maxDiscountInPaise?: number;
  description: string;
};

export const ACTIVE_PROMO_RULES: Record<string, PromoRule> = {
  BENGAL10: {
    code: "BENGAL10",
    minSubtotalInPaise: 20000, // ₹200 min
    discountType: "PERCENTAGE",
    discountValue: 10, // 10%
    maxDiscountInPaise: 10000, // max ₹100
    description: "10% discount on orders above ₹200 (up to ₹100)",
  },
  FLAT50: {
    code: "FLAT50",
    minSubtotalInPaise: 30000, // ₹300 min
    discountType: "FLAT",
    discountValue: 5000, // ₹50
    description: "Flat ₹50 off on orders above ₹300",
  },
};

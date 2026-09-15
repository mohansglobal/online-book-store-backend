export interface WelcomeEmailJobPayload {
  toEmail: string;
  name: string;
  userId: string;
}

export interface EmailVerificationOtpJobPayload {
  toEmail: string;
  name: string;
  otp: string;
  validityMinutes: number;
}

export interface PasswordResetOtpJobPayload {
  toEmail: string;
  name: string;
  otp: string;
  validityMinutes: number;
}

export interface OrderItemEmailDetail {
  title: string;
  quantity: number;
  priceInPaise: number;
  subtotalInPaise: number;
}

export interface OrderConfirmationEmailJobPayload {
  toEmail: string;
  buyerName: string;
  orderNumber: string;
  orderId: string;
  items: OrderItemEmailDetail[];
  subtotalInPaise: number;
  deliveryChargeInPaise: number;
  couponDiscountInPaise: number;
  totalAmountInPaise: number;
  paymentMethod: string;
  shippingAddress: {
    fullName: string;
    streetAddress?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

export interface SellerNewOrderAlertJobPayload {
  toEmail: string;
  sellerName: string;
  orderNumber: string;
  orderId: string;
  items: {
    title: string;
    quantity: number;
    subtotalInPaise: number;
  }[];
}

export interface OrderCancellationEmailJobPayload {
  toEmail: string;
  recipientName: string;
  orderNumber: string;
  orderId: string;
  reason: string;
  refundStatus: string;
  totalAmountInPaise: number;
}

export type EmailJobData =
  | { type: "WELCOME"; data: WelcomeEmailJobPayload }
  | { type: "EMAIL_VERIFICATION_OTP"; data: EmailVerificationOtpJobPayload }
  | { type: "PASSWORD_RESET_OTP"; data: PasswordResetOtpJobPayload }
  | { type: "ORDER_CONFIRMATION"; data: OrderConfirmationEmailJobPayload }
  | { type: "SELLER_NEW_ORDER_ALERT"; data: SellerNewOrderAlertJobPayload }
  | { type: "ORDER_CANCELLATION"; data: OrderCancellationEmailJobPayload };

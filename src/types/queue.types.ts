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
    mobileNumber?: string;
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

export interface OrderStatusUpdateItemDetail {
  title: string;
  quantity: number;
  status: string;
}

export interface OrderStatusUpdateEmailJobPayload {
  toEmail: string;
  buyerName: string;
  orderNumber: string;
  orderId: string;
  previousStatus?: string;
  newStatus: string;
  statusMessage?: string;
  sellerName?: string;
  items: OrderStatusUpdateItemDetail[];
  tracking?: {
    courier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDeliveryDate?: string;
  };
}

export type EmailJobData =
  | { type: "WELCOME"; data: WelcomeEmailJobPayload }
  | { type: "EMAIL_VERIFICATION_OTP"; data: EmailVerificationOtpJobPayload }
  | { type: "PASSWORD_RESET_OTP"; data: PasswordResetOtpJobPayload }
  | { type: "ORDER_CONFIRMATION"; data: OrderConfirmationEmailJobPayload }
  | { type: "SELLER_NEW_ORDER_ALERT"; data: SellerNewOrderAlertJobPayload }
  | { type: "ORDER_CANCELLATION"; data: OrderCancellationEmailJobPayload }
  | { type: "ORDER_STATUS_UPDATE"; data: OrderStatusUpdateEmailJobPayload };


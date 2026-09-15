export const QUEUE_NAMES = {
  EMAIL: "email-queue",
  NOTIFICATION: "notification-queue",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const EMAIL_JOB_NAMES = {
  SEND_WELCOME_EMAIL: "send-welcome-email",
  SEND_EMAIL_VERIFICATION_OTP: "send-email-verification-otp",
  SEND_PASSWORD_RESET_OTP: "send-password-reset-otp",
  SEND_ORDER_CONFIRMATION: "send-order-confirmation",
  SEND_SELLER_NEW_ORDER_ALERT: "send-seller-new-order-alert",
  SEND_ORDER_CANCELLATION: "send-order-cancellation",
} as const;

export type EmailJobName = (typeof EMAIL_JOB_NAMES)[keyof typeof EMAIL_JOB_NAMES];

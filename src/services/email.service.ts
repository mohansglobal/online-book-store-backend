import nodemailer from "nodemailer";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

import type {
  OrderConfirmationEmailJobPayload,
  SellerNewOrderAlertJobPayload,
  OrderCancellationEmailJobPayload,
  WelcomeEmailJobPayload,
  EmailVerificationOtpJobPayload,
  PasswordResetOtpJobPayload,
} from "../types/queue.types.js";

const smtpHost = env.EMAIL_HOST || "smtp.hostinger.com";
const smtpPort = env.EMAIL_PORT || 465;
const smtpUser = env.SMTP_KYC_USER || env.EMAIL_USER || "";
const smtpPass = env.SMTP_KYC_PASS || env.EMAIL_PASS || "";
const isSecure = smtpPort === 465;

export const emailTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: isSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
}

export const sendEmail = async ({
  to,
  subject,
  text,
}: SendMailOptions) => {
  const from = `Online BookStore <${smtpUser}>`;

  const info = await emailTransporter.sendMail({
    from,
    to,
    subject,
    text,
  });

  logger.info(
    {
      messageId: info.messageId,
      recipient: to,
      subject,
    },
    "Email sent successfully via SMTP",
  );

  return info;
};

export const verifySmtpConnection = async (): Promise<boolean> => {
  try {
    await emailTransporter.verify();

    logger.info(
      {
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
      },
      "SMTP server connection verified successfully",
    );

    return true;
  } catch (error) {
    logger.error(
      {
        error,
        host: smtpHost,
        port: smtpPort,
      },
      "SMTP verification failed",
    );

    return false;
  }
};

const formatRupees = (paise: number): string => {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const sendOrderConfirmationEmail = async (
  data: OrderConfirmationEmailJobPayload,
) => {
  const isCashOnDelivery =
    data.paymentMethod === "CASH_ON_DELIVERY";

  const paymentStatus = isCashOnDelivery
    ? "Cash on Delivery"
    : "Paid Online";

  const orderItems = data.items
    .map((item) => {
      const price = formatRupees(item.priceInPaise);
      const subtotal = formatRupees(item.subtotalInPaise);

      return `${item.title}
Quantity: ${item.quantity}
Price: ${price}
Subtotal: ${subtotal}`;
    })
    .join("\n\n");

  const deliveryCharge =
    data.deliveryChargeInPaise > 0
      ? formatRupees(data.deliveryChargeInPaise)
      : "FREE";

  const couponDiscount =
    data.couponDiscountInPaise > 0
      ? formatRupees(data.couponDiscountInPaise)
      : "₹0.00";

  const shippingAddress = data.shippingAddress;

  const text = `Hello ${data.buyerName},

Thank you for your order.

Your order has been successfully placed and confirmed.

Order Number: ${data.orderNumber}
Payment Status: ${paymentStatus}

Delivery Address:
${shippingAddress.fullName}
${shippingAddress.streetAddress || ""}
${shippingAddress.city}, ${shippingAddress.state || ""}
${shippingAddress.postalCode}
${shippingAddress.country}

Order Items:

${orderItems}

Items Subtotal: ${formatRupees(data.subtotalInPaise)}
Delivery Fee: ${deliveryCharge}
Coupon Discount: ${couponDiscount}
Total Amount: ${formatRupees(data.totalAmountInPaise)}

We will notify you once your order has been dispatched.

Regards,
Online BookStore`;

  return sendEmail({
    to: data.toEmail,
    subject: `Order Confirmed: #${data.orderNumber}`,
    text,
  });
};

export const sendSellerNewOrderAlertEmail = async (
  data: SellerNewOrderAlertJobPayload,
) => {
  const orderItems = data.items
    .map((item) => {
      const subtotal = formatRupees(item.subtotalInPaise);

      return `${item.title}
Quantity: ${item.quantity}
Amount: ${subtotal}`;
    })
    .join("\n\n");

  const text = `Hello ${data.sellerName},

You have received a new order.

Order Number: ${data.orderNumber}

Items to Pack:

${orderItems}

Please prepare the books for dispatch.

Regards,
Online BookStore`;

  return sendEmail({
    to: data.toEmail,
    subject: `New Order Received: #${data.orderNumber}`,
    text,
  });
};

export const sendOrderCancellationEmail = async (
  data: OrderCancellationEmailJobPayload,
) => {
  let refundMessage = "Not Applicable";

  if (data.refundStatus === "PENDING") {
    refundMessage =
      "Refund initiated. It may take 3-5 business days.";
  }

  if (data.refundStatus === "PROCESSED") {
    refundMessage = "Refund completed.";
  }

  const text = `Hello ${data.recipientName},

Your order has been cancelled.

Order Number: ${data.orderNumber}
Order Amount: ${formatRupees(data.totalAmountInPaise)}

Cancellation Reason:
${data.reason}

Refund Status:
${refundMessage}

Regards,
Online BookStore`;

  return sendEmail({
    to: data.toEmail,
    subject: `Order Cancelled: #${data.orderNumber}`,
    text,
  });
};

export const sendWelcomeEmail = async (
  data: WelcomeEmailJobPayload,
) => {
  const text = `Hello ${data.name},

Welcome to Online BookStore.

Your account has been created successfully.

You can now browse books, place orders, manage your account and track your purchases.

Thank you for joining us.

Regards,
Online BookStore`;

  return sendEmail({
    to: data.toEmail,
    subject: "Welcome to Online BookStore",
    text,
  });
};

export const sendOtpEmail = async (
  data: EmailVerificationOtpJobPayload | PasswordResetOtpJobPayload,
  type: "VERIFICATION" | "PASSWORD_RESET",
) => {
  const isVerification = type === "VERIFICATION";

  const purpose = isVerification
    ? "verify your email address"
    : "reset your password";

  const subject = isVerification
    ? "Email Verification Code"
    : "Password Reset Code";

  const text = `Hello ${data.name},

Use the following OTP to ${purpose}:

${data.otp}

This OTP is valid for ${data.validityMinutes} minutes.

Do not share this OTP with anyone.

If you did not request this code, you can ignore this email.

Regards,
Online BookStore`;

  return sendEmail({
    to: data.toEmail,
    subject,
    text,
  });
};
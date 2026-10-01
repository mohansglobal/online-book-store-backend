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
  OrderStatusUpdateEmailJobPayload,
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
  html?: string;
}

export const sendEmail = async ({
  to,
  subject,
  text,
  html,
}: SendMailOptions) => {
  const from = `Online BookStore <${smtpUser}>`;

  const info = await emailTransporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
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
      { host: smtpHost, port: smtpPort, user: smtpUser },
      "SMTP server connection verified successfully",
    );
    return true;
  } catch (error) {
    logger.error(
      { error, host: smtpHost, port: smtpPort },
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

/**
 * Base HTML Template for professional, clean layout with a top banner.
 */
const generateBaseHtml = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #3f3f46; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .banner { background-color: #0f172a; padding: 24px 32px; text-align: center; }
    .banner h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px; }
    .content { padding: 32px; font-size: 16px; line-height: 1.6; }
    .footer { background-color: #f8fafc; padding: 24px; text-align: center; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; }
    h2 { color: #0f172a; margin-top: 0; font-size: 20px; }
    .otp-box { background-color: #f1f5f9; border: 1px dashed #cbd5e1; padding: 16px; text-align: center; font-size: 28px; font-weight: 700; color: #0f172a; letter-spacing: 4px; border-radius: 6px; margin: 24px 0; }
    .table-container { width: 100%; overflow-x: auto; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background-color: #f8fafc; padding: 12px; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; color: #3f3f46; }
    .summary-box { background-color: #f8fafc; padding: 16px; border-radius: 6px; margin-top: 24px; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .summary-row.total { font-weight: 700; color: #0f172a; font-size: 18px; border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="banner">
      <h1>Online BookStore</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Online BookStore. All rights reserved.<br>
      <span style="margin-top: 8px; display: inline-block;">This is an automated message, please do not reply.</span>
    </div>
  </div>
</body>
</html>
`;

export const sendOrderConfirmationEmail = async (
  data: OrderConfirmationEmailJobPayload,
) => {
  const isCashOnDelivery = data.paymentMethod === "CASH_ON_DELIVERY";
  const paymentStatus = isCashOnDelivery ? "Cash on Delivery" : "Paid Online";

  const deliveryCharge = data.deliveryChargeInPaise > 0 ? formatRupees(data.deliveryChargeInPaise) : "FREE";
  const couponDiscount = data.couponDiscountInPaise > 0 ? formatRupees(data.couponDiscountInPaise) : "₹0.00";
  const { shippingAddress } = data;

  const orderItemsText = data.items.map((item) => `${item.title}\nQuantity: ${item.quantity}\nPrice: ${formatRupees(item.priceInPaise)}\nSubtotal: ${formatRupees(item.subtotalInPaise)}`).join("\n\n");
  const orderItemsHtml = data.items.map((item) => `
    <tr>
      <td>${item.title}</td>
      <td>${item.quantity}</td>
      <td>${formatRupees(item.priceInPaise)}</td>
      <td>${formatRupees(item.subtotalInPaise)}</td>
    </tr>
  `).join("");

  const text = `Hello ${data.buyerName},\n\nThank you for your order.\n\nYour order has been successfully placed and confirmed.\n\nOrder Number: ${data.orderNumber}\nPayment Status: ${paymentStatus}\n\nDelivery Address:\n${shippingAddress.fullName}\n${shippingAddress.streetAddress || ""}\n${shippingAddress.city}, ${shippingAddress.state || ""}\n${shippingAddress.postalCode}\n${shippingAddress.country}\n\nOrder Items:\n\n${orderItemsText}\n\nItems Subtotal: ${formatRupees(data.subtotalInPaise)}\nDelivery Fee: ${deliveryCharge}\nCoupon Discount: ${couponDiscount}\nTotal Amount: ${formatRupees(data.totalAmountInPaise)}\n\nWe will notify you once your order has been dispatched.\n\nRegards,\nOnline BookStore`;

  const html = generateBaseHtml(`
    <h2>Order Confirmed!</h2>
    <p>Hello <strong>${data.buyerName}</strong>,</p>
    <p>Thank you for shopping with us. Your order has been successfully placed and confirmed. We are getting it ready for dispatch.</p>
    
    <div style="margin: 24px 0; padding: 16px; border: 1px solid #e2e8f0; border-radius: 6px;">
      <p style="margin: 0 0 8px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
      <p style="margin: 0;"><strong>Payment Status:</strong> ${paymentStatus}</p>
    </div>

    <h3>Delivery Address</h3>
    <p style="color: #64748b;">
      ${shippingAddress.fullName}<br>
      ${shippingAddress.streetAddress ? shippingAddress.streetAddress + '<br>' : ""}
      ${shippingAddress.city}, ${shippingAddress.state || ""}<br>
      ${shippingAddress.postalCode}<br>
      ${shippingAddress.country}
    </p>

    <h3>Order Details</h3>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${orderItemsHtml}
        </tbody>
      </table>
    </div>

    <div class="summary-box">
      <div class="summary-row"><span>Items Subtotal:</span> <span>${formatRupees(data.subtotalInPaise)}</span></div>
      <div class="summary-row"><span>Delivery Fee:</span> <span>${deliveryCharge}</span></div>
      <div class="summary-row"><span>Coupon Discount:</span> <span>${couponDiscount}</span></div>
      <div class="summary-row total"><span>Total Amount:</span> <span>${formatRupees(data.totalAmountInPaise)}</span></div>
    </div>

    <p style="margin-top: 32px;">We will notify you via email once your order has been dispatched.</p>
    <p>Regards,<br><strong>Online BookStore Team</strong></p>
  `);

  return sendEmail({
    to: data.toEmail,
    subject: `Order Confirmed: #${data.orderNumber}`,
    text,
    html,
  });
};

export const sendSellerNewOrderAlertEmail = async (
  data: SellerNewOrderAlertJobPayload,
) => {
  const orderItemsText = data.items.map((item) => `${item.title}\nQuantity: ${item.quantity}\nAmount: ${formatRupees(item.subtotalInPaise)}`).join("\n\n");
  const orderItemsHtml = data.items.map((item) => `<tr><td>${item.title}</td><td>${item.quantity}</td><td>${formatRupees(item.subtotalInPaise)}</td></tr>`).join("");

  const text = `Hello ${data.sellerName},\n\nYou have received a new order.\n\nOrder Number: ${data.orderNumber}\n\nItems to Pack:\n\n${orderItemsText}\n\nPlease prepare the books for dispatch.\n\nRegards,\nOnline BookStore`;

  const html = generateBaseHtml(`
    <h2>New Order Alert</h2>
    <p>Hello <strong>${data.sellerName}</strong>,</p>
    <p>Great news! You have received a new order that requires your attention.</p>
    <p><strong>Order Number:</strong> ${data.orderNumber}</p>
    
    <h3>Items to Pack</h3>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${orderItemsHtml}
        </tbody>
      </table>
    </div>
    
    <p style="margin-top: 32px;">Please prepare the books for dispatch as soon as possible.</p>
    <p>Regards,<br><strong>Online BookStore Team</strong></p>
  `);

  return sendEmail({
    to: data.toEmail,
    subject: `New Order Received: #${data.orderNumber}`,
    text,
    html,
  });
};

export const sendOrderCancellationEmail = async (
  data: OrderCancellationEmailJobPayload,
) => {
  let refundMessage = "Not Applicable";
  if (data.refundStatus === "PENDING") refundMessage = "Refund initiated. It may take 3-5 business days.";
  if (data.refundStatus === "PROCESSED") refundMessage = "Refund completed.";

  const text = `Hello ${data.recipientName},\n\nYour order has been cancelled.\n\nOrder Number: ${data.orderNumber}\nOrder Amount: ${formatRupees(data.totalAmountInPaise)}\n\nCancellation Reason:\n${data.reason}\n\nRefund Status:\n${refundMessage}\n\nRegards,\nOnline BookStore`;

  const html = generateBaseHtml(`
    <h2>Order Cancelled</h2>
    <p>Hello <strong>${data.recipientName}</strong>,</p>
    <p>We are writing to inform you that your order has been cancelled.</p>
    
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 16px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
      <p style="margin: 0 0 8px 0;"><strong>Order Amount:</strong> ${formatRupees(data.totalAmountInPaise)}</p>
      <p style="margin: 0;"><strong>Reason:</strong> ${data.reason}</p>
    </div>

    <h3>Refund Status</h3>
    <p>${refundMessage}</p>

    <p style="margin-top: 32px;">If you have any questions, please reach out to our support team.</p>
    <p>Regards,<br><strong>Online BookStore Team</strong></p>
  `);

  return sendEmail({
    to: data.toEmail,
    subject: `Order Cancelled: #${data.orderNumber}`,
    text,
    html,
  });
};

export const sendWelcomeEmail = async (
  data: WelcomeEmailJobPayload,
) => {
  const text = `Hello ${data.name},\n\nWelcome to Online BookStore.\n\nYour account has been created successfully.\n\nYou can now browse books, place orders, manage your account and track your purchases.\n\nThank you for joining us.\n\nRegards,\nOnline BookStore`;

  const html = generateBaseHtml(`
    <h2>Welcome to Online BookStore!</h2>
    <p>Hello <strong>${data.name}</strong>,</p>
    <p>Your account has been created successfully. We are thrilled to have you on board!</p>
    <p>You can now seamlessly browse our vast collection of books, place orders, manage your account, and track your purchases all in one place.</p>
    <p>Thank you for joining our community of readers.</p>
    <p style="margin-top: 32px;">Happy Reading!</p>
    <p>Regards,<br><strong>Online BookStore Team</strong></p>
  `);

  return sendEmail({
    to: data.toEmail,
    subject: "Welcome to Online BookStore",
    text,
    html,
  });
};

export const sendOtpEmail = async (
  data: EmailVerificationOtpJobPayload | PasswordResetOtpJobPayload,
  type: "VERIFICATION" | "PASSWORD_RESET",
) => {
  const isVerification = type === "VERIFICATION";
  const purpose = isVerification ? "verify your email address" : "reset your password";
  const subject = isVerification ? "Email Verification Code" : "Password Reset Code";
  const title = isVerification ? "Verify Your Email" : "Reset Your Password";

  const text = `Hello ${data.name},\n\nUse the following OTP to ${purpose}:\n\n${data.otp}\n\nThis OTP is valid for ${data.validityMinutes} minutes.\n\nDo not share this OTP with anyone.\n\nIf you did not request this code, you can ignore this email.\n\nRegards,\nOnline BookStore`;

  const html = generateBaseHtml(`
    <h2>${title}</h2>
    <p>Hello <strong>${data.name}</strong>,</p>
    <p>Please use the following OTP to ${purpose}:</p>
    
    <div class="otp-box">${data.otp}</div>
    
    <p>This code is securely generated and valid for <strong>${data.validityMinutes} minutes</strong>.</p>
    <p style="color: #ef4444; font-size: 14px;"><strong>Security Note:</strong> Do not share this OTP with anyone. Our team will never ask you for this code.</p>
    <p style="font-size: 14px; color: #64748b;">If you did not request this action, you can safely ignore this email.</p>
    
    <p style="margin-top: 32px;">Regards,<br><strong>Online BookStore Team</strong></p>
  `);

  return sendEmail({
    to: data.toEmail,
    subject,
    text,
    html,
  });
};

export const sendOrderStatusUpdateEmail = async (
  data: OrderStatusUpdateEmailJobPayload,
) => {
  const normalizedStatus = data.newStatus.toUpperCase();

  let defaultStatusMessage = `Your order status has been updated to <strong>${normalizedStatus}</strong>.`;
  if (normalizedStatus === "CONFIRMED") defaultStatusMessage = "Your order has been confirmed by the seller and is queued for preparation.";
  else if (normalizedStatus === "PROCESSING") defaultStatusMessage = "The seller is currently processing and packing your book items.";
  else if (normalizedStatus === "SHIPPED") defaultStatusMessage = "Great news! Your order has been dispatched and is on its way to you.";
  else if (normalizedStatus === "DELIVERED") defaultStatusMessage = "Your order has been successfully delivered! We hope you enjoy your reading experience.";
  else if (normalizedStatus === "CANCELLED") defaultStatusMessage = "The seller or system has cancelled the specified items in your order.";

  const effectiveMessage = data.statusMessage || defaultStatusMessage;
  const orderItemsListText = data.items.map((item) => `- ${item.title} (Quantity: ${item.quantity}) - Status: ${item.status}`).join("\n");
  const orderItemsHtml = data.items.map((item) => `<tr><td>${item.title}</td><td>${item.quantity}</td><td><span style="background-color: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${item.status}</span></td></tr>`).join("");

  let trackingSectionText = "";
  let trackingSectionHtml = "";
  if (data.tracking?.courier || data.tracking?.trackingNumber) {
    trackingSectionText = `\nDelivery & Tracking Information:\nCourier: ${data.tracking.courier || ""}\nTracking Number: ${data.tracking.trackingNumber || ""}\nTracking Link: ${data.tracking.trackingUrl || ""}\nEstimated Delivery: ${data.tracking.estimatedDeliveryDate || ""}`;
    
    trackingSectionHtml = `
      <h3>Tracking Information</h3>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; border-left: 4px solid #3b82f6;">
        ${data.tracking.courier ? `<p style="margin: 0 0 8px 0;"><strong>Courier:</strong> ${data.tracking.courier}</p>` : ""}
        ${data.tracking.trackingNumber ? `<p style="margin: 0 0 8px 0;"><strong>Tracking Number:</strong> ${data.tracking.trackingNumber}</p>` : ""}
        ${data.tracking.estimatedDeliveryDate ? `<p style="margin: 0 0 8px 0;"><strong>Estimated Delivery:</strong> ${data.tracking.estimatedDeliveryDate}</p>` : ""}
        ${data.tracking.trackingUrl ? `<p style="margin: 0;"><a href="${data.tracking.trackingUrl}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">Track Your Package &rarr;</a></p>` : ""}
      </div>
    `;
  }

  const sellerNote = data.sellerName ? `Fulfilled by: ${data.sellerName}\n` : "";
  const text = `Hello ${data.buyerName},\n\n${effectiveMessage}\n\nOrder Number: ${data.orderNumber}\nCurrent Status: ${normalizedStatus}\n${sellerNote}${trackingSectionText}\nUpdated Items:\n${orderItemsListText}\n\nYou can track your order status anytime by visiting your account dashboard on Online BookStore.\n\nThank you for choosing Online BookStore!\n\nRegards,\nOnline BookStore`;

  const html = generateBaseHtml(`
    <h2>Order Status Update</h2>
    <p>Hello <strong>${data.buyerName}</strong>,</p>
    <p style="font-size: 18px; color: #0f172a;">${effectiveMessage}</p>
    
    <p><strong>Order Number:</strong> ${data.orderNumber}<br>
    <strong>Current Status:</strong> <span style="color: #3b82f6; font-weight: bold;">${normalizedStatus}</span>
    ${data.sellerName ? `<br><strong>Fulfilled by:</strong> ${data.sellerName}` : ""}</p>
    
    ${trackingSectionHtml}

    <h3>Updated Items</h3>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${orderItemsHtml}
        </tbody>
      </table>
    </div>

    <p style="margin-top: 32px;">You can track your order status anytime by visiting your account dashboard.</p>
    <p>Thank you for choosing Online BookStore!</p>
    <p>Regards,<br><strong>Online BookStore Team</strong></p>
  `);

  return sendEmail({
    to: data.toEmail,
    subject: `Order #${data.orderNumber} Status Update: ${normalizedStatus}`,
    text,
    html,
  });
};
import { Queue, type JobsOptions } from "bullmq";

import { QUEUE_NAMES, EMAIL_JOB_NAMES } from "../constants/queues.js";
import { defaultQueueOptions } from "./base.queue.js";
import { logger } from "../utils/logger.js";
import type {
  WelcomeEmailJobPayload,
  EmailVerificationOtpJobPayload,
  PasswordResetOtpJobPayload,
  OrderConfirmationEmailJobPayload,
  SellerNewOrderAlertJobPayload,
  OrderCancellationEmailJobPayload,
} from "../types/queue.types.js";

/**
 * Dedicated BullMQ queue for email tasks.
 */
export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, defaultQueueOptions);

/**
 * Dispatches a Welcome Email job to the background queue.
 */
export const dispatchWelcomeEmailJob = async (
  payload: WelcomeEmailJobPayload,
  customOptions?: JobsOptions,
) => {
  const job = await emailQueue.add(
    EMAIL_JOB_NAMES.SEND_WELCOME_EMAIL,
    payload,
    customOptions,
  );

  logger.info(
    { jobId: job.id, toEmail: payload.toEmail, userId: payload.userId },
    "Dispatched welcome email job to queue",
  );

  return job;
};

/**
 * Dispatches an Email Verification OTP job to the background queue.
 */
export const dispatchEmailVerificationOtpJob = async (
  payload: EmailVerificationOtpJobPayload,
  customOptions?: JobsOptions,
) => {
  const job = await emailQueue.add(
    EMAIL_JOB_NAMES.SEND_EMAIL_VERIFICATION_OTP,
    payload,
    customOptions,
  );

  logger.info(
    { jobId: job.id, toEmail: payload.toEmail },
    "Dispatched email verification OTP job to queue",
  );

  return job;
};

/**
 * Dispatches a Password Reset OTP job to the background queue.
 */
export const dispatchPasswordResetOtpJob = async (
  payload: PasswordResetOtpJobPayload,
  customOptions?: JobsOptions,
) => {
  const job = await emailQueue.add(
    EMAIL_JOB_NAMES.SEND_PASSWORD_RESET_OTP,
    payload,
    customOptions,
  );

  logger.info(
    { jobId: job.id, toEmail: payload.toEmail },
    "Dispatched password reset OTP job to queue",
  );

  return job;
};

/**
 * Dispatches an Order Confirmation email job to the background queue.
 */
export const dispatchOrderConfirmationJob = async (
  payload: OrderConfirmationEmailJobPayload,
  customOptions?: JobsOptions,
) => {
  const job = await emailQueue.add(
    EMAIL_JOB_NAMES.SEND_ORDER_CONFIRMATION,
    payload,
    customOptions,
  );

  logger.info(
    {
      jobId: job.id,
      orderNumber: payload.orderNumber,
      toEmail: payload.toEmail,
    },
    "Dispatched order confirmation email job to queue",
  );

  return job;
};

/**
 * Dispatches a Seller New Order alert email job to the background queue.
 */
export const dispatchSellerNewOrderAlertJob = async (
  payload: SellerNewOrderAlertJobPayload,
  customOptions?: JobsOptions,
) => {
  const job = await emailQueue.add(
    EMAIL_JOB_NAMES.SEND_SELLER_NEW_ORDER_ALERT,
    payload,
    customOptions,
  );

  logger.info(
    {
      jobId: job.id,
      orderNumber: payload.orderNumber,
      sellerEmail: payload.toEmail,
    },
    "Dispatched seller new order alert job to queue",
  );

  return job;
};

/**
 * Dispatches an Order Cancellation email job to the background queue.
 */
export const dispatchOrderCancellationJob = async (
  payload: OrderCancellationEmailJobPayload,
  customOptions?: JobsOptions,
) => {
  const job = await emailQueue.add(
    EMAIL_JOB_NAMES.SEND_ORDER_CANCELLATION,
    payload,
    customOptions,
  );

  logger.info(
    {
      jobId: job.id,
      orderNumber: payload.orderNumber,
      recipientEmail: payload.toEmail,
    },
    "Dispatched order cancellation email job to queue",
  );

  return job;
};

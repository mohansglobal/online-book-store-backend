import { Worker, type Job } from "bullmq";

import { QUEUE_NAMES, EMAIL_JOB_NAMES } from "../constants/queues.js";
import { redisConnectionOptions } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import {
  sendWelcomeEmail,
  sendOtpEmail,
  sendOrderConfirmationEmail,
  sendSellerNewOrderAlertEmail,
  sendOrderCancellationEmail,
} from "../services/email.service.js";
import type {
  WelcomeEmailJobPayload,
  EmailVerificationOtpJobPayload,
  PasswordResetOtpJobPayload,
  OrderConfirmationEmailJobPayload,
  SellerNewOrderAlertJobPayload,
  OrderCancellationEmailJobPayload,
} from "../types/queue.types.js";

const handleWelcomeEmail = async (data: WelcomeEmailJobPayload) => {
  logger.info(
    { toEmail: data.toEmail, name: data.name, userId: data.userId },
    "Processing welcome email job via SMTP",
  );
  return await sendWelcomeEmail(data);
};

const handleEmailVerificationOtp = async (data: EmailVerificationOtpJobPayload) => {
  logger.info(
    { toEmail: data.toEmail, name: data.name },
    "Processing email verification OTP job via SMTP",
  );
  return await sendOtpEmail(data, "VERIFICATION");
};

const handlePasswordResetOtp = async (data: PasswordResetOtpJobPayload) => {
  logger.info(
    { toEmail: data.toEmail, name: data.name },
    "Processing password reset OTP job via SMTP",
  );
  return await sendOtpEmail(data, "PASSWORD_RESET");
};

const handleOrderConfirmation = async (data: OrderConfirmationEmailJobPayload) => {
  logger.info(
    {
      toEmail: data.toEmail,
      orderNumber: data.orderNumber,
      totalAmountInPaise: data.totalAmountInPaise,
    },
    "Processing order confirmation email job via SMTP",
  );
  return await sendOrderConfirmationEmail(data);
};

const handleSellerNewOrderAlert = async (data: SellerNewOrderAlertJobPayload) => {
  logger.info(
    {
      sellerEmail: data.toEmail,
      orderNumber: data.orderNumber,
      itemCount: data.items.length,
    },
    "Processing seller new order alert email job via SMTP",
  );
  return await sendSellerNewOrderAlertEmail(data);
};

const handleOrderCancellation = async (data: OrderCancellationEmailJobPayload) => {
  logger.info(
    {
      recipientEmail: data.toEmail,
      orderNumber: data.orderNumber,
      refundStatus: data.refundStatus,
    },
    "Processing order cancellation email job via SMTP",
  );
  return await sendOrderCancellationEmail(data);
};

//Main email queue worker processor function.

export const processEmailJob = async (job: Job) => {
  const jobName = job.name;

  switch (jobName) {
    case EMAIL_JOB_NAMES.SEND_WELCOME_EMAIL:
      return await handleWelcomeEmail(job.data as WelcomeEmailJobPayload);

    case EMAIL_JOB_NAMES.SEND_EMAIL_VERIFICATION_OTP:
      return await handleEmailVerificationOtp(
        job.data as EmailVerificationOtpJobPayload,
      );

    case EMAIL_JOB_NAMES.SEND_PASSWORD_RESET_OTP:
      return await handlePasswordResetOtp(
        job.data as PasswordResetOtpJobPayload,
      );

    case EMAIL_JOB_NAMES.SEND_ORDER_CONFIRMATION:
      return await handleOrderConfirmation(
        job.data as OrderConfirmationEmailJobPayload,
      );

    case EMAIL_JOB_NAMES.SEND_SELLER_NEW_ORDER_ALERT:
      return await handleSellerNewOrderAlert(
        job.data as SellerNewOrderAlertJobPayload,
      );

    case EMAIL_JOB_NAMES.SEND_ORDER_CANCELLATION:
      return await handleOrderCancellation(
        job.data as OrderCancellationEmailJobPayload,
      );

    default:
      logger.warn({ jobName, jobId: job.id }, "Unknown email job type received");
      throw new Error(`Unknown job name: ${jobName}`);
  }
};

/**
 * Creates and starts the BullMQ Worker for the email queue.
 */
export const createEmailWorker = (): Worker => {
  const worker = new Worker(QUEUE_NAMES.EMAIL, processEmailJob, {
    connection: redisConnectionOptions,
    concurrency: 5,
  });

  worker.on("ready", () => {
    logger.info("BullMQ Email Worker is ready and waiting for jobs");
  });

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, jobName: job.name },
      "Email job completed successfully",
    );
  });

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        error: error.message,
      },
      "Email job failed",
    );
  });

  worker.on("error", (error) => {
    logger.error({ error }, "BullMQ Email Worker encountered a connection error");
  });

  worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Email job stalled and will be reprocessed");
  });

  return worker;
};

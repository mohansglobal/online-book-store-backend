import { createEmailWorker } from "../workers/email.worker.js";
import {
  dispatchWelcomeEmailJob,
  dispatchOrderConfirmationJob,
  dispatchPasswordResetOtpJob,
  emailQueue,
} from "../queues/email.queue.js";
import { logger } from "../utils/logger.js";

const runQueueTest = async () => {
  logger.info("🧪 Starting BullMQ Queue & Worker Verification Test...");

  // 1. Start worker
  const worker = createEmailWorker();

  // 2. Dispatch Welcome Email Job
  const welcomeJob = await dispatchWelcomeEmailJob({
    userId: "usr_test_123",
    toEmail: "test.buyer@example.com",
    name: "Mohan Kumar",
  });
  logger.info({ jobId: welcomeJob.id }, "Enqueued test welcome email job");

  // 3. Dispatch Password Reset OTP Job
  const otpJob = await dispatchPasswordResetOtpJob({
    toEmail: "test.buyer@example.com",
    name: "Mohan Kumar",
    otp: "849201",
    validityMinutes: 10,
  });
  logger.info({ jobId: otpJob.id }, "Enqueued test password reset OTP job");

  // 4. Dispatch Order Confirmation Job
  const orderJob = await dispatchOrderConfirmationJob({
    toEmail: "test.buyer@example.com",
    buyerName: "Mohan Kumar",
    orderNumber: "ORD-TEST-9999",
    orderId: "ord_test_9999",
    items: [
      {
        title: "Clean Code: A Handbook of Agile Software Craftsmanship",
        quantity: 1,
        priceInPaise: 49900,
        subtotalInPaise: 49900,
      },
    ],
    subtotalInPaise: 49900,
    deliveryChargeInPaise: 0,
    couponDiscountInPaise: 5000,
    totalAmountInPaise: 44900,
    paymentMethod: "ONLINE_PAY",
    shippingAddress: {
      fullName: "Mohan Kumar",
      streetAddress: "123 Tech Park Road",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India",
    },
  });
  logger.info({ jobId: orderJob.id }, "Enqueued test order confirmation job");

  // Wait 3 seconds for worker to process all jobs
  logger.info("Waiting for jobs to process...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Clean shutdown
  await worker.close();
  await emailQueue.close();

  logger.info("✅ BullMQ verification test finished successfully!");
  process.exit(0);
};

runQueueTest().catch((err) => {
  logger.error({ err }, "❌ BullMQ test failed");
  process.exit(1);
});

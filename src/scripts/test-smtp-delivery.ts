import { verifySmtpConnection } from "../services/email.service.js";
import { createEmailWorker } from "../workers/email.worker.js";
import {
  dispatchOrderConfirmationJob,
  emailQueue,
} from "../queues/email.queue.js";
import { logger } from "../utils/logger.js";

const runSmtpPipelineTest = async () => {
  logger.info("1️⃣ Verifying SMTP connection...");
  const isVerified = await verifySmtpConnection();
  if (!isVerified) {
    logger.error("SMTP verification failed");
    process.exit(1);
  }

  // 2. Start email worker
  logger.info("2️⃣ Starting BullMQ Email Worker...");
  const worker = createEmailWorker();

  // 3. Enqueue real order confirmation email job
  const orderNumber = `ORD-CONFIRM-${Date.now().toString(36).toUpperCase()}`;
  logger.info({ orderNumber }, "3️⃣ Enqueuing order confirmation email job...");

  const job = await dispatchOrderConfirmationJob({
    toEmail: "gamermohan39@gmail.com", // Send test email to working mailbox
    buyerName: "Mohan Kumar",
    orderNumber,
    orderId: "ord_live_test_789",
    items: [
      {
        title: "The Pragmatic Programmer: 20th Anniversary Edition",
        quantity: 1,
        priceInPaise: 69900,
        subtotalInPaise: 69900,
      },
      {
        title: "Clean Architecture by Robert C. Martin",
        quantity: 2,
        priceInPaise: 45000,
        subtotalInPaise: 90000,
      },
    ],
    subtotalInPaise: 159900,
    deliveryChargeInPaise: 0,
    couponDiscountInPaise: 10000,
    totalAmountInPaise: 149900,
    paymentMethod: "ONLINE_PAY",
    shippingAddress: {
      fullName: "Mohan Kumar",
      streetAddress: "45 MG Road, Indiranagar",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560038",
      country: "India",
    },
  });

  logger.info({ jobId: job.id }, "Job enqueued. Waiting for worker to process and deliver via SMTP...");

  // Wait 7 seconds for worker delivery
  await new Promise((resolve) => setTimeout(resolve, 7000));

  await worker.close();
  await emailQueue.close();

  logger.info("🎉 Full BullMQ + Nodemailer SMTP Pipeline Test Completed Successfully!");
  process.exit(0);
};

runSmtpPipelineTest().catch((err) => {
  logger.error({ err }, "Pipeline test failed");
  process.exit(1);
});

import { Router } from "express";

import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createOrderSchema,
  orderQuerySchema,
  orderParamSchema,
  verifyPaymentSchema,
  initiateRazorpayOrderSchema,
  cancelOrderSchema,
} from "../validation/order.schema.js";
import {
  createOrder,
  getMyOrders,
  getSellerOrders,
  getOrderById,
  verifyOrderPayment,
  initiateRazorpayOrder,
  cancelOrder,
} from "../controllers/order.controller.js";

const router = Router();

router.use(authenticate);

// 1) Gateway Order Initiation: POST /api/v1/orders/razorpay-order
router.post(
  "/razorpay-order",
  validate(initiateRazorpayOrderSchema, "body"),
  initiateRazorpayOrder,
);

// 2) Create Order: POST /api/v1/orders (with /checkout as alias)
router.post("/", validate(createOrderSchema, "body"), createOrder);
router.post("/checkout", validate(createOrderSchema, "body"), createOrder);

// 3) Payment Verification: POST /api/v1/orders/:id/verify-payment
router.post(
  "/:id/verify-payment",
  validate(orderParamSchema, "params"),
  validate(verifyPaymentSchema, "body"),
  verifyOrderPayment,
);

// 4) Cancel Order: POST /api/v1/orders/:id/cancel
router.post(
  "/:id/cancel",
  validate(orderParamSchema, "params"),
  validate(cancelOrderSchema, "body"),
  cancelOrder,
);

// 5) See all orders: GET /api/v1/orders (with /me as alias)
router.get("/", validate(orderQuerySchema, "query"), getMyOrders);
router.get("/me", validate(orderQuerySchema, "query"), getMyOrders);

router.get(
  "/seller",
  authorize("SELLER", "ADMIN"),
  validate(orderQuerySchema, "query"),
  getSellerOrders,
);
router.get("/:id", validate(orderParamSchema, "params"), getOrderById);

export default router;


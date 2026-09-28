import { Router } from "express";

import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createOrderSchema,
  orderQuerySchema,
  orderParamSchema,
  orderItemParamSchema,
  verifyPaymentSchema,
  initiateRazorpayOrderSchema,
  cancelOrderSchema,
  updateOrderItemFulfillmentSchema,
} from "../validation/order.schema.js";
import { sellerDashboardRecentOrdersQuerySchema } from "../validation/dashboard.schema.js";
import {
  createOrder,
  getMyOrders,
  getSellerOrders,
  getOrderById,
  verifyOrderPayment,
  initiateRazorpayOrder,
  cancelOrder,
  cancelOrderItem,
  updateOrderItemFulfillment,
} from "../controllers/order.controller.js";
import { getSellerRecentOrders } from "../controllers/dashboard.controller.js";

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

// 4) Cancel Order: POST /api/v1/orders/:id/cancel (cancels specified itemIds or all items)
router.post(
  "/:id/cancel",
  validate(orderParamSchema, "params"),
  validate(cancelOrderSchema, "body"),
  cancelOrder,
);

// 4a) Cancel Single Order Item: POST /api/v1/orders/:id/items/:itemId/cancel
router.post(
  "/:id/items/:itemId/cancel",
  validate(orderItemParamSchema, "params"),
  validate(cancelOrderSchema, "body"),
  cancelOrderItem,
);

// 4b) Seller Item Fulfillment & Tracking: PATCH /api/v1/orders/:id/items/:itemId/fulfillment
router.patch(
  "/:id/items/:itemId/fulfillment",
  authorize("SELLER", "ADMIN"),
  validate(orderItemParamSchema, "params"),
  validate(updateOrderItemFulfillmentSchema, "body"),
  updateOrderItemFulfillment,
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
router.get(
  "/seller/recent",
  authorize("SELLER", "ADMIN"),
  validate(sellerDashboardRecentOrdersQuerySchema, "query"),
  getSellerRecentOrders,
);
router.get(
  "/seller/recent-orders",
  authorize("SELLER", "ADMIN"),
  validate(sellerDashboardRecentOrdersQuerySchema, "query"),
  getSellerRecentOrders,
);
router.get("/:id", validate(orderParamSchema, "params"), getOrderById);

export default router;


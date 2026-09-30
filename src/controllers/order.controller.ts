import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  createOrderService,
  getMyOrdersService,
  getSellerOrdersService,
  getOrderByIdService,
  verifyOrderPaymentService,
  initiateRazorpayOrderService,
  cancelOrderService,
  updateOrderItemFulfillmentService,
  updateSellerOrderStatusService,
} from "../services/order.service.js";
import type {
  CheckoutInput,
  OrderQueryInput,
  VerifyPaymentInput,
  InitiateRazorpayOrderInput,
  CancelOrderInput,
  UpdateOrderItemFulfillmentInput,
  UpdateSellerOrderStatusInput,
} from "../validation/order.schema.js";

export const createOrder = asyncHandler(async (req, res) => {
  const order = await createOrderService(
    req.user!.id,
    req.body as CheckoutInput,
  );
  apiResponse(res, HTTP_STATUS.CREATED, "Order created successfully", order);
});

export const verifyOrderPayment = asyncHandler(async (req, res) => {
  const order = await verifyOrderPaymentService(
    req.user!.id,
    req.params.id as string,
    req.body as VerifyPaymentInput,
  );
  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Payment verified and order confirmed successfully",
    order,
  );
});

export const initiateRazorpayOrder = asyncHandler(async (req, res) => {
  const result = await initiateRazorpayOrderService(
    req.user!.id,
    req.body as InitiateRazorpayOrderInput,
  );
  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Razorpay order initiated successfully",
    result,
  );
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await cancelOrderService(
    req.params.id as string,
    req.user!,
    req.body as CancelOrderInput,
  );
  apiResponse(res, HTTP_STATUS.OK, "Order cancelled successfully", order);
});

export const cancelOrderItem = asyncHandler(async (req, res) => {
  const orderId = req.params.id as string;
  const itemId = req.params.itemId as string;
  const reason = (req.body as { reason?: string })?.reason;

  const order = await cancelOrderService(
    orderId,
    req.user!,
    {
      reason,
      itemIds: [itemId],
    },
  );
  apiResponse(res, HTTP_STATUS.OK, "Order item cancelled successfully", order);
});

export const updateOrderItemFulfillment = asyncHandler(async (req, res) => {
  const orderId = req.params.id as string;
  const itemId = req.params.itemId as string;
  const input = req.body as UpdateOrderItemFulfillmentInput;

  const result = await updateOrderItemFulfillmentService(
    orderId,
    itemId,
    req.user!,
    input,
  );
  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Order item fulfillment updated successfully",
    result,
  );
});

export const updateSellerOrderStatus = asyncHandler(async (req, res) => {
  const orderId = req.params.id as string;
  const input = req.body as UpdateSellerOrderStatusInput;

  const result = await updateSellerOrderStatusService(
    orderId,
    req.user!,
    input,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Order status updated successfully",
    result,
  );
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const { orders, meta } = await getMyOrdersService(
    req.user!.id,
    req.query as unknown as OrderQueryInput,
  );
  apiResponse(res, HTTP_STATUS.OK, "Orders retrieved successfully", orders, meta);
});

export const getSellerOrders = asyncHandler(async (req, res) => {
  const { orders, meta } = await getSellerOrdersService(
    req.user!.id,
    req.query as unknown as OrderQueryInput,
  );
  apiResponse(res, HTTP_STATUS.OK, "Seller orders retrieved successfully", orders, meta);
});

export const getOrderById = asyncHandler(async (req, res) => {
  const order = await getOrderByIdService(
    req.params.id as string,
    req.user!,
  );
  apiResponse(res, HTTP_STATUS.OK, "Order retrieved successfully", order);
});



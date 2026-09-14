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
} from "../services/order.service.js";
import type {
  CheckoutInput,
  OrderQueryInput,
  VerifyPaymentInput,
  InitiateRazorpayOrderInput,
  CancelOrderInput,
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



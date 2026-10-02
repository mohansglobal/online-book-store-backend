import mongoose from "mongoose";

import { OrderModel, type OrderDocument } from "../models/order.model.js";
import { BookListingModel, type BookListingDocument } from "../models/book-listing.model.js";
import { BookModel, type BookDocument } from "../models/book.model.js";
import { CartModel } from "../models/cart.model.js";
import { AddressModel } from "../models/address.model.js";
import { UserModel } from "../models/user.model.js";
import { CHECKOUT_CONFIG, ACTIVE_PROMO_RULES } from "../constants/checkout.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import { resolveListingPricing } from "../utils/pricing.util.js";
import { env } from "../config/env.js";
import {
  verifyRazorpaySignature,
  createRazorpayGatewayOrder,
} from "./payment.service.js";
import {
  dispatchOrderConfirmationJob,
  dispatchSellerNewOrderAlertJob,
  dispatchOrderCancellationJob,
  dispatchOrderStatusUpdateJob,
} from "../queues/email.queue.js";
import type {
  CreateOrderInput,
  OrderQueryInput,
  VerifyPaymentInput,
  InitiateRazorpayOrderInput,
  CancelOrderInput,
  UpdateOrderItemFulfillmentInput,
  UpdateSellerOrderStatusInput,
} from "../validation/order.schema.js";

// Rolling sequence counter (0001 to 9999) to ensure uniqueness within the same second
let sequenceCounter = Math.floor(10 + Math.random() * 80);

const getNextSequenceNumber = (): string => {
  const current = sequenceCounter;
  sequenceCounter = sequenceCounter >= 9999 ? 1 : sequenceCounter + 1;
  return String(current).padStart(4, "0");
};

/**
 * Generates a clean, human-readable, business-meaningful order identifier.
 * Format: ORD-YYYYMMDD-HHMMSS-NNNN (e.g. ORD-20261001-115523-0042)
 * - ORD: entity prefix (Order)
 * - YYYYMMDD: date of order (Year, Month, Day)
 * - HHMMSS: timestamp of order (Hours, Minutes, Seconds)0.
 * - NNNN: 4-digit sequence / uniqueness number
 */
export const generateOrderNumber = (): string => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const datePart = `${year}${month}${day}`;

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timePart = `${hours}${minutes}${seconds}`;

  const sequencePart = getNextSequenceNumber();

  return `ORD-${datePart}-${timePart}-${sequencePart}`;
};

/**
 * Generates a seller fulfillment sub-order identifier.
 * Format: ORD-YYYYMMDD-HHMMSS-NNNN-S01 (e.g. ORD-20261001-115523-0042-S01)
 */
export const generateSellerOrderNumber = (
  masterOrderNumber: string,
  sellerIndex: number,
): string => {
  const formattedIndex = String(sellerIndex).padStart(2, "0");
  return `${masterOrderNumber}-S${formattedIndex}`;
};

/**
 * Dispatches order confirmation email to buyer and alerts to respective sellers in the background queue.
 */
const sendSuccessfulOrderNotifications = async (
  order: OrderDocument & { _id: mongoose.Types.ObjectId },
) => {
  try {
    const buyerId = order.buyer.toString();
    const buyer = await UserModel.findById(buyerId).lean();

    const buyerEmail = order.shippingAddress?.email || buyer?.email;
    const buyerName =
      order.shippingAddress?.fullName || buyer?.name || "Valued Customer";

    if (buyerEmail) {
      const emailItems = order.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        priceInPaise: item.priceInPaise,
        subtotalInPaise: item.subtotalInPaise,
      }));

      await dispatchOrderConfirmationJob({
        toEmail: buyerEmail,
        buyerName,
        orderNumber: order.orderNumber,
        orderId: order._id.toString(),
        items: emailItems,
        subtotalInPaise: order.subtotalInPaise ?? 0,
        deliveryChargeInPaise: order.deliveryChargeInPaise ?? 0,
        couponDiscountInPaise: order.couponDiscountInPaise ?? 0,
        totalAmountInPaise: order.totalAmountInPaise,
        paymentMethod: order.paymentMethod,
        shippingAddress: {
          fullName: order.shippingAddress?.fullName || buyerName,
          streetAddress:
            order.shippingAddress?.streetAddress ||
            order.shippingAddress?.street ||
            "",
          city: order.shippingAddress?.city || "",
          state: order.shippingAddress?.state || "",
          postalCode: order.shippingAddress?.postalCode || "",
          country: order.shippingAddress?.country || "",
        },
      });
    }

    // Group order items by seller and send individual alerts
    const sellerItemsMap = new Map<
      string,
      { title: string; quantity: number; subtotalInPaise: number }[]
    >();

    for (const item of order.items) {
      const sellerIdStr = item.seller.toString();
      const existing = sellerItemsMap.get(sellerIdStr) || [];
      existing.push({
        title: item.title,
        quantity: item.quantity,
        subtotalInPaise: item.subtotalInPaise,
      });
      sellerItemsMap.set(sellerIdStr, existing);
    }

    for (const [sellerId, sellerItems] of sellerItemsMap.entries()) {
      const seller = await UserModel.findById(sellerId).lean();
      if (seller?.email) {
        await dispatchSellerNewOrderAlertJob({
          toEmail: seller.email,
          sellerName: seller.name || "Seller",
          orderNumber: order.orderNumber,
          orderId: order._id.toString(),
          items: sellerItems,
        });
      }
    }
  } catch (error) {
    logger.error(
      { error, orderId: order._id, orderNumber: order.orderNumber },
      "Failed to dispatch background order confirmation email jobs",
    );
  }
};

/**
 * Dispatches order cancellation email notice in the background queue.
 */
const sendOrderCancellationNotifications = async (
  order: OrderDocument & { _id: mongoose.Types.ObjectId },
) => {
  try {
    const buyerId = order.buyer.toString();
    const buyer = await UserModel.findById(buyerId).lean();

    const recipientEmail = order.shippingAddress?.email || buyer?.email;
    const recipientName =
      order.shippingAddress?.fullName || buyer?.name || "Valued Customer";

    if (recipientEmail) {
      await dispatchOrderCancellationJob({
        toEmail: recipientEmail,
        recipientName,
        orderNumber: order.orderNumber,
        orderId: order._id.toString(),
        reason: order.cancellationReason || "Cancelled by user",
        refundStatus: order.refundStatus || "NONE",
        totalAmountInPaise: order.totalAmountInPaise,
      });
    }
  } catch (error) {
    logger.error(
      { error, orderId: order._id, orderNumber: order.orderNumber },
      "Failed to dispatch order cancellation email job",
    );
  }
};

interface OrderStatusNotificationParams {
  order: OrderDocument & { _id: mongoose.Types.ObjectId };
  updatedItems: Array<{
    title: string;
    quantity: number;
    status: string;
  }>;
  newStatus: string;
  previousStatus?: string;
  statusMessage?: string;
  sellerId?: string;
  tracking?: {
    courier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDeliveryDate?: string;
  };
}

const sendOrderStatusUpdateNotification = async ({
  order,
  updatedItems,
  newStatus,
  previousStatus,
  statusMessage,
  sellerId,
  tracking,
}: OrderStatusNotificationParams) => {
  try {
    const buyerId = order.buyer.toString();
    const buyer = await UserModel.findById(buyerId).lean();

    const recipientEmail = order.shippingAddress?.email || buyer?.email;
    const recipientName =
      order.shippingAddress?.fullName || buyer?.name || "Valued Customer";

    if (!recipientEmail) {
      logger.warn(
        { orderId: order._id, orderNumber: order.orderNumber },
        "No recipient email found for order status update notification",
      );
      return;
    }

    let sellerName: string | undefined = undefined;
    if (sellerId) {
      const seller = await UserModel.findById(sellerId).lean();
      if (seller?.name) {
        sellerName = seller.name;
      }
    }

    const itemsPayload = updatedItems.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      status: item.status,
    }));

    await dispatchOrderStatusUpdateJob({
      toEmail: recipientEmail,
      buyerName: recipientName,
      orderNumber: order.orderNumber,
      orderId: order._id.toString(),
      newStatus,
      previousStatus,
      statusMessage,
      sellerName,
      items: itemsPayload,
      tracking,
    });
  } catch (error) {
    logger.error(
      { error, orderId: order._id, orderNumber: order.orderNumber, newStatus },
      "Failed to dispatch background order status update email job",
    );
  }
};

export const createOrderService = async (
  buyerId: string,
  input: CreateOrderInput,
) => {
  // 1. Resolve and validate shipping and billing addresses
  let shippingAddressPayload: Record<string, unknown> | null = null;
  let billingAddressPayload: Record<string, unknown> | null = null;

  if (input.shippingAddressId) {
    const addr = await AddressModel.findOne({
      _id: new mongoose.Types.ObjectId(input.shippingAddressId),
      user: new mongoose.Types.ObjectId(buyerId),
    }).lean();

    if (!addr) {
      throw new AppError(
        "Shipping address not found or does not belong to your account",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    shippingAddressPayload = {
      fullName: addr.fullName,
      email: addr.email,
      mobileNumber: addr.mobileNumber,
      street: addr.streetAddress,
      streetAddress: addr.streetAddress,
      apartment: addr.apartment,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country,
    };
  } else if (input.shippingAddress) {
    shippingAddressPayload = {
      ...input.shippingAddress,
      streetAddress: input.shippingAddress.street,
    };
  } else {
    throw new AppError(
      "Shipping address is required to place an order",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  if (input.billingSameAsShipping) {
    billingAddressPayload = shippingAddressPayload;
  } else if (input.billingAddressId) {
    const bAddr = await AddressModel.findOne({
      _id: new mongoose.Types.ObjectId(input.billingAddressId),
      user: new mongoose.Types.ObjectId(buyerId),
    }).lean();

    if (!bAddr) {
      throw new AppError(
        "Billing address not found or does not belong to your account",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    billingAddressPayload = {
      fullName: bAddr.fullName,
      email: bAddr.email,
      mobileNumber: bAddr.mobileNumber,
      street: bAddr.streetAddress,
      streetAddress: bAddr.streetAddress,
      apartment: bAddr.apartment,
      city: bAddr.city,
      state: bAddr.state,
      postalCode: bAddr.postalCode,
      country: bAddr.country,
    };
  } else {
    billingAddressPayload = shippingAddressPayload;
  }

  // 2. Validate Cart & items (Direct Buy Now or Cart Checkout)
  const hasDirectItems = Array.isArray(input.items) && input.items.length > 0;
  let checkoutItems: { bookListing: string; quantity: number }[] = [];
  let isCartCheckout = false;

  if (hasDirectItems) {
    checkoutItems = input.items!.map((item) => {
      const listingId = (item.bookListingId || item.bookListing || "").trim();
      return {
        bookListing: listingId,
        quantity: item.quantity,
      };
    });
  } else {
    // Load from Cart
    const cart = await CartModel.findOne({ user: buyerId }).lean();
    if (!cart || cart.items.length === 0) {
      throw new AppError(
        "Your cart is empty. Add items to checkout.",
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    checkoutItems = cart.items.map((item) => ({
      bookListing: item.bookListing.toString(),
      quantity: item.quantity,
    }));
    isCartCheckout = true;
  }

  // 3. ATOMIC STOCK ACQUISITION WITH ROLLBACK
  const acquiredItems: {
    listing: BookListingDocument & { _id: mongoose.Types.ObjectId };
    book: BookDocument & { _id: mongoose.Types.ObjectId };
    quantity: number;
    priceInPaise: number;
    subtotalInPaise: number;
  }[] = [];

  for (const item of checkoutItems) {
    const listingId = new mongoose.Types.ObjectId(item.bookListing);

    // Atomic stock decrement
    const updatedListing = (await BookListingModel.findOneAndUpdate(
      {
        _id: listingId,
        isActive: true,
        stock: { $gte: item.quantity },
      },
      {
        $inc: { stock: -item.quantity },
      },
      { returnDocument: "after" },
    )) as (BookListingDocument & { _id: mongoose.Types.ObjectId }) | null;

    if (!updatedListing) {
      // Rollback all previously acquired stocks in this transaction
      for (const acquired of acquiredItems) {
        await BookListingModel.findByIdAndUpdate(acquired.listing._id, {
          $inc: { stock: acquired.quantity },
        });
      }

      throw new AppError(
        `Insufficient stock or unavailable listing for item ID: ${item.bookListing}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Lookup canonical book metadata
    const bookDoc = (await BookModel.findById(updatedListing.book).lean()) as
      | (BookDocument & { _id: mongoose.Types.ObjectId })
      | null;

    if (!bookDoc || bookDoc.status !== "ACTIVE") {
      // Rollback current and previous
      await BookListingModel.findByIdAndUpdate(updatedListing._id, {
        $inc: { stock: item.quantity },
      });
      for (const acquired of acquiredItems) {
        await BookListingModel.findByIdAndUpdate(acquired.listing._id, {
          $inc: { stock: acquired.quantity },
        });
      }
      throw new AppError(
        "Canonical book for listing is unavailable or inactive",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const pricing = resolveListingPricing(updatedListing);
    const priceInPaise = pricing.effectivePriceInPaise;
    const subtotalInPaise = priceInPaise * item.quantity;

    acquiredItems.push({
      listing: updatedListing,
      book: bookDoc,
      quantity: item.quantity,
      priceInPaise,
      subtotalInPaise,
    });
  }

  // 4. Authoritative recalculation of subtotal, delivery charge, coupon discount, and grand total
  const subtotalInPaise = acquiredItems.reduce(
    (sum, item) => sum + item.subtotalInPaise,
    0,
  );

  let deliveryChargeInPaise = 0;
  if (acquiredItems.length > 0) {
    if (subtotalInPaise >= CHECKOUT_CONFIG.FREE_DELIVERY_THRESHOLD_IN_PAISE) {
      deliveryChargeInPaise = 0;
    } else {
      deliveryChargeInPaise = CHECKOUT_CONFIG.STANDARD_DELIVERY_CHARGE_IN_PAISE;
    }
  }

  let couponDiscountInPaise = 0;
  let appliedCouponCode: string | undefined = undefined;

  if (input.couponCode) {
    const cleanCode = input.couponCode.trim().toUpperCase();
    const rule = ACTIVE_PROMO_RULES[cleanCode];

    if (rule && subtotalInPaise >= rule.minSubtotalInPaise) {
      let discount = 0;
      if (rule.discountType === "PERCENTAGE") {
        const raw = Math.round((subtotalInPaise * rule.discountValue) / 100);
        discount = rule.maxDiscountInPaise
          ? Math.min(raw, rule.maxDiscountInPaise)
          : raw;
      } else {
        discount = rule.discountValue;
      }
      discount = Math.min(discount, subtotalInPaise);
      couponDiscountInPaise = discount;
      appliedCouponCode = cleanCode;
    }
  }

  const totalAmountInPaise = Math.max(
    0,
    subtotalInPaise + deliveryChargeInPaise - couponDiscountInPaise,
  );

  const paymentMethod = input.paymentMethod || "ONLINE_PAY";

  // Validate COD eligibility
  if (
    paymentMethod === "CASH_ON_DELIVERY" &&
    totalAmountInPaise > CHECKOUT_CONFIG.COD_MAX_AMOUNT_IN_PAISE
  ) {
    // Rollback stocks before failing
    for (const acquired of acquiredItems) {
      await BookListingModel.findByIdAndUpdate(acquired.listing._id, {
        $inc: { stock: acquired.quantity },
      });
    }

    throw new AppError(
      `Cash On Delivery is only permitted for orders up to ₹${CHECKOUT_CONFIG.COD_MAX_AMOUNT_IN_PAISE / 100}.`,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const orderNumber = generateOrderNumber();

  const razorpayPaymentId = input.razorpayPaymentId || input.paymentId;
  const razorpayOrderId = input.razorpayOrderId;
  const razorpaySignature = input.razorpaySignature;

  let initialPaymentStatus: "PENDING" | "PAID" = "PENDING";
  let initialOrderStatus: "PENDING" | "CONFIRMED" = "PENDING";
  let paidAt: Date | undefined = undefined;

  if (paymentMethod === "CASH_ON_DELIVERY") {
    initialPaymentStatus = "PENDING";
    initialOrderStatus = "CONFIRMED";
  } else if (paymentMethod === "ONLINE_PAY") {
    if (razorpayPaymentId) {
      if (razorpayOrderId && razorpaySignature) {
        const isSignatureValid = verifyRazorpaySignature({
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        });

        if (isSignatureValid) {
          initialPaymentStatus = "PAID";
          initialOrderStatus = "CONFIRMED";
          paidAt = new Date();
        } else {
          logger.warn(
            { razorpayOrderId, razorpayPaymentId },
            "Signature verification failed during order creation; marked payment as PENDING",
          );
        }
      } else {
        // Direct modal checkout without pre-generated order ID
        initialPaymentStatus = "PAID";
        initialOrderStatus = "CONFIRMED";
        paidAt = new Date();
      }
    }
  }

  const initialItemStatus =
    initialOrderStatus === "CONFIRMED" ? "CONFIRMED" : "PENDING";

  // Create Order items with item-level status and delivery timeline
  const orderItems = acquiredItems.map((item) => {
    const bookCover = item.book.coverImage?.trim();
    const bookGalleryFirst = item.book.images?.[0]?.trim();
    const bookCoverImage = bookCover || bookGalleryFirst || "";

    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 4);

    return {
      _id: new mongoose.Types.ObjectId(),
      bookListing: item.listing._id,
      book: item.book._id,
      seller: item.listing.seller,
      title: item.book.title,
      coverImage: bookCoverImage,
      priceInPaise: item.priceInPaise,
      quantity: item.quantity,
      subtotalInPaise: item.subtotalInPaise,
      status: initialItemStatus,
      estimatedDeliveryDate: estimatedDelivery,
      tracking: {},
    };
  });

  const newOrder = new OrderModel({
    orderNumber,
    buyer: new mongoose.Types.ObjectId(buyerId),
    items: orderItems,
    subtotalInPaise,
    deliveryChargeInPaise,
    couponDiscountInPaise,
    couponCode: appliedCouponCode,
    totalAmountInPaise,
    paymentMethod,
    orderStatus: initialOrderStatus,
    paymentStatus: initialPaymentStatus,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    paidAt,
    shippingAddress: shippingAddressPayload,
    billingAddress: billingAddressPayload,
    billingSameAsShipping: input.billingSameAsShipping,
  });

  await newOrder.save();

  // 5. If cart checkout, clear cart
  if (isCartCheckout) {
    await CartModel.findOneAndUpdate(
      { user: buyerId },
      { $set: { items: [] } },
    );
  }

  // 6. Trigger background email notifications if order is confirmed (e.g. COD or pre-verified)
  if (newOrder.orderStatus === "CONFIRMED") {
    void sendSuccessfulOrderNotifications(newOrder);
  }

  logger.info(
    {
      orderId: newOrder._id,
      orderNumber,
      buyerId,
      totalAmountInPaise,
      itemsCount: orderItems.length,
    },
    "Order created successfully with atomic stock deduction",
  );

  return newOrder;
};

const resolveItemCoverImage = (item: {
  coverImage?: string | null;
  book?: unknown;
}): string => {
  const book = item.book as
    | { coverImage?: string; images?: string[] }
    | undefined;

  const bookCoverImage = book?.coverImage?.trim();
  if (bookCoverImage) {
    return bookCoverImage;
  }

  const bookFirstGalleryImage = book?.images?.[0]?.trim();
  if (bookFirstGalleryImage) {
    return bookFirstGalleryImage;
  }

  const existingItemCoverImage = item.coverImage?.trim();
  if (existingItemCoverImage) {
    return existingItemCoverImage;
  }

  return "";
};

const buildDateFilter = (query: OrderQueryInput) => {
  const dateFilter: Record<string, Date> = {};
  const now = new Date();

  const range = query.dateRange?.toLowerCase();
  if (range === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    dateFilter.$gte = startOfToday;
    dateFilter.$lte = now;
  } else if (range === "last7days" || range === "last7" || range === "7d") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter.$gte = sevenDaysAgo;
    dateFilter.$lte = now;
  } else if (range === "last30days" || range === "last30" || range === "30d") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateFilter.$gte = thirtyDaysAgo;
    dateFilter.$lte = now;
  } else if (range === "last3months" || range === "last90" || range === "90d") {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    dateFilter.$gte = ninetyDaysAgo;
    dateFilter.$lte = now;
  } else if (range === "thisyear" || range === "year") {
    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    dateFilter.$gte = startOfYear;
    dateFilter.$lte = now;
  }

  const rawStart = query.startDate || query.from;
  const rawEnd = query.endDate || query.to;

  if (rawStart) {
    const sDate = new Date(rawStart);
    if (!isNaN(sDate.getTime())) {
      sDate.setHours(0, 0, 0, 0);
      dateFilter.$gte = sDate;
    }
  }

  if (rawEnd) {
    const eDate = new Date(rawEnd);
    if (!isNaN(eDate.getTime())) {
      eDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = eDate;
    }
  }

  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
};

export const getMyOrdersService = async (
  buyerId: string,
  query: OrderQueryInput,
) => {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { buyer: buyerId };
  if (query.status) {
    filter.orderStatus = query.status.toUpperCase();
  }

  const dateFilter = buildDateFilter(query);
  if (dateFilter) {
    filter.createdAt = dateFilter;
  }

  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("items.seller", "name email")
      .populate("items.book", "title titleBn coverImage images slug format")
      .populate("items.bookListing", "format condition edition mrpInPaise sellingPriceInPaise")
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  const formattedOrders = orders.map((order) => {
    const formattedItems = (order.items || []).map((item) => {
      const coverImage = resolveItemCoverImage(item);
      return {
        ...item,
        coverImage,
        image: coverImage,
      };
    });

    return {
      ...order,
      items: formattedItems,
    };
  });

  return {
    orders: formattedOrders,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Computes the fulfillment status specifically for a seller's portion of an order.
 * If all of this seller's items are shipped, the seller sees "SHIPPED",
 * even if another seller's items in the same multi-seller order are still pending.
 */
export const computeSellerOrderStatus = (
  sellerItems: Array<{ status?: string | null }>,
  fallbackStatus: string = "CONFIRMED",
): string => {
  if (!sellerItems || sellerItems.length === 0) {
    return fallbackStatus;
  }

  let activeCount = 0;
  let deliveredCount = 0;
  let shippedCount = 0;
  let processingCount = 0;
  let confirmedCount = 0;

  for (const it of sellerItems) {
    const status = it.status ? it.status.toUpperCase() : "";
    if (status === "CANCELLED") {
      // Do not count cancelled items in active total
    } else {
      activeCount += 1;
      if (status === "DELIVERED") {
        deliveredCount += 1;
      } else if (status === "SHIPPED") {
        shippedCount += 1;
      } else if (status === "PROCESSING") {
        processingCount += 1;
      } else if (status === "CONFIRMED" || status === "PENDING") {
        confirmedCount += 1;
      }
    }
  }

  if (activeCount === 0) {
    return "CANCELLED";
  }

  if (deliveredCount === activeCount) {
    return "DELIVERED";
  }

  if (shippedCount + deliveredCount === activeCount) {
    return "SHIPPED";
  }

  if (shippedCount > 0 || deliveredCount > 0) {
    return "PARTIALLY_SHIPPED";
  }

  if (processingCount > 0) {
    return "PROCESSING";
  }

  if (confirmedCount > 0) {
    return "CONFIRMED";
  }

  return fallbackStatus;
};

export const getSellerOrdersService = async (
  sellerId: string,
  query: OrderQueryInput,
) => {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { "items.seller": sellerId };
  if (query.status) {
    filter.orderStatus = query.status.toUpperCase();
  }

  const dateFilter = buildDateFilter(query);
  if (dateFilter) {
    filter.createdAt = dateFilter;
  }

  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("buyer", "name email mobileNumber profilePicture")
      .populate("items.seller", "name email")
      .populate("items.book", "title titleBn coverImage images slug format")
      .populate("items.bookListing", "format condition edition mrpInPaise sellingPriceInPaise")
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  // Filter items in order to only show items belonging to this seller
  const sellerFilteredOrders = orders.map((order) => {
    const sellerItems = (order.items || [])
      .filter((item) => {
        const itemSeller = item.seller as unknown;
        const itemSellerId =
          itemSeller && typeof itemSeller === "object" && "_id" in itemSeller
            ? String((itemSeller as { _id: unknown })._id)
            : itemSeller
              ? String(itemSeller)
              : "";
        return itemSellerId === sellerId;
      })
      .map((item) => {
        const coverImage = resolveItemCoverImage(item);
        return {
          ...item,
          coverImage,
          image: coverImage,
        };
      });

    const sellerSubtotal = sellerItems.reduce(
      (acc, item) => acc + item.subtotalInPaise,
      0,
    );

    const sellerFulfillmentStatus = computeSellerOrderStatus(
      sellerItems,
      order.orderStatus,
    );

    return {
      ...order,
      orderStatus: sellerFulfillmentStatus,
      overallOrderStatus: order.orderStatus,
      items: sellerItems,
      sellerSubtotalInPaise: sellerSubtotal,
    };
  });

  return {
    orders: sellerFilteredOrders,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getOrderByIdService = async (
  orderId: string,
  userContext: { id: string; role: string },
) => {
  const order = await OrderModel.findById(orderId)
    .populate("buyer", "name email mobileNumber profilePicture")
    .populate("items.seller", "name email")
    .populate("items.book", "title titleBn coverImage images slug format")
    .populate("items.bookListing", "format condition edition mrpInPaise sellingPriceInPaise")
    .lean();

  if (!order) {
    throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND);
  }

  const isBuyer = order.buyer?._id?.toString() === userContext.id;
  const isSeller = order.items.some((item) => {
    const itemSeller = item.seller as unknown;
    const itemSellerId =
      itemSeller && typeof itemSeller === "object" && "_id" in itemSeller
        ? String((itemSeller as { _id: unknown })._id)
        : itemSeller
          ? String(itemSeller)
          : "";
    return itemSellerId === userContext.id;
  });
  const isAdmin = userContext.role === "ADMIN";

  if (!isBuyer && !isSeller && !isAdmin) {
    throw new AppError("Forbidden: You do not have access to this order", HTTP_STATUS.FORBIDDEN);
  }

  const formattedItems = (order.items || []).map((item) => {
    const coverImage = resolveItemCoverImage(item);
    return {
      ...item,
      coverImage,
      image: coverImage,
    };
  });

  return {
    ...order,
    items: formattedItems,
  };
};

export const cancelOrderService = async (
  orderId: string,
  userContext: { id: string; role: string },
  input: CancelOrderInput,
) => {
  const order = await OrderModel.findById(orderId);

  if (!order) {
    throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND);
  }

  const isBuyer = order.buyer.toString() === userContext.id;
  const isAdmin = userContext.role === "ADMIN";

  if (!isBuyer && !isAdmin) {
    throw new AppError(
      "Forbidden: You do not have permission to cancel this order",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  if (order.orderStatus === "CANCELLED") {
    throw new AppError("This order has already been cancelled", HTTP_STATUS.BAD_REQUEST);
  }

  if (order.orderStatus === "DELIVERED") {
    throw new AppError(
      "Delivered orders cannot be cancelled",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const requestedItemIds = input.itemIds || [];
  const hasSpecificItems = requestedItemIds.length > 0;

  type OrderItemType = (typeof order.items)[number];
  const itemsToCancel: OrderItemType[] = [];

  if (hasSpecificItems) {
    const requestedIdSet = new Set(
      requestedItemIds.map((id) => id.toString().trim()),
    );

    for (const item of order.items) {
      const subdocId = item._id ? item._id.toString() : "";
      const listingId = item.bookListing ? item.bookListing.toString() : "";

      const isRequested =
        requestedIdSet.has(subdocId) || requestedIdSet.has(listingId);

      if (isRequested) {
        if (item.status === "CANCELLED") {
          throw new AppError(
            `Item "${item.title}" has already been cancelled`,
            HTTP_STATUS.BAD_REQUEST,
          );
        }

        if (item.status === "SHIPPED") {
          throw new AppError(
            `Item "${item.title}" has already been shipped and cannot be cancelled`,
            HTTP_STATUS.BAD_REQUEST,
          );
        }

        if (item.status === "DELIVERED") {
          throw new AppError(
            `Item "${item.title}" has already been delivered and cannot be cancelled`,
            HTTP_STATUS.BAD_REQUEST,
          );
        }

        itemsToCancel.push(item);
      }
    }

    if (itemsToCancel.length === 0) {
      throw new AppError(
        "None of the specified items were found in this order",
        HTTP_STATUS.NOT_FOUND,
      );
    }
  } else {
    // When no specific item IDs are passed, check if the entire order was already marked SHIPPED
    if (order.orderStatus === "SHIPPED") {
      throw new AppError(
        "Orders that have already been shipped cannot be cancelled",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Cancel all items that are not yet shipped, delivered, or cancelled
    for (const item of order.items) {
      const isAlreadyCancelled = item.status === "CANCELLED";
      const isShipped = item.status === "SHIPPED";
      const isDelivered = item.status === "DELIVERED";

      if (!isAlreadyCancelled && !isShipped && !isDelivered) {
        itemsToCancel.push(item);
      }
    }

    if (itemsToCancel.length === 0) {
      const allShipped = order.items.every(
        (i) => i.status === "SHIPPED" || i.status === "DELIVERED",
      );
      if (allShipped) {
        throw new AppError(
          "Orders that have already been shipped cannot be cancelled",
          HTTP_STATUS.BAD_REQUEST,
        );
      }
      throw new AppError(
        "This order has no cancellable items remaining",
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  }

  // Restore inventory stock atomically for each cancelled item
  for (const item of itemsToCancel) {
    await BookListingModel.findByIdAndUpdate(item.bookListing, {
      $inc: { stock: item.quantity },
    });
  }

  const cancellationTimestamp = new Date();
  const cancellationReasonText = input.reason || "Cancelled by user";

  // Mark status and cancellation record on each cancelled item
  for (const item of itemsToCancel) {
    item.status = "CANCELLED";
    item.cancellation = {
      cancelledAt: cancellationTimestamp,
      cancellationReason: cancellationReasonText,
    };
  }

  // Calculate refund amount for cancelled items
  let cancelledItemsSubtotal = 0;
  for (const item of itemsToCancel) {
    cancelledItemsSubtotal += item.subtotalInPaise;
  }

  if (order.paymentStatus === "PAID") {
    const currentRefundAmount = order.refundAmountInPaise || 0;
    order.refundAmountInPaise = currentRefundAmount + cancelledItemsSubtotal;
  }

  // Determine the new parent order status based on remaining items
  const totalItemsCount = order.items.length;
  let cancelledCount = 0;

  for (const item of order.items) {
    if (item.status === "CANCELLED") {
      cancelledCount += 1;
    }
  }

  const activeItemsRemaining = totalItemsCount - cancelledCount;

  if (activeItemsRemaining === 0) {
    // All items in the order are now cancelled
    order.orderStatus = "CANCELLED";
    order.cancelledAt = cancellationTimestamp;
    order.cancellationReason = cancellationReasonText;
    order.cancelledBy = new mongoose.Types.ObjectId(userContext.id);

    if (order.paymentStatus === "PAID") {
      order.refundStatus = "PENDING";
    }
  } else {
    // Partial cancellation: some items cancelled, some remaining
    order.orderStatus = "PARTIALLY_CANCELLED";
    order.cancelledAt = cancellationTimestamp;
    order.cancellationReason = cancellationReasonText;
    order.cancelledBy = new mongoose.Types.ObjectId(userContext.id);

    if (order.paymentStatus === "PAID") {
      order.refundStatus = "PARTIALLY_REFUNDED";
    }
  }

  await order.save();

  // Trigger background order cancellation email notification
  void sendOrderCancellationNotifications(order);

  logger.info(
    {
      orderId: order._id,
      orderNumber: order.orderNumber,
      cancelledItemsCount: itemsToCancel.length,
      activeItemsRemaining,
      orderStatus: order.orderStatus,
      refundAmountInPaise: order.refundAmountInPaise,
    },
    "Order items cancelled and stock restored successfully",
  );

  return order;
};

export const verifyOrderPaymentService = async (
  buyerId: string,
  orderId: string,
  input: VerifyPaymentInput,
) => {
  const order = await OrderModel.findOne({
    _id: new mongoose.Types.ObjectId(orderId),
    buyer: new mongoose.Types.ObjectId(buyerId),
  });

  if (!order) {
    throw new AppError(
      "Order not found or does not belong to your account",
      HTTP_STATUS.NOT_FOUND,
    );
  }

  // Idempotent return if already marked as PAID
  if (order.paymentStatus === "PAID") {
    return order;
  }

  const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = input;

  if (razorpayOrderId && razorpaySignature) {
    const isSignatureValid = verifyRazorpaySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isSignatureValid) {
      throw new AppError(
        "Invalid payment signature verification",
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  }

  order.paymentStatus = "PAID";
  order.orderStatus = "CONFIRMED";
  order.razorpayPaymentId = razorpayPaymentId;
  if (razorpayOrderId) order.razorpayOrderId = razorpayOrderId;
  if (razorpaySignature) order.razorpaySignature = razorpaySignature;
  order.paidAt = new Date();

  // Confirm pending order items
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      if (item.status === "PENDING") {
        item.status = "CONFIRMED";
      }
    }
  }

  await order.save();

  // Trigger background order confirmation notifications once payment is verified
  void sendSuccessfulOrderNotifications(order);

  logger.info(
    {
      orderId: order._id,
      orderNumber: order.orderNumber,
      razorpayPaymentId,
    },
    "Order payment verified and confirmed successfully",
  );

  return order;
};

export const updateOrderItemFulfillmentService = async (
  orderId: string,
  itemId: string,
  userContext: { id: string; role: string },
  input: UpdateOrderItemFulfillmentInput,
) => {
  const order = await OrderModel.findById(orderId);

  if (!order) {
    throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND);
  }

  // Find the target item by subdocument _id or bookListing ID
  const item = order.items.find((i) => {
    const subdocId = i._id ? i._id.toString() : "";
    const listingId = i.bookListing ? i.bookListing.toString() : "";
    return subdocId === itemId || listingId === itemId;
  });

  if (!item) {
    throw new AppError("Item not found in order", HTTP_STATUS.NOT_FOUND);
  }

  // Authorization: must be the seller of this specific item or ADMIN
  const itemSellerId = item.seller.toString();
  const isItemSeller = itemSellerId === userContext.id;
  const isAdmin = userContext.role === "ADMIN";

  if (!isItemSeller && !isAdmin) {
    throw new AppError(
      "Forbidden: You do not have permission to update fulfillment for this seller's item",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  if (item.status === "CANCELLED") {
    throw new AppError(
      "Cannot update fulfillment for a cancelled item",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // Update item tracking and delivery details
  if (input.estimatedDeliveryDate) {
    item.estimatedDeliveryDate = new Date(input.estimatedDeliveryDate);
  }

  if (!item.tracking) {
    item.tracking = {};
  }

  if (input.courier) {
    item.tracking.courier = input.courier;
  }

  if (input.trackingNumber) {
    item.tracking.trackingNumber = input.trackingNumber;
  }

  if (input.trackingUrl !== undefined) {
    item.tracking.trackingUrl = input.trackingUrl;
  }

  if (input.status) {
    item.status = input.status;

    if (input.status === "SHIPPED") {
      item.tracking.shippedAt = new Date();
    } else if (input.status === "DELIVERED") {
      item.tracking.deliveredAt = new Date();
    }
  }

  // Re-calculate aggregate orderStatus based on all active items
  let activeItemsCount = 0;
  let shippedItemsCount = 0;
  let deliveredItemsCount = 0;
  let processingItemsCount = 0;

  for (const it of order.items) {
    if (it.status !== "CANCELLED") {
      activeItemsCount += 1;
      if (it.status === "DELIVERED") {
        deliveredItemsCount += 1;
      } else if (it.status === "SHIPPED") {
        shippedItemsCount += 1;
      } else if (it.status === "PROCESSING") {
        processingItemsCount += 1;
      }
    }
  }

  if (activeItemsCount > 0) {
    if (deliveredItemsCount === activeItemsCount) {
      order.orderStatus = "DELIVERED";
    } else if (shippedItemsCount === activeItemsCount) {
      order.orderStatus = "SHIPPED";
    } else if (shippedItemsCount > 0 || deliveredItemsCount > 0) {
      order.orderStatus = "PARTIALLY_SHIPPED";
    } else if (processingItemsCount > 0) {
      order.orderStatus = "PROCESSING";
    }
  }

  await order.save();

  if (input.status) {
    void sendOrderStatusUpdateNotification({
      order,
      updatedItems: [
        {
          title: item.title,
          quantity: item.quantity,
          status: item.status,
        },
      ],
      newStatus: item.status,
      sellerId: userContext.id,
      tracking: {
        courier: item.tracking?.courier ?? undefined,
        trackingNumber: item.tracking?.trackingNumber ?? undefined,
        trackingUrl: item.tracking?.trackingUrl ?? undefined,
        estimatedDeliveryDate: item.estimatedDeliveryDate
          ? item.estimatedDeliveryDate.toISOString()
          : undefined,
      },
    });
  }

  logger.info(
    {
      orderId: order._id,
      itemId,
      sellerId: userContext.id,
      itemStatus: item.status,
      orderStatus: order.orderStatus,
    },
    "Order item fulfillment updated successfully",
  );

  return {
    order,
    updatedItem: item,
  };
};

export const initiateRazorpayOrderService = async (
  buyerId: string,
  input: InitiateRazorpayOrderInput,
) => {
  const hasDirectItems = Array.isArray(input.items) && input.items.length > 0;
  let checkoutItems: { bookListing: string; quantity: number }[] = [];

  if (hasDirectItems) {
    checkoutItems = input.items!.map((item) => {
      const listingId = (item.bookListingId || item.bookListing || "").trim();
      return {
        bookListing: listingId,
        quantity: item.quantity,
      };
    });
  } else {
    const cart = await CartModel.findOne({ user: buyerId }).lean();
    if (!cart || cart.items.length === 0) {
      throw new AppError(
        "Your cart is empty. Add items to initiate payment.",
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    checkoutItems = cart.items.map((item) => ({
      bookListing: item.bookListing.toString(),
      quantity: item.quantity,
    }));
  }

  let subtotalInPaise = 0;
  for (const item of checkoutItems) {
    const listing = await BookListingModel.findOne({
      _id: new mongoose.Types.ObjectId(item.bookListing),
      isActive: true,
    }).lean();

    if (!listing || listing.stock < item.quantity) {
      throw new AppError(
        `Insufficient stock or unavailable item: ${item.bookListing}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    subtotalInPaise += listing.sellingPriceInPaise * item.quantity;
  }

  let deliveryChargeInPaise = 0;
  if (subtotalInPaise < CHECKOUT_CONFIG.FREE_DELIVERY_THRESHOLD_IN_PAISE) {
    deliveryChargeInPaise = CHECKOUT_CONFIG.STANDARD_DELIVERY_CHARGE_IN_PAISE;
  }

  let couponDiscountInPaise = 0;
  if (input.couponCode) {
    const cleanCode = input.couponCode.trim().toUpperCase();
    const rule = ACTIVE_PROMO_RULES[cleanCode];
    if (rule && subtotalInPaise >= rule.minSubtotalInPaise) {
      if (rule.discountType === "PERCENTAGE") {
        const raw = Math.round((subtotalInPaise * rule.discountValue) / 100);
        couponDiscountInPaise = rule.maxDiscountInPaise
          ? Math.min(raw, rule.maxDiscountInPaise)
          : raw;
      } else {
        couponDiscountInPaise = rule.discountValue;
      }
      couponDiscountInPaise = Math.min(couponDiscountInPaise, subtotalInPaise);
    }
  }

  const totalAmountInPaise = Math.max(
    0,
    subtotalInPaise + deliveryChargeInPaise - couponDiscountInPaise,
  );

  if (totalAmountInPaise <= 0) {
    throw new AppError(
      "Payable total amount must be greater than zero",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const receipt = `rcpt_${Date.now().toString(36)}`;
  const gatewayOrder = await createRazorpayGatewayOrder({
    amountInPaise: totalAmountInPaise,
    currency: CHECKOUT_CONFIG.CURRENCY,
    receipt,
    notes: {
      buyerId,
      couponCode: input.couponCode || "NONE",
    },
  });

  return {
    razorpayOrderId: gatewayOrder.id,
    amountInPaise: totalAmountInPaise,
    currency: CHECKOUT_CONFIG.CURRENCY,
    keyId: env.RAZORPAY_KEY_ID || "",
  };
};

export const updateSellerOrderStatusService = async (
  orderId: string,
  userContext: { id: string; role: string },
  input: UpdateSellerOrderStatusInput,
) => {
  const order = await OrderModel.findById(orderId);

  if (!order) {
    throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND);
  }

  const isAdmin = userContext.role === "ADMIN";
  const sellerId = userContext.id;

  // Authorization: check if user is admin or seller of at least one item
  const hasSellerItems = order.items.some(
    (item) => item.seller.toString() === sellerId,
  );

  if (!isAdmin && !hasSellerItems) {
    throw new AppError(
      "Forbidden: You do not have permission to update this order",
      HTTP_STATUS.FORBIDDEN,
    );
  }

  // Prevent modifying terminal status orders
  if (order.orderStatus === "CANCELLED") {
    throw new AppError(
      "Cannot update status of a cancelled order",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  if (order.orderStatus === "DELIVERED") {
    throw new AppError(
      "Order has already been delivered and cannot be modified",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // Identify target items belonging to this seller (or all items if ADMIN)
  const targetItems = order.items.filter((item) => {
    const isOwner = isAdmin || item.seller.toString() === sellerId;
    if (!isOwner) {
      return false;
    }

    if (input.itemId) {
      const subdocId = item._id ? item._id.toString() : "";
      const listingId = item.bookListing ? item.bookListing.toString() : "";
      return subdocId === input.itemId || listingId === input.itemId;
    }

    return true;
  });

  if (targetItems.length === 0) {
    throw new AppError(
      "No eligible items found for your seller account in this order",
      HTTP_STATUS.NOT_FOUND,
    );
  }

  const previousOrderStatus = order.orderStatus;
  const newStatus = input.status;

  // Validate state transitions for each target item
  for (const item of targetItems) {
    if (item.status === "CANCELLED" && newStatus !== "CANCELLED") {
      throw new AppError(
        `Item "${item.title}" is already cancelled and cannot be updated to ${newStatus}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (item.status === "DELIVERED" && newStatus !== "DELIVERED") {
      throw new AppError(
        `Item "${item.title}" is already delivered and cannot be modified`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  }

  const updatedItemsList: Array<{
    title: string;
    quantity: number;
    status: string;
  }> = [];

  const now = new Date();

  // Apply status updates
  for (const item of targetItems) {
    // If transitioning to CANCELLED for the first time, restore stock atomically
    if (newStatus === "CANCELLED" && item.status !== "CANCELLED") {
      await BookListingModel.findByIdAndUpdate(item.bookListing, {
        $inc: { stock: item.quantity },
      });

      const cancellationReasonText =
        input.cancellationReason || "Cancelled by seller";

      item.status = "CANCELLED";
      item.cancellation = {
        cancelledAt: now,
        cancellationReason: cancellationReasonText,
      };

      if (order.paymentStatus === "PAID") {
        const currentRefund = order.refundAmountInPaise || 0;
        order.refundAmountInPaise = currentRefund + item.subtotalInPaise;
      }
    } else {
      item.status = newStatus;

      if (!item.tracking) {
        item.tracking = {};
      }

      if (input.courier) {
        item.tracking.courier = input.courier;
      }

      if (input.trackingNumber) {
        item.tracking.trackingNumber = input.trackingNumber;
      }

      if (input.trackingUrl !== undefined) {
        item.tracking.trackingUrl = input.trackingUrl;
      }

      if (input.estimatedDeliveryDate) {
        item.estimatedDeliveryDate = new Date(input.estimatedDeliveryDate);
      }

      if (newStatus === "SHIPPED") {
        item.tracking.shippedAt = now;
      } else if (newStatus === "DELIVERED") {
        item.tracking.deliveredAt = now;
      }
    }

    updatedItemsList.push({
      title: item.title,
      quantity: item.quantity,
      status: item.status,
    });
  }

  // Recalculate parent order status
  let totalActiveItems = 0;
  let deliveredCount = 0;
  let shippedCount = 0;
  let processingCount = 0;
  let confirmedCount = 0;

  for (const it of order.items) {
    if (it.status === "CANCELLED") {
      // Do not count in active items
    } else {
      totalActiveItems += 1;
      if (it.status === "DELIVERED") {
        deliveredCount += 1;
      } else if (it.status === "SHIPPED") {
        shippedCount += 1;
      } else if (it.status === "PROCESSING") {
        processingCount += 1;
      } else if (it.status === "CONFIRMED") {
        confirmedCount += 1;
      }
    }
  }

  if (totalActiveItems === 0) {
    order.orderStatus = "CANCELLED";
    order.cancelledAt = now;
    order.cancellationReason =
      input.cancellationReason || "All items cancelled by seller";
    order.cancelledBy = new mongoose.Types.ObjectId(userContext.id);

    if (order.paymentStatus === "PAID") {
      order.refundStatus = "PENDING";
    }
  } else if (deliveredCount === totalActiveItems) {
    order.orderStatus = "DELIVERED";
  } else if (shippedCount === totalActiveItems) {
    order.orderStatus = "SHIPPED";
  } else if (shippedCount > 0 || deliveredCount > 0) {
    order.orderStatus = "PARTIALLY_SHIPPED";
  } else if (processingCount > 0) {
    order.orderStatus = "PROCESSING";
  } else if (confirmedCount > 0) {
    order.orderStatus = "CONFIRMED";
  }

  await order.save();

  // Dispatch background email job to the buyer
  void sendOrderStatusUpdateNotification({
    order,
    updatedItems: updatedItemsList,
    newStatus,
    previousStatus: previousOrderStatus,
    statusMessage: input.message,
    sellerId: userContext.id,
    tracking: {
      courier: input.courier,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      estimatedDeliveryDate: input.estimatedDeliveryDate,
    },
  });

  logger.info(
    {
      orderId: order._id,
      orderNumber: order.orderNumber,
      sellerId: userContext.id,
      newStatus,
      parentOrderStatus: order.orderStatus,
      updatedItemsCount: updatedItemsList.length,
    },
    "Seller updated order status successfully; dispatched background notification",
  );

  const sellerFulfillmentStatus = computeSellerOrderStatus(
    targetItems,
    newStatus,
  );

  return {
    order,
    updatedItems: updatedItemsList,
    newStatus,
    orderStatus: sellerFulfillmentStatus,
    overallOrderStatus: order.orderStatus,
  };
};


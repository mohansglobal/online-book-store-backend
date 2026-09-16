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
import { env } from "../config/env.js";
import {
  verifyRazorpaySignature,
  createRazorpayGatewayOrder,
} from "./payment.service.js";
import {
  dispatchOrderConfirmationJob,
  dispatchSellerNewOrderAlertJob,
  dispatchOrderCancellationJob,
} from "../queues/email.queue.js";
import type {
  CreateOrderInput,
  OrderQueryInput,
  VerifyPaymentInput,
  InitiateRazorpayOrderInput,
  CancelOrderInput,
} from "../validation/order.schema.js";

const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000).toString();
  return `ORD-${timestamp}-${random}`;
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

    const priceInPaise = updatedListing.sellingPriceInPaise;
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

  // Create Order items
  const orderItems = acquiredItems.map((item) => {
    const bookCover = item.book.coverImage?.trim();
    const bookGalleryFirst = item.book.images?.[0]?.trim();
    const bookCoverImage = bookCover || bookGalleryFirst || "";

    return {
      bookListing: item.listing._id,
      book: item.book._id,
      seller: item.listing.seller,
      title: item.book.title,
      coverImage: bookCoverImage,
      priceInPaise: item.priceInPaise,
      quantity: item.quantity,
      subtotalInPaise: item.subtotalInPaise,
    };
  });

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
  coverImage?: string;
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
      .populate("buyer", "name email mobileNumber")
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
        const itemSellerId =
          item.seller && typeof item.seller === "object" && "_id" in item.seller
            ? (item.seller as { _id: unknown })._id?.toString()
            : item.seller?.toString();
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

    return {
      ...order,
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
    .populate("buyer", "name email mobileNumber")
    .populate("items.seller", "name email")
    .populate("items.book", "title titleBn coverImage images slug format")
    .populate("items.bookListing", "format condition edition mrpInPaise sellingPriceInPaise")
    .lean();

  if (!order) {
    throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND);
  }

  const isBuyer = order.buyer?._id?.toString() === userContext.id;
  const isSeller = order.items.some((item) => {
    const itemSellerId =
      item.seller && typeof item.seller === "object" && "_id" in item.seller
        ? (item.seller as { _id: unknown })._id?.toString()
        : item.seller?.toString();
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

  if (order.orderStatus === "SHIPPED") {
    throw new AppError(
      "Orders that have already been shipped cannot be cancelled",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  if (order.orderStatus === "DELIVERED") {
    throw new AppError(
      "Delivered orders cannot be cancelled",
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // Restore inventory stock atomically for each listing item
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      await BookListingModel.findByIdAndUpdate(item.bookListing, {
        $inc: { stock: item.quantity },
      });
    }
  }

  // Update order status & refund tracking
  order.orderStatus = "CANCELLED";
  order.cancelledAt = new Date();
  order.cancellationReason = input.reason || "Cancelled by user";
  order.cancelledBy = new mongoose.Types.ObjectId(userContext.id);

  if (order.paymentStatus === "PAID") {
    order.refundStatus = "PENDING";
  }

  await order.save();

  // Trigger background order cancellation email notification
  void sendOrderCancellationNotifications(order);

  logger.info(
    {
      orderId: order._id,
      orderNumber: order.orderNumber,
      cancelledBy: userContext.id,
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
    },
    "Order cancelled and inventory restored successfully",
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

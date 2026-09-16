import mongoose from "mongoose";

import { CartModel } from "../models/cart.model.js";
import {
  BookListingModel,
  type BookListingDocument,
} from "../models/book-listing.model.js";
import { type BookDocument } from "../models/book.model.js";
import { AddressModel, type AddressDocument } from "../models/address.model.js";
import {
  CHECKOUT_CONFIG,
  ACTIVE_PROMO_RULES,
} from "../constants/checkout.js";
import type { CheckoutSummaryQuery } from "../validation/checkout.schema.js";
import type {
  CheckoutItem,
  CheckoutPricing,
  CheckoutCoupon,
  PaymentMethod,
  CheckoutIssue,
  CheckoutSummary,
  UnavailableReason,
} from "../types/checkout.types.js";

type PopulatedListing = BookListingDocument & {
  _id: mongoose.Types.ObjectId;
  book?: BookDocument & {
    _id: mongoose.Types.ObjectId;
    authors?: Array<{ _id: mongoose.Types.ObjectId; name: string; nameBn?: string }>;
  };
  seller?: {
    _id: mongoose.Types.ObjectId;
    name?: string;
    email?: string;
  };
};

export const getCheckoutSummaryService = async (
  userId: string,
  query: CheckoutSummaryQuery,
): Promise<CheckoutSummary> => {
  const issues: CheckoutIssue[] = [];

  // 1. Resolve checkout source items (Direct Buy Now or Cart)
  let rawCheckoutItems: Array<{ bookListing: mongoose.Types.ObjectId; quantity: number }> = [];
  const isDirectCheckout = Boolean(query.bookListingId);

  if (isDirectCheckout) {
    const listingId = new mongoose.Types.ObjectId(query.bookListingId);
    const quantity = query.quantity ?? 1;

    rawCheckoutItems = [
      {
        bookListing: listingId,
        quantity,
      },
    ];
  } else {
    const cart = await CartModel.findOne({ user: userId }).lean();
    rawCheckoutItems = (cart?.items ?? []).map((item) => ({
      bookListing: item.bookListing as mongoose.Types.ObjectId,
      quantity: item.quantity,
    }));
  }

  // 2. Batch-fetch all BookListings in one single query to prevent N+1 queries
  const listingIds = rawCheckoutItems.map((item) => item.bookListing);

  const listings =
    listingIds.length > 0
      ? ((await BookListingModel.find({ _id: { $in: listingIds } })
          .populate({
            path: "book",
            select: "title titleBn coverImage images authors format status",
            populate: {
              path: "authors",
              select: "name nameBn",
            },
          })
          .populate("seller", "name email isActive")
          .lean()) as unknown as PopulatedListing[])
      : [];

  const listingMap = new Map<string, PopulatedListing>();
  for (const listing of listings) {
    listingMap.set(listing._id.toString(), listing);
  }

  // 3. Process checkout items and assess stock/availability
  const items: CheckoutItem[] = [];
  let mrpTotalInPaise = 0;
  let subtotalInPaise = 0;
  let totalQuantity = 0;
  let availableItemsCount = 0;

  for (const checkoutItem of rawCheckoutItems) {
    const listingIdStr = checkoutItem.bookListing.toString();
    const listing = listingMap.get(listingIdStr);

    let isAvailable = true;
    let unavailableReason: UnavailableReason | undefined = undefined;

    const isListingActive = listing?.isActive ?? false;
    const isBookActive = listing?.book?.status ? listing.book.status === "ACTIVE" : true;
    const isSellerActive = listing?.seller ? (listing.seller as { isActive?: boolean }).isActive !== false : true;

    if (!listing || !isListingActive || !isBookActive || !isSellerActive) {
      isAvailable = false;
      unavailableReason = "LISTING_INACTIVE";
      issues.push({
        code: "LISTING_INACTIVE",
        message: `Book listing ${listingIdStr} is currently inactive or unavailable`,
        bookListingId: listingIdStr,
      });
    } else if (listing.stock === 0) {
      isAvailable = false;
      unavailableReason = "OUT_OF_STOCK";
      issues.push({
        code: "OUT_OF_STOCK",
        message: `"${listing.book?.title || "Item"}" is out of stock`,
        bookListingId: listingIdStr,
      });
    } else if (listing.stock < checkoutItem.quantity) {
      isAvailable = false;
      unavailableReason = "INSUFFICIENT_STOCK";
      issues.push({
        code: "INSUFFICIENT_STOCK",
        message: `"${listing.book?.title || "Item"}" only has ${listing.stock} units in stock`,
        bookListingId: listingIdStr,
      });
    }

    const mrp = listing?.mrpInPaise ?? listing?.sellingPriceInPaise ?? 0;
    const sellingPrice = listing?.sellingPriceInPaise ?? 0;
    const itemSubtotal = sellingPrice * checkoutItem.quantity;
    const itemDiscount = Math.max(0, (mrp - sellingPrice) * checkoutItem.quantity);

    // Only available items accumulate towards order subtotal
    if (isAvailable) {
      mrpTotalInPaise += mrp * checkoutItem.quantity;
      subtotalInPaise += itemSubtotal;
      totalQuantity += checkoutItem.quantity;
      availableItemsCount += 1;
    }

    // Format author name(s)
    const rawAuthors = listing?.book?.authors as unknown as Array<{ name?: string }> | undefined;
    const authorString =
      Array.isArray(rawAuthors) && rawAuthors.length > 0
        ? rawAuthors
            .map((a) => a.name)
            .filter(Boolean)
            .join(", ") || "Various Authors"
        : "Various Authors";

    // Format cover image
    const bookCover = listing?.book?.coverImage?.trim();
    const bookGalleryFirst = listing?.book?.images?.[0]?.trim();
    const listingCustomFirst = listing?.listingImages?.[0]?.trim();
    const coverImage = bookCover || bookGalleryFirst || listingCustomFirst || "";

    items.push({
      bookListingId: listingIdStr,
      bookId: listing?.book?._id?.toString() ?? "",
      title: listing?.book?.title ?? "Unknown Title",
      titleBn: listing?.book?.titleBn ?? undefined,
      author: authorString,
      format: listing?.book?.format ?? "Paperback",
      coverImage,
      quantity: checkoutItem.quantity,
      stockAvailable: listing?.stock ?? 0,
      isAvailable,
      ...(unavailableReason ? { unavailableReason } : {}),
      mrpInPaise: mrp,
      sellingPriceInPaise: sellingPrice,
      subtotalInPaise: itemSubtotal,
      itemDiscountInPaise: itemDiscount,
      seller: {
        id: listing?.seller?._id?.toString() ?? "",
        name: listing?.seller?.name,
      },
    });
  }

  if (!isDirectCheckout && rawCheckoutItems.length === 0) {
    issues.push({
      code: "EMPTY_CART",
      message: "Your cart is currently empty",
    });
  }

  // 4. Resolve addresses strictly scoped by `_id` and `user: userId`
  let shippingAddress: AddressDocument | null = null;
  let billingAddress: AddressDocument | null = null;

  if (query.shippingAddressId) {
    shippingAddress = await AddressModel.findOne({
      _id: new mongoose.Types.ObjectId(query.shippingAddressId),
      user: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!shippingAddress) {
      issues.push({
        code: "ADDRESS_NOT_FOUND",
        message: "Specified shipping address was not found or does not belong to your account",
      });
    }
  } else {
    // Resolve default SHIPPING address, with fallback to default address
    shippingAddress = await AddressModel.findOne({
      user: new mongoose.Types.ObjectId(userId),
      addressType: "SHIPPING",
      isDefault: true,
    }).lean();

    if (!shippingAddress) {
      shippingAddress = await AddressModel.findOne({
        user: new mongoose.Types.ObjectId(userId),
        isDefault: true,
      }).lean();
    }
  }

  if (query.billingSameAsShipping) {
    billingAddress = shippingAddress;
  } else {
    if (query.billingAddressId) {
      billingAddress = await AddressModel.findOne({
        _id: new mongoose.Types.ObjectId(query.billingAddressId),
        user: new mongoose.Types.ObjectId(userId),
      }).lean();

      if (!billingAddress) {
        issues.push({
          code: "ADDRESS_NOT_FOUND",
          message: "Specified billing address was not found or does not belong to your account",
        });
      }
    } else {
      // Resolve default BILLING address, with fallback to default address
      billingAddress = await AddressModel.findOne({
        user: new mongoose.Types.ObjectId(userId),
        addressType: "BILLING",
        isDefault: true,
      }).lean();

      if (!billingAddress) {
        billingAddress = await AddressModel.findOne({
          user: new mongoose.Types.ObjectId(userId),
          isDefault: true,
        }).lean();
      }
    }
  }

  if (!shippingAddress) {
    issues.push({
      code: "SHIPPING_ADDRESS_REQUIRED",
      message: "A delivery shipping address is required to complete checkout",
    });
  }

  if (!billingAddress) {
    issues.push({
      code: "BILLING_ADDRESS_REQUIRED",
      message: "A billing address is required to complete checkout",
    });
  }

  // 5. Authoritative Delivery Charge calculation
  let deliveryChargeInPaise = 0;
  if (availableItemsCount > 0) {
    if (subtotalInPaise >= CHECKOUT_CONFIG.FREE_DELIVERY_THRESHOLD_IN_PAISE) {
      deliveryChargeInPaise = 0;
    } else {
      deliveryChargeInPaise = CHECKOUT_CONFIG.STANDARD_DELIVERY_CHARGE_IN_PAISE;
    }
  }

  // 6. Authoritative Coupon calculation (Safe & Non-blocking)
  let coupon: CheckoutCoupon | null = null;
  let couponDiscountInPaise = 0;

  if (query.couponCode) {
    const cleanCode = query.couponCode.trim().toUpperCase();
    const promoRule = ACTIVE_PROMO_RULES[cleanCode];

    if (!promoRule) {
      coupon = {
        code: cleanCode,
        isValid: false,
        discountInPaise: 0,
        message: "Invalid or expired promo coupon code",
      };
    } else if (subtotalInPaise < promoRule.minSubtotalInPaise) {
      const minInRupees = promoRule.minSubtotalInPaise / 100;
      coupon = {
        code: cleanCode,
        isValid: false,
        discountInPaise: 0,
        message: `Coupon ${cleanCode} requires a minimum order subtotal of ₹${minInRupees}`,
      };
    } else {
      let calculatedDiscount = 0;
      if (promoRule.discountType === "PERCENTAGE") {
        const raw = Math.round((subtotalInPaise * promoRule.discountValue) / 100);
        calculatedDiscount = promoRule.maxDiscountInPaise
          ? Math.min(raw, promoRule.maxDiscountInPaise)
          : raw;
      } else {
        calculatedDiscount = promoRule.discountValue;
      }

      // Discount cannot exceed subtotal
      calculatedDiscount = Math.min(calculatedDiscount, subtotalInPaise);

      couponDiscountInPaise = calculatedDiscount;
      coupon = {
        code: cleanCode,
        isValid: true,
        discountInPaise: calculatedDiscount,
        message: promoRule.description,
      };
    }
  }

  // 7. Authoritative Totals & Savings (all in Paise)
  const itemDiscountInPaise = Math.max(0, mrpTotalInPaise - subtotalInPaise);
  const totalSavingsInPaise = itemDiscountInPaise + couponDiscountInPaise;
  const totalAmountInPaise = Math.max(
    0,
    subtotalInPaise + deliveryChargeInPaise - couponDiscountInPaise,
  );

  const pricing: CheckoutPricing = {
    itemsCount: availableItemsCount,
    totalQuantity,
    mrpTotalInPaise,
    subtotalInPaise,
    itemDiscountInPaise,
    couponDiscountInPaise,
    deliveryChargeInPaise,
    totalSavingsInPaise,
    totalAmountInPaise,
    currency: CHECKOUT_CONFIG.CURRENCY,
  };

  // 8. Dynamic Payment Methods Evaluation
  const isCodAllowed =
    availableItemsCount > 0 &&
    totalAmountInPaise > 0 &&
    totalAmountInPaise <= CHECKOUT_CONFIG.COD_MAX_AMOUNT_IN_PAISE;

  const paymentMethods: PaymentMethod[] = [
    {
      id: "ONLINE_PAY",
      label: "Online Pay",
      isAvailable: availableItemsCount > 0 && totalAmountInPaise > 0,
      ...(availableItemsCount === 0 || totalAmountInPaise === 0
        ? { unavailableReason: "Cart has no payable items" }
        : {}),
    },
    {
      id: "CASH_ON_DELIVERY",
      label: "Cash On Delivery",
      isAvailable: isCodAllowed,
      ...(!isCodAllowed
        ? {
            unavailableReason:
              totalAmountInPaise > CHECKOUT_CONFIG.COD_MAX_AMOUNT_IN_PAISE
                ? `COD is not available for orders exceeding ₹${CHECKOUT_CONFIG.COD_MAX_AMOUNT_IN_PAISE / 100}`
                : "Cart has no payable items",
          }
        : {}),
    },
  ];

  // 9. Checkout Readiness
  const canCheckout =
    issues.length === 0 &&
    availableItemsCount > 0 &&
    shippingAddress !== null &&
    billingAddress !== null;

  return {
    items,
    pricing,
    coupon,
    addresses: {
      shippingAddress,
      billingAddress,
      billingSameAsShipping: query.billingSameAsShipping,
    },
    paymentMethods,
    delivery: {
      estimatedMinDays: CHECKOUT_CONFIG.ESTIMATED_DELIVERY_MIN_DAYS,
      estimatedMaxDays: CHECKOUT_CONFIG.ESTIMATED_DELIVERY_MAX_DAYS,
    },
    checkoutState: {
      canCheckout,
      issues,
    },
  };
};

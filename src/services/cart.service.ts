import mongoose from "mongoose";

import { CartModel } from "../models/cart.model.js";
import { BookListingModel, type BookListingDocument } from "../models/book-listing.model.js";
import { BookModel, type BookDocument } from "../models/book.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import { logger } from "../utils/logger.js";
import type {
  AddToCartInput,
  SyncCartInput,
  UpdateCartItemInput,
} from "../validation/cart.schema.js";

export const getCartService = async (userId: string) => {
  let cart: any = await CartModel.findOne({ user: userId })
    .populate({
      path: "items.bookListing",
      populate: [
        {
          path: "book",
          select: "title titleBn slug isbn coverImage images publisher authors",
          populate: [
            { path: "publisher", select: "name nameBn slug" },
            { path: "authors", select: "name nameBn slug" },
          ],
        },
        {
          path: "seller",
          select: "name email",
        },
      ],
    })
    .lean();

  if (!cart) {
    const created = await CartModel.create({
      user: new mongoose.Types.ObjectId(userId),
      items: [],
    });
    cart = created.toObject();
  }

  // Calculate totals and format items
  let totalAmountInPaise = 0;
  let totalItemsCount = 0;

  const rawItems = (cart && cart.items) ? cart.items : [];
  const formattedItems = rawItems.map((item: any) => {
    const listing = item.bookListing as unknown as (BookListingDocument & {
      _id: mongoose.Types.ObjectId;
      book?: BookDocument & { _id: mongoose.Types.ObjectId };
      seller?: { _id: mongoose.Types.ObjectId; name: string; email: string };
    }) | null;

    if (!listing || !listing._id) {
      return {
        bookListingId: item.bookListing,
        isAvailable: false,
        quantity: item.quantity,
        priceInPaise: 0,
        subtotalInPaise: 0,
      };
    }

    const priceInPaise = listing.sellingPriceInPaise || 0;
    const subtotalInPaise = priceInPaise * item.quantity;
    const isAvailable = listing.isActive && listing.stock >= item.quantity;

    if (isAvailable) {
      totalAmountInPaise += subtotalInPaise;
      totalItemsCount += item.quantity;
    }

    const customImages = listing.listingImages ?? [];
    const fallbackImage =
      customImages[0] ?? listing.book?.coverImage ?? listing.book?.images?.[0] ?? "";

    const priceInRupees = Math.round(priceInPaise / 100);
    const mrpInPaise = listing.mrpInPaise ?? priceInPaise;
    const mrpInRupees = Math.round(mrpInPaise / 100);
    const subtotalInRupees = Math.round(subtotalInPaise / 100);

    return {
      bookListingId: listing._id,
      quantity: item.quantity,
      priceInPaise,
      priceInRupees,
      mrpInPaise,
      mrpInRupees,
      subtotalInPaise,
      subtotalInRupees,
      stockAvailable: listing.stock,
      isAvailable,
      book: {
        _id: listing.book?._id,
        title: listing.book?.title,
        titleBn: listing.book?.titleBn,
        slug: listing.book?.slug,
        isbn: listing.book?.isbn,
        coverImage: fallbackImage,
        images: listing.book?.images ?? [],
        publisher: listing.book?.publisher,
        authors: listing.book?.authors,
      },
      seller: listing.seller,
    };
  });

  return {
    _id: cart?._id,
    user: userId,
    items: formattedItems,
    totalItemsCount,
    totalAmountInPaise,
    totalAmountInRupees: Math.round(totalAmountInPaise / 100),
  };
};

export const addToCartService = async (
  userId: string,
  input: AddToCartInput,
) => {
  const listing = await BookListingModel.findById(input.bookListing).lean();
  if (!listing) {
    throw new AppError("Book listing not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!listing.isActive) {
    throw new AppError("This book listing is currently inactive", HTTP_STATUS.BAD_REQUEST);
  }

  if (listing.stock < input.quantity) {
    throw new AppError(
      `Insufficient stock. Only ${listing.stock} units available.`,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  let cart = await CartModel.findOne({ user: userId });
  if (!cart) {
    cart = new CartModel({
      user: new mongoose.Types.ObjectId(userId),
      items: [],
    });
  }

  const existingItemIndex = cart.items.findIndex(
    (item) => item.bookListing.toString() === input.bookListing,
  );

  if (existingItemIndex > -1) {
    const newQuantity = cart.items[existingItemIndex].quantity + input.quantity;
    if (listing.stock < newQuantity) {
      throw new AppError(
        `Cannot add more. Total in cart would exceed available stock (${listing.stock}).`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    cart.items[existingItemIndex].quantity = newQuantity;
  } else {
    cart.items.push({
      bookListing: new mongoose.Types.ObjectId(input.bookListing),
      quantity: input.quantity,
    });
  }

  await cart.save();
  logger.info({ userId, bookListingId: input.bookListing, quantity: input.quantity }, "Item added to cart");

  return getCartService(userId);
};

export const syncCartService = async (
  userId: string,
  input: SyncCartInput,
) => {
  const itemsToSync = input.items || [];
  if (itemsToSync.length === 0) {
    return getCartService(userId);
  }

  let cart = await CartModel.findOne({ user: userId });
  if (!cart) {
    cart = new CartModel({
      user: new mongoose.Types.ObjectId(userId),
      items: [],
    });
  }

  // Batch query all referenced active listings in 1 database roundtrip
  const listingIds = Array.from(new Set(itemsToSync.map((i) => i.bookListing)));
  const listings = await BookListingModel.find({
    _id: { $in: listingIds },
    isActive: true,
  }).lean();

  const listingMap = new Map(listings.map((l) => [l._id.toString(), l]));

  for (const incoming of itemsToSync) {
    const listing = listingMap.get(incoming.bookListing);
    // If listing doesn't exist, is inactive, or has 0 stock, skip it safely
    if (!listing || listing.stock <= 0) {
      continue;
    }

    const existingIndex = cart.items.findIndex(
      (item) => item.bookListing.toString() === incoming.bookListing,
    );

    if (existingIndex > -1) {
      const combinedQuantity = cart.items[existingIndex].quantity + incoming.quantity;
      cart.items[existingIndex].quantity = Math.min(combinedQuantity, listing.stock);
    } else {
      const clampedQuantity = Math.min(incoming.quantity, listing.stock);
      cart.items.push({
        bookListing: new mongoose.Types.ObjectId(incoming.bookListing),
        quantity: clampedQuantity,
      });
    }
  }

  await cart.save();
  logger.info({ userId, itemsCount: itemsToSync.length }, "Cart synchronized successfully");

  return getCartService(userId);
};

export const updateCartItemService = async (
  userId: string,
  bookListingId: string,
  input: UpdateCartItemInput,
) => {
  const cart = await CartModel.findOne({ user: userId });
  if (!cart) {
    throw new AppError("Cart not found", HTTP_STATUS.NOT_FOUND);
  }

  const itemIndex = cart.items.findIndex(
    (item) => item.bookListing.toString() === bookListingId,
  );

  if (itemIndex === -1) {
    throw new AppError("Item not found in your cart", HTTP_STATUS.NOT_FOUND);
  }

  const listing = await BookListingModel.findById(bookListingId).lean();
  if (!listing || !listing.isActive) {
    throw new AppError("This book listing is no longer available", HTTP_STATUS.BAD_REQUEST);
  }

  if (listing.stock < input.quantity) {
    throw new AppError(
      `Insufficient stock. Only ${listing.stock} units available.`,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  cart.items[itemIndex].quantity = input.quantity;
  await cart.save();

  return getCartService(userId);
};

export const removeFromCartService = async (
  userId: string,
  bookListingId: string,
) => {
  const cart = await CartModel.findOne({ user: userId });
  if (!cart) {
    throw new AppError("Cart not found", HTTP_STATUS.NOT_FOUND);
  }

  cart.items = cart.items.filter(
    (item) => item.bookListing.toString() !== bookListingId,
  ) as unknown as typeof cart.items;

  await cart.save();
  return getCartService(userId);
};

export const clearCartService = async (userId: string) => {
  const cart = await CartModel.findOne({ user: userId });
  if (cart) {
    cart.items = [] as unknown as typeof cart.items;
    await cart.save();
  }
  return { message: "Cart cleared successfully" };
};

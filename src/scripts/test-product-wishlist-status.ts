import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { UserModel } from "../models/user.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CategoryModel } from "../models/category.model.js";
import { BookModel } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import { WishlistModel } from "../models/wishlist.model.js";
import {
  addToWishlistService,
  getWishlistBookIdsService,
  checkBookInWishlistService,
  removeFromWishlistService,
} from "../services/wishlist.service.js";
import { getBookByIdOrSlugService } from "../services/book.service.js";
import { getBookListingByIdService } from "../services/book-listing.service.js";

const run = async () => {
  await connectDB();
  console.log("Database connected successfully");

  const testSuffix = Date.now().toString(36);

  // 1. Create a test buyer
  const buyer = await UserModel.create({
    name: `Buyer ${testSuffix}`,
    email: `buyer_${testSuffix}@example.com`,
    password: "Password123!",
    role: "BUYER",
    isActive: true,
  });

  // 2. Create a test seller
  const seller = await UserModel.create({
    name: `Seller ${testSuffix}`,
    email: `seller_${testSuffix}@example.com`,
    password: "Password123!",
    role: "SELLER",
    isActive: true,
  });

  const author = await AuthorModel.create({
    name: `Author ${testSuffix}`,
    slug: `author-${testSuffix}`,
  });

  const publisher = await PublisherModel.create({
    name: `Publisher ${testSuffix}`,
    slug: `publisher-${testSuffix}`,
  });

  const category = await CategoryModel.create({
    name: `Category ${testSuffix}`,
    slug: `category-${testSuffix}`,
  });

  // 3. Create test books
  const book1 = await BookModel.create({
    title: `Wishlist Book 1 ${testSuffix}`,
    slug: `wishlist-book-1-${testSuffix}`,
    isbn: `9780${Date.now().toString().slice(-9)}`,
    description: "Test description for book 1",
    authors: [author._id],
    publisher: publisher._id,
    categories: [category._id],
    status: "ACTIVE",
    createdBy: seller._id,
  });

  const book2 = await BookModel.create({
    title: `Wishlist Book 2 ${testSuffix}`,
    slug: `wishlist-book-2-${testSuffix}`,
    isbn: `9781${Date.now().toString().slice(-9)}`,
    description: "Test description for book 2",
    authors: [author._id],
    publisher: publisher._id,
    categories: [category._id],
    status: "ACTIVE",
    createdBy: seller._id,
  });

  // 4. Create listing for book 1
  const listing1 = await BookListingModel.create({
    book: book1._id,
    seller: seller._id,
    sellingPriceInPaise: 29900,
    mrpInPaise: 39900,
    stock: 10,
    isActive: true,
  });

  try {
    const buyerId = buyer._id.toString();
    const book1Id = book1._id.toString();
    const book2Id = book2._id.toString();
    const listing1Id = listing1._id.toString();

    console.log("\n[TEST 1] Initial State: No items wishlisted");
    const initialIds = await getWishlistBookIdsService(buyerId);
    console.log("Initial wishlist IDs:", initialIds);
    if (initialIds.length !== 0) throw new Error("Expected initial wishlist to be empty");

    const check1Before = await checkBookInWishlistService(buyerId, book1Id);
    const checkListing1Before = await checkBookInWishlistService(buyerId, listing1Id);
    console.log("Book 1 check before wishlist:", check1Before);
    console.log("Listing 1 check before wishlist:", checkListing1Before);
    if (check1Before !== false || checkListing1Before !== false) {
      throw new Error("Expected book 1 and listing 1 to NOT be wishlisted");
    }

    const book1DetailBefore = await getBookByIdOrSlugService(book1Id, buyerId);
    console.log("Book 1 getBookByIdOrSlugService isWishlisted:", book1DetailBefore.isWishlisted);
    if (book1DetailBefore.isWishlisted !== false) {
      throw new Error("Expected book1DetailBefore.isWishlisted to be false");
    }

    const listing1DetailBefore = await getBookListingByIdService(listing1Id, buyerId);
    console.log("Listing 1 getBookListingByIdService isWishlisted:", listing1DetailBefore.isWishlisted);
    if (listing1DetailBefore.isWishlisted !== false) {
      throw new Error("Expected listing1DetailBefore.isWishlisted to be false");
    }

    console.log("\n[TEST 2] Add Book 1 to Wishlist");
    await addToWishlistService(buyerId, { bookId: book1Id });

    const idsAfterAdd = await getWishlistBookIdsService(buyerId);
    console.log("Wishlist IDs after adding Book 1:", idsAfterAdd);
    if (!idsAfterAdd.includes(book1Id)) {
      throw new Error("Expected book 1 ID to be in wishlist IDs");
    }

    const check1After = await checkBookInWishlistService(buyerId, book1Id);
    const checkListing1After = await checkBookInWishlistService(buyerId, listing1Id);
    const check2After = await checkBookInWishlistService(buyerId, book2Id);
    console.log("Book 1 check after add:", check1After);
    console.log("Listing 1 check after add (resolves to book 1):", checkListing1After);
    console.log("Book 2 check after add (not wishlisted):", check2After);

    if (check1After !== true || checkListing1After !== true || check2After !== false) {
      throw new Error("checkBookInWishlistService returned unexpected result");
    }

    const book1DetailAfter = await getBookByIdOrSlugService(book1Id, buyerId);
    console.log("Book 1 detail after add isWishlisted:", book1DetailAfter.isWishlisted);
    if (book1DetailAfter.isWishlisted !== true) {
      throw new Error("Expected book1DetailAfter.isWishlisted to be true");
    }

    const listing1DetailAfter = await getBookListingByIdService(listing1Id, buyerId);
    console.log("Listing 1 detail after add isWishlisted:", listing1DetailAfter.isWishlisted);
    if (listing1DetailAfter.isWishlisted !== true) {
      throw new Error("Expected listing1DetailAfter.isWishlisted to be true");
    }

    // Check with unauthenticated call (no userId)
    const book1Unauth = await getBookByIdOrSlugService(book1Id);
    console.log("Book 1 unauthenticated detail isWishlisted:", book1Unauth.isWishlisted);
    if (book1Unauth.isWishlisted !== false) {
      throw new Error("Expected unauthenticated request to have isWishlisted: false");
    }

    console.log("\n[TEST 3] Remove Book 1 from Wishlist");
    await removeFromWishlistService(buyerId, book1Id);

    const idsAfterRemove = await getWishlistBookIdsService(buyerId);
    console.log("Wishlist IDs after removal:", idsAfterRemove);
    if (idsAfterRemove.includes(book1Id)) {
      throw new Error("Expected book 1 ID to be removed");
    }

    const book1DetailAfterRemove = await getBookByIdOrSlugService(book1Id, buyerId);
    if (book1DetailAfterRemove.isWishlisted !== false) {
      throw new Error("Expected book1DetailAfterRemove.isWishlisted to be false");
    }

    console.log("\n>>> ALL PRODUCT WISHLIST STATUS TESTS PASSED! <<<");
  } finally {
    // Cleanup
    await WishlistModel.deleteMany({ user: buyer._id });
    await BookListingModel.deleteMany({ _id: listing1._id });
    await BookModel.deleteMany({ _id: { $in: [book1._id, book2._id] } });
    await AuthorModel.deleteMany({ _id: author._id });
    await PublisherModel.deleteMany({ _id: publisher._id });
    await CategoryModel.deleteMany({ _id: category._id });
    await UserModel.deleteMany({ _id: { $in: [buyer._id, seller._id] } });
    await mongoose.disconnect();
    console.log("Cleaned up test data and disconnected.");
  }
};

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

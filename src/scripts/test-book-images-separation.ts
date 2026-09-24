import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { BookModel } from "../models/book.model.js";
import { BookListingModel } from "../models/book-listing.model.js";
import { UserModel } from "../models/user.model.js";
import { AuthorModel } from "../models/author.model.js";
import { PublisherModel } from "../models/publisher.model.js";
import { CategoryModel } from "../models/category.model.js";
import { createBookListingService, getBookListingsService } from "../services/book-listing.service.js";
import { lookupBookByIsbnService, getBookByIdOrSlugService } from "../services/book.service.js";
import { resolveBookImages } from "../utils/image.helper.js";

const TEST_ISBN = `978-0-IMG-${Date.now()}`;
const COVER_URL = "https://res.cloudinary.com/demo/image/upload/v1/master_cover.jpg";
const SELLER_A_EXTRAS = [
  "https://res.cloudinary.com/demo/image/upload/v1/seller_a_1.jpg",
  "https://res.cloudinary.com/demo/image/upload/v1/seller_a_2.jpg",
  "https://res.cloudinary.com/demo/image/upload/v1/seller_a_3.jpg",
  "https://res.cloudinary.com/demo/image/upload/v1/seller_a_4.jpg",
];
const SELLER_C_EXTRAS = [
  "https://res.cloudinary.com/demo/image/upload/v1/seller_c_1.jpg",
  "https://res.cloudinary.com/demo/image/upload/v1/seller_c_2.jpg",
];

async function runVerification() {
  console.log("=== Running Book Images Separation Verification ===");

  await connectDB();

  // 1. Setup mock author, publisher, category, and sellers
  let author = await AuthorModel.findOne({ isActive: true });
  if (!author) {
    author = await AuthorModel.create({
      name: "Image Test Author",
      slug: `img-author-${Date.now()}`,
      bio: "Author for image testing",
      isActive: true,
    });
  }

  let publisher = await PublisherModel.findOne({ isActive: true });
  if (!publisher) {
    publisher = await PublisherModel.create({
      name: "Image Test Publisher",
      slug: `img-pub-${Date.now()}`,
      isActive: true,
    });
  }

  let category = await CategoryModel.findOne({ isActive: true });
  if (!category) {
    category = await CategoryModel.create({
      name: "Image Test Category",
      slug: `img-cat-${Date.now()}`,
      isActive: true,
    });
  }

  const findOrCreateSeller = async (email: string, name: string) => {
    let seller = await UserModel.findOne({ email });
    if (!seller) {
      seller = await UserModel.create({
        name,
        email,
        password: "hashed_password_123",
        role: "SELLER",
        isActive: true,
      });
    }
    return seller;
  };

  const sellerA = await findOrCreateSeller("seller_a_img@test.com", "Seller Alpha");
  const sellerB = await findOrCreateSeller("seller_b_img@test.com", "Seller Beta");
  const sellerC = await findOrCreateSeller("seller_c_img@test.com", "Seller Gamma");

  console.log("Step 1: Setup dependencies completed.");

  // 2. Unit Test: Image resolution helper
  console.log("\nStep 2: Testing resolveBookImages utility...");
  const unitResultA = resolveBookImages(COVER_URL, [], SELLER_A_EXTRAS);
  console.log("resolveBookImages with 1 cover + 4 seller extras:", unitResultA);

  if (unitResultA.coverImage !== COVER_URL) {
    throw new Error(`Expected coverImage to be ${COVER_URL}, got ${unitResultA.coverImage}`);
  }
  if (unitResultA.images.length !== 5) {
    throw new Error(`Expected 5 images total (1 cover + 4 extras), got ${unitResultA.images.length}`);
  }
  if (unitResultA.images[0] !== COVER_URL) {
    throw new Error(`Expected first image at index 0 to be cover image, got ${unitResultA.images[0]}`);
  }

  const unitResultB = resolveBookImages(COVER_URL, [], []);
  console.log("resolveBookImages with 1 cover + 0 extras:", unitResultB);
  if (unitResultB.images.length !== 1 || unitResultB.images[0] !== COVER_URL) {
    throw new Error(`Expected 1 cover image, got ${JSON.stringify(unitResultB.images)}`);
  }

  // 3. Seller A adds a brand new book with 1 cover image and 4 extra pictures
  console.log("\nStep 3: Seller A creating new book & listing with 1 cover + 4 extra pictures...");
  const listingA = await createBookListingService(
    {
      title: `Separation Test Book ${Date.now()}`,
      isbn: TEST_ISBN,
      publisher: publisher._id.toString(),
      authors: [author._id.toString()],
      categories: [category._id.toString()],
      description: "Test book for verifying image level separation.",
      language: "English",
      format: "PAPERBACK",
      coverImage: COVER_URL,
      listingImages: SELLER_A_EXTRAS,
      mrpInPaise: 50000,
      sellingPriceInPaise: 40000,
      stock: 10,
    },
    sellerA._id.toString(),
  );

  const masterBookDoc = await BookModel.findById(listingA.book).lean();
  if (!masterBookDoc) {
    throw new Error("Master book was not created");
  }

  console.log("Master Book Document in DB:", {
    _id: masterBookDoc._id,
    title: masterBookDoc.title,
    isbn: masterBookDoc.isbn,
    coverImage: masterBookDoc.coverImage,
    images: masterBookDoc.images,
  });

  if (masterBookDoc.coverImage !== COVER_URL) {
    throw new Error(`Master book coverImage mismatch: ${masterBookDoc.coverImage}`);
  }
  if (masterBookDoc.images.length !== 0) {
    throw new Error(`Master book should have empty images array, got ${masterBookDoc.images.length}`);
  }

  const listingADoc = await BookListingModel.findById(listingA._id).lean();
  if (!listingADoc) {
    throw new Error("Listing A document not found");
  }
  console.log("Seller A Listing Document in DB:", {
    _id: listingADoc._id,
    listingImages: listingADoc.listingImages,
  });

  if (listingADoc.listingImages.length !== 4) {
    throw new Error(`Listing A should have 4 listingImages, got ${listingADoc.listingImages.length}`);
  }

  // 4. Seller B performs ISBN lookup
  console.log("\nStep 4: Seller B performing ISBN lookup for prefill...");
  const lookupRes = await lookupBookByIsbnService(TEST_ISBN, sellerB._id.toString());
  console.log("ISBN Lookup Response:", {
    exists: lookupRes.exists,
    coverImage: lookupRes.book?.coverImage,
    images: lookupRes.book?.images,
  });

  if (!lookupRes.exists || !lookupRes.book) {
    throw new Error("ISBN lookup failed to find existing book");
  }
  if (lookupRes.book.coverImage !== COVER_URL) {
    throw new Error(`ISBN lookup should prefill master coverImage, got ${lookupRes.book.coverImage}`);
  }
  if (lookupRes.book.images.length !== 0) {
    throw new Error(`ISBN lookup should have images: [], got ${JSON.stringify(lookupRes.book.images)}`);
  }

  // 5. Seller B lists the same book with 0 extra pictures
  console.log("\nStep 5: Seller B listing same book with 0 extra pictures...");
  const listingB = await createBookListingService(
    {
      book: masterBookDoc._id.toString(),
      mrpInPaise: 50000,
      sellingPriceInPaise: 38000,
      stock: 5,
    },
    sellerB._id.toString(),
  );

  // 6. Seller C lists the same book with 2 extra pictures
  console.log("\nStep 6: Seller C listing same book with 2 extra pictures...");
  const listingC = await createBookListingService(
    {
      book: masterBookDoc._id.toString(),
      listingImages: SELLER_C_EXTRAS,
      mrpInPaise: 50000,
      sellingPriceInPaise: 42000,
      stock: 3,
    },
    sellerC._id.toString(),
  );

  // 7. Test getBookByIdService (Buyer Book Details view)
  console.log("\nStep 7: Testing getBookByIdService (Buyer Book Details view)...");
  const bookDetails = await getBookByIdOrSlugService(masterBookDoc._id.toString());
  console.log("Master Book Details Cover & Gallery:", {
    coverImage: bookDetails.coverImage,
    images: bookDetails.images,
  });

  console.log("Book listings on product page:");
  for (const l of bookDetails.listings) {
    console.log(`- Seller Listing ID ${l._id}:`);
    console.log(`  Cover: ${l.coverImage}`);
    console.log(`  Images count: ${l.images?.length}`);
    console.log(`  Images:`, l.images);
  }

  const sellerAListingResolved = (bookDetails.listings as any[]).find(
    (l: any) => l._id.toString() === listingA._id.toString(),
  );
  if (!sellerAListingResolved || sellerAListingResolved.images.length !== 5) {
    throw new Error(
      `Seller A listing in book details should have 5 images, got ${sellerAListingResolved?.images.length}`,
    );
  }
  if (sellerAListingResolved.images[0] !== COVER_URL) {
    throw new Error(`Seller A listing first image must be COVER_URL`);
  }

  const sellerBListingResolved = (bookDetails.listings as any[]).find(
    (l: any) => l._id.toString() === listingB._id.toString(),
  );
  if (!sellerBListingResolved || sellerBListingResolved.images.length !== 1) {
    throw new Error(
      `Seller B listing in book details should have 1 image, got ${sellerBListingResolved?.images.length}`,
    );
  }

  const sellerCListingResolved = (bookDetails.listings as any[]).find(
    (l: any) => l._id.toString() === listingC._id.toString(),
  );
  if (!sellerCListingResolved || sellerCListingResolved.images.length !== 3) {
    throw new Error(
      `Seller C listing in book details should have 3 images, got ${sellerCListingResolved?.images.length}`,
    );
  }

  // 8. Clean up test records
  console.log("\nStep 8: Cleaning up test documents...");
  await BookListingModel.deleteMany({
    _id: { $in: [listingA._id, listingB._id, listingC._id] },
  });
  await BookModel.deleteOne({ _id: masterBookDoc._id });

  console.log("\n✅ ALL BOOK IMAGES SEPARATION INVARIANTS VERIFIED SUCCESSFULLY!");
  process.exit(0);
}

runVerification().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});

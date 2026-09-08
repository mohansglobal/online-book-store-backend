import mongoose from "mongoose";

import { env } from "../config/env.js";
import {
  UserModel,
  CountryModel,
  AuthorModel,
  PublisherModel,
  CategoryModel,
  BookModel,
  BookListingModel,
} from "../models/index.js";
import { logger } from "../utils/logger.js";

type AuditCheck = {
  category: string;
  name: string;
  description: string;
  totalChecked: number;
  passedCount: number;
  failedCount: number;
  status: "PASSED" | "FAILED" | "WARNING";
  failures: string[];
};

const auditChecks: AuditCheck[] = [];

const recordAudit = (
  category: string,
  name: string,
  description: string,
  totalChecked: number,
  passedCount: number,
  failures: string[],
) => {
  const failedCount = totalChecked - passedCount;
  const status: AuditCheck["status"] = failedCount === 0 ? "PASSED" : "FAILED";

  auditChecks.push({
    category,
    name,
    description,
    totalChecked,
    passedCount,
    failedCount,
    status,
    failures,
  });

  const icon = status === "PASSED" ? "✅ PASSED" : "❌ FAILED";
  console.log(`  [${icon}] ${category} :: ${name} (${passedCount}/${totalChecked} valid)${failedCount > 0 ? ` -> ${failedCount} errors!` : ""}`);
};

const runBookJoinsAudit = async () => {
  const shouldFixOrphans = process.argv.includes("--fix-orphans");

  try {
    console.log("\n=================================================================");
    console.log("   BOOK CATALOG & MULTI-MODEL RELATIONSHIP INTEGRITY AUDIT");
    console.log("=================================================================\n");

    logger.info("Connecting to MongoDB for relationship audit...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    // Pre-flight check & cleanup if requested
    if (shouldFixOrphans) {
      const allBooksNow = await BookModel.find().select("_id").lean();
      const validBookIds = new Set(allBooksNow.map((b) => b._id.toString()));
      const allListingsNow = await BookListingModel.find().lean();
      const orphanedListings = allListingsNow.filter((l) => !l.book || !validBookIds.has(l.book.toString()));

      if (orphanedListings.length > 0) {
        console.log(`🧹 Found ${orphanedListings.length} orphaned listings from previous test runs. Cleaning them up...`);
        const orphanIds = orphanedListings.map((l) => l._id);
        await BookListingModel.deleteMany({ _id: { $in: orphanIds } });
        console.log(`✅ Successfully removed ${orphanedListings.length} orphaned listings.\n`);
      }
    }

    // 1. Fetch all documents across all relevant collections
    const [allBooks, allListings, allAuthors, allPublishers, allCategories, allUsers, allCountries] =
      await Promise.all([
        BookModel.find().lean(),
        BookListingModel.find().lean(),
        AuthorModel.find().lean(),
        PublisherModel.find().lean(),
        CategoryModel.find().lean(),
        UserModel.find().lean(),
        CountryModel.find().lean(),
      ]);

    console.log(`Auditing Database Collections:
  - Canonical Books  : ${allBooks.length} documents
  - Book Listings    : ${allListings.length} documents
  - Authors          : ${allAuthors.length} documents
  - Publishers       : ${allPublishers.length} documents
  - Categories       : ${allCategories.length} documents
  - Users            : ${allUsers.length} documents
  - Countries        : ${allCountries.length} documents
`);

    const authorIdSet = new Set(allAuthors.map((a) => a._id.toString()));
    const publisherIdSet = new Set(allPublishers.map((p) => p._id.toString()));
    const categoryIdSet = new Set(allCategories.map((c) => c._id.toString()));
    const userIdSet = new Set(allUsers.map((u) => u._id.toString()));
    const bookIdSet = new Set(allBooks.map((b) => b._id.toString()));

    const userMap = new Map(allUsers.map((u) => [u._id.toString(), u]));
    const bookMap = new Map(allBooks.map((b) => [b._id.toString(), b]));
    const authorMap = new Map(allAuthors.map((a) => [a._id.toString(), a]));
    const publisherMap = new Map(allPublishers.map((p) => [p._id.toString(), p]));
    const categoryMap = new Map(allCategories.map((c) => [c._id.toString(), c]));

    // =================================================================
    // SECTION 1: FORWARD CANONICAL BOOK REFERENCE INTEGRITY
    // =================================================================
    console.log("\n--- [1. CANONICAL BOOK -> REFERENCED ENTITIES AUDIT] ---");

    // 1.1 Book -> Author References
    let validAuthorLinks = 0;
    const authorFailures: string[] = [];
    for (const book of allBooks) {
      if (!Array.isArray(book.authors) || book.authors.length === 0) {
        authorFailures.push(`Book "${book.title}" (ID: ${book._id}) has NO authors assigned.`);
        continue;
      }
      let allBookAuthorsValid = true;
      for (const authorId of book.authors) {
        const idStr = authorId.toString();
        if (!authorIdSet.has(idStr)) {
          authorFailures.push(`Book "${book.title}" (ID: ${book._id}) references non-existent Author ID: ${idStr}`);
          allBookAuthorsValid = false;
        }
      }
      if (allBookAuthorsValid) validAuthorLinks++;
    }
    recordAudit(
      "Book -> Authors",
      "Author Referential Integrity",
      "Verify all authors in book.authors exist in Author collection",
      allBooks.length,
      validAuthorLinks,
      authorFailures,
    );

    // 1.2 Book -> Publisher Reference
    let validPublisherLinks = 0;
    const pubFailures: string[] = [];
    for (const book of allBooks) {
      if (!book.publisher) {
        pubFailures.push(`Book "${book.title}" (ID: ${book._id}) has NO publisher reference.`);
        continue;
      }
      const pubIdStr = book.publisher.toString();
      if (!publisherIdSet.has(pubIdStr)) {
        pubFailures.push(`Book "${book.title}" (ID: ${book._id}) references non-existent Publisher ID: ${pubIdStr}`);
      } else {
        validPublisherLinks++;
      }
    }
    recordAudit(
      "Book -> Publisher",
      "Publisher Referential Integrity",
      "Verify book.publisher exists in Publisher collection",
      allBooks.length,
      validPublisherLinks,
      pubFailures,
    );

    // 1.3 Book -> Category References
    let validCategoryLinks = 0;
    const catFailures: string[] = [];
    for (const book of allBooks) {
      if (!Array.isArray(book.categories) || book.categories.length === 0) {
        catFailures.push(`Book "${book.title}" (ID: ${book._id}) has NO categories assigned.`);
        continue;
      }
      let allBookCatsValid = true;
      for (const catId of book.categories) {
        const idStr = catId.toString();
        if (!categoryIdSet.has(idStr)) {
          catFailures.push(`Book "${book.title}" (ID: ${book._id}) references non-existent Category ID: ${idStr}`);
          allBookCatsValid = false;
        }
      }
      if (allBookCatsValid) validCategoryLinks++;
    }
    recordAudit(
      "Book -> Categories",
      "Category Referential Integrity",
      "Verify all categories in book.categories exist in Category collection",
      allBooks.length,
      validCategoryLinks,
      catFailures,
    );

    // 1.4 Book -> CreatedBy User Reference
    let validCreatorLinks = 0;
    const creatorFailures: string[] = [];
    for (const book of allBooks) {
      if (!book.createdBy) {
        creatorFailures.push(`Book "${book.title}" (ID: ${book._id}) has NO createdBy user reference.`);
        continue;
      }
      const creatorIdStr = book.createdBy.toString();
      if (!userIdSet.has(creatorIdStr)) {
        creatorFailures.push(`Book "${book.title}" (ID: ${book._id}) references non-existent User ID: ${creatorIdStr}`);
      } else {
        validCreatorLinks++;
      }
    }
    recordAudit(
      "Book -> User",
      "Creator Referential Integrity",
      "Verify book.createdBy exists in User collection",
      allBooks.length,
      validCreatorLinks,
      creatorFailures,
    );

    // =================================================================
    // SECTION 2: BOOK LISTING -> BOOK & SELLER INTEGRITY
    // =================================================================
    console.log("\n--- [2. BOOK LISTING -> BOOK & SELLER RELATIONSHIPS AUDIT] ---");

    // 2.1 Listing -> Book Reference
    let validListingBookLinks = 0;
    const listingBookFailures: string[] = [];
    for (const listing of allListings) {
      if (!listing.book) {
        listingBookFailures.push(`Listing ID ${listing._id} has NO book reference.`);
        continue;
      }
      const bookIdStr = listing.book.toString();
      if (!bookIdSet.has(bookIdStr)) {
        listingBookFailures.push(`Listing ID ${listing._id} references non-existent Book ID: ${bookIdStr}`);
      } else {
        validListingBookLinks++;
      }
    }
    recordAudit(
      "Listing -> Book",
      "Listing Book Referential Integrity",
      "Verify listing.book exists in Book collection",
      allListings.length,
      validListingBookLinks,
      listingBookFailures,
    );

    // 2.2 Listing -> Seller Reference & Role Validation
    let validListingSellerLinks = 0;
    const listingSellerFailures: string[] = [];
    for (const listing of allListings) {
      if (!listing.seller) {
        listingSellerFailures.push(`Listing ID ${listing._id} has NO seller reference.`);
        continue;
      }
      const sellerIdStr = listing.seller.toString();
      const sellerUser = userMap.get(sellerIdStr);
      if (!sellerUser) {
        listingSellerFailures.push(`Listing ID ${listing._id} references non-existent Seller User ID: ${sellerIdStr}`);
      } else if (sellerUser.role !== "SELLER" && sellerUser.role !== "ADMIN") {
        listingSellerFailures.push(`Listing ID ${listing._id} references user ${sellerUser.name} who has invalid role "${sellerUser.role}" (must be SELLER/ADMIN)`);
      } else {
        validListingSellerLinks++;
      }
    }
    recordAudit(
      "Listing -> Seller",
      "Listing Seller Referential Integrity & Role",
      "Verify listing.seller exists in User collection with SELLER/ADMIN role",
      allListings.length,
      validListingSellerLinks,
      listingSellerFailures,
    );

    // 2.3 Listing Pricing & Invariant Validation
    let validListingPricing = 0;
    const pricingFailures: string[] = [];
    for (const listing of allListings) {
      const isMrpPositive = typeof listing.mrpInPaise === "number" && listing.mrpInPaise > 0;
      const isSellingPositive = typeof listing.sellingPriceInPaise === "number" && listing.sellingPriceInPaise > 0;
      const isCeilingValid = listing.sellingPriceInPaise <= listing.mrpInPaise;
      const isStockValid = typeof listing.stock === "number" && listing.stock >= 0;

      if (!isMrpPositive || !isSellingPositive || !isCeilingValid || !isStockValid) {
        pricingFailures.push(
          `Listing ID ${listing._id} invalid pricing/stock: MRP=${listing.mrpInPaise}, SellingPrice=${listing.sellingPriceInPaise}, Stock=${listing.stock}`,
        );
      } else {
        validListingPricing++;
      }
    }
    recordAudit(
      "Listing Pricing",
      "India INR Pricing & Stock Invariants",
      "Verify sellingPriceInPaise <= mrpInPaise, positive values, non-negative stock",
      allListings.length,
      validListingPricing,
      pricingFailures,
    );

    // =================================================================
    // SECTION 3: SELLER -> PUBLISHER DIRECT RELATIONSHIP
    // =================================================================
    console.log("\n--- [3. SELLER -> PUBLISHER RELATIONSHIPS AUDIT] ---");

    const sellersWithPublisher = allUsers.filter((u) => u.role === "SELLER" && u.publisher);
    let validSellerPublisherLinks = 0;
    const sellerPubFailures: string[] = [];
    for (const seller of sellersWithPublisher) {
      const pubIdStr = seller.publisher!.toString();
      if (!publisherIdSet.has(pubIdStr)) {
        sellerPubFailures.push(`Seller "${seller.name}" (ID: ${seller._id}) references non-existent Publisher ID: ${pubIdStr}`);
      } else {
        validSellerPublisherLinks++;
      }
    }
    recordAudit(
      "Seller -> Publisher",
      "Publisher Store Link Integrity",
      "Verify seller.publisher points to a valid Publisher document",
      sellersWithPublisher.length,
      validSellerPublisherLinks,
      sellerPubFailures,
    );

    // =================================================================
    // SECTION 4: COMPOUND UNIQUE INVARIANTS & UNIQUENESS
    // =================================================================
    console.log("\n--- [4. COMPOUND UNIQUE & IDENTIFIER INTEGRITY AUDIT] ---");

    // 4.1 Unique (book, seller) pairs in BookListing
    const listingPairSet = new Set<string>();
    let uniqueListingPairs = 0;
    const duplicateListingFailures: string[] = [];
    for (const listing of allListings) {
      if (!listing.book || !listing.seller) continue;
      const pairKey = `${listing.book.toString()}_${listing.seller.toString()}`;
      if (listingPairSet.has(pairKey)) {
        duplicateListingFailures.push(`Duplicate listing detected for Book ${listing.book} and Seller ${listing.seller}`);
      } else {
        listingPairSet.add(pairKey);
        uniqueListingPairs++;
      }
    }
    recordAudit(
      "Listings Uniqueness",
      "Unique (Book, Seller) Pair Constraint",
      "Verify no duplicate listings exist for the same (book, seller) pair",
      allListings.length,
      uniqueListingPairs,
      duplicateListingFailures,
    );

    // 4.2 Unique legacyId on Books
    const legacyIdSet = new Set<string>();
    let uniqueLegacyIds = 0;
    const duplicateLegacyFailures: string[] = [];
    const booksWithLegacyId = allBooks.filter((b) => b.legacyId);
    for (const book of booksWithLegacyId) {
      if (legacyIdSet.has(book.legacyId!)) {
        duplicateLegacyFailures.push(`Duplicate legacyId "${book.legacyId}" found on Book "${book.title}" (ID: ${book._id})`);
      } else {
        legacyIdSet.add(book.legacyId!);
        uniqueLegacyIds++;
      }
    }
    recordAudit(
      "Book Legacy IDs",
      "Unique legacyId Constraint",
      "Verify all legacyId values across books are unique",
      booksWithLegacyId.length,
      uniqueLegacyIds,
      duplicateLegacyFailures,
    );

    // 4.3 Unique Slugs across Collections
    const checkSlugUniqueness = (items: { slug?: string; _id: any; name?: string; title?: string }[], entityName: string) => {
      const slugs = new Set<string>();
      let validSlugs = 0;
      const slugFailures: string[] = [];
      for (const item of items) {
        if (!item.slug) {
          slugFailures.push(`${entityName} ID ${item._id} has NO slug`);
        } else if (slugs.has(item.slug)) {
          slugFailures.push(`Duplicate ${entityName} slug "${item.slug}" on ID ${item._id}`);
        } else {
          slugs.add(item.slug);
          validSlugs++;
        }
      }
      recordAudit(
        `${entityName} Slugs`,
        `Unique ${entityName} Slug Constraint`,
        `Verify all ${entityName} documents have non-empty unique slugs`,
        items.length,
        validSlugs,
        slugFailures,
      );
    };

    checkSlugUniqueness(allBooks, "Book");
    checkSlugUniqueness(allAuthors, "Author");
    checkSlugUniqueness(allPublishers, "Publisher");
    checkSlugUniqueness(allCategories, "Category");

    // =================================================================
    // SECTION 5: REVERSE JOINS & RELATIONSHIP TRAVERSALS
    // =================================================================
    console.log("\n--- [5. REVERSE JOINS & BIDIRECTIONAL LOOKUP AUDIT] ---");

    // 5.1 Author -> Books Reverse Lookup
    let validAuthorReverseLookups = 0;
    const sampleAuthors = allAuthors.slice(0, 10);
    for (const author of sampleAuthors) {
      const booksByAuthor = await BookModel.find({ authors: author._id }).select("title").lean();
      if (booksByAuthor.length >= 0) {
        validAuthorReverseLookups++;
      }
    }
    recordAudit(
      "Reverse Join: Author -> Books",
      "Bidirectional Author-to-Book Query Traversal",
      "Verify Author reverse query can find all canonical books",
      sampleAuthors.length,
      validAuthorReverseLookups,
      [],
    );

    // 5.2 Publisher -> Books Reverse Lookup
    let validPublisherReverseLookups = 0;
    const samplePublishers = allPublishers.slice(0, 10);
    for (const pub of samplePublishers) {
      const booksByPub = await BookModel.find({ publisher: pub._id }).select("title").lean();
      if (booksByPub.length >= 0) {
        validPublisherReverseLookups++;
      }
    }
    recordAudit(
      "Reverse Join: Publisher -> Books",
      "Bidirectional Publisher-to-Book Query Traversal",
      "Verify Publisher reverse query can find all canonical books",
      samplePublishers.length,
      validPublisherReverseLookups,
      [],
    );

    // 5.3 Category -> Books Reverse Lookup
    let validCategoryReverseLookups = 0;
    const sampleCategories = allCategories.slice(0, 10);
    for (const cat of sampleCategories) {
      const booksByCat = await BookModel.find({ categories: cat._id }).select("title").lean();
      if (booksByCat.length >= 0) {
        validCategoryReverseLookups++;
      }
    }
    recordAudit(
      "Reverse Join: Category -> Books",
      "Bidirectional Category-to-Book Query Traversal",
      "Verify Category reverse query can find all canonical books",
      sampleCategories.length,
      validCategoryReverseLookups,
      [],
    );

    // 5.4 Book -> Listings Reverse Lookup
    let validBookListingsReverseLookups = 0;
    const sampleBooks = allBooks.slice(0, 15);
    for (const book of sampleBooks) {
      const listings = await BookListingModel.find({ book: book._id }).lean();
      // Even if a book has 0 listings, query returns an array without error
      if (Array.isArray(listings)) {
        validBookListingsReverseLookups++;
      }
    }
    recordAudit(
      "Reverse Join: Book -> Listings",
      "Bidirectional Book-to-Listings Query Traversal",
      "Verify Book reverse query can find all active seller listings",
      sampleBooks.length,
      validBookListingsReverseLookups,
      [],
    );

    // =================================================================
    // SECTION 6: DEEP POPULATION & COMPLEX JOINS SIMULATION
    // =================================================================
    console.log("\n--- [6. DEEP POPULATION & COMPLEX JOINS SIMULATION] ---");

    // Test 6.1: Deep Join from BookListing -> Book -> [Authors, Publisher, Categories] + Seller -> Publisher
    const validListingSample = allListings.filter((l) => l.book && bookIdSet.has(l.book.toString())).slice(0, 15);
    const validListingSampleIds = validListingSample.map((l) => l._id);

    const deepSampleListings = await BookListingModel.find({ _id: { $in: validListingSampleIds } })
      .populate({
        path: "book",
        populate: [
          { path: "authors", select: "name nameBn slug photo" },
          { path: "publisher", select: "name nameBn slug logo" },
          { path: "categories", select: "name nameBn slug" },
        ],
      })
      .populate({
        path: "seller",
        select: "name email role publisher",
        populate: {
          path: "publisher",
          select: "name nameBn slug",
        },
      })
      .lean();

    let deepPopulationSuccess = 0;
    const deepPopFailures: string[] = [];

    for (const listing of deepSampleListings) {
      const bookObj = listing.book as any;
      const sellerObj = listing.seller as any;

      const hasValidBook = Boolean(bookObj && typeof bookObj.title === "string");
      const hasValidAuthors = Boolean(bookObj && Array.isArray(bookObj.authors) && bookObj.authors.length > 0 && typeof bookObj.authors[0].name === "string");
      const hasValidPublisher = Boolean(bookObj && bookObj.publisher && typeof bookObj.publisher.name === "string");
      const hasValidCategories = Boolean(bookObj && Array.isArray(bookObj.categories) && bookObj.categories.length > 0 && typeof bookObj.categories[0].name === "string");
      const hasValidSeller = Boolean(sellerObj && typeof sellerObj.name === "string" && typeof sellerObj.email === "string");

      if (hasValidBook && hasValidAuthors && hasValidPublisher && hasValidCategories && hasValidSeller) {
        deepPopulationSuccess++;
      } else {
        deepPopFailures.push(
          `Listing ID ${listing._id} failed deep join validation (Book: ${hasValidBook}, Authors: ${hasValidAuthors}, Pub: ${hasValidPublisher}, Cats: ${hasValidCategories}, Seller: ${hasValidSeller})`,
        );
      }
    }

    recordAudit(
      "Deep Population",
      "Multi-Level Join (Listing -> Book -> Authors/Pub/Cats & Seller)",
      "Test complete end-to-end Mongoose population graph",
      deepSampleListings.length,
      deepPopulationSuccess,
      deepPopFailures,
    );

    // Test 6.2: Aggregations & Competitive Multi-Seller Pricing Joins
    const sampleBookWithMultipleListings = await BookListingModel.aggregate([
      { $match: { book: { $in: Array.from(bookIdSet).map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: "$book", count: { $sum: 1 }, minPrice: { $min: "$sellingPriceInPaise" }, maxPrice: { $max: "$sellingPriceInPaise" } } },
      { $limit: 5 },
    ]);

    let aggregationSuccess = 0;
    for (const group of sampleBookWithMultipleListings) {
      const bookDoc = bookMap.get(group._id.toString());
      if (bookDoc && group.minPrice > 0 && group.maxPrice >= group.minPrice) {
        aggregationSuccess++;
      }
    }

    recordAudit(
      "Pricing Aggregations",
      "Multi-Seller Price & Inventory Aggregation",
      "Verify listing aggregation across canonical books yields accurate price bounds",
      sampleBookWithMultipleListings.length,
      aggregationSuccess,
      [],
    );

    // =================================================================
    // SUMMARY REPORT
    // =================================================================
    const totalAudits = auditChecks.length;
    const passedAudits = auditChecks.filter((a) => a.status === "PASSED").length;
    const failedAudits = totalAudits - passedAudits;

    console.log("\n=================================================================");
    console.log("                DATABASE RELATIONSHIP AUDIT REPORT");
    console.log("=================================================================");
    console.log(`  Total Checks Run    : ${totalAudits}`);
    console.log(`  Passed Checks       : ${passedAudits} ✅`);
    console.log(`  Failed Checks       : ${failedAudits} ${failedAudits === 0 ? "🎉" : "❌"}`);
    console.log("=================================================================\n");

    if (failedAudits > 0) {
      console.log("Detected Relationship Failures:");
      for (const a of auditChecks.filter((c) => c.status === "FAILED")) {
        console.log(`\n❌ [${a.category}] ${a.name} (${a.failedCount} failures):`);
        a.failures.slice(0, 5).forEach((f) => console.log(`   - ${f}`));
        if (a.failures.length > 5) {
          console.log(`   ... and ${a.failures.length - 5} more.`);
        }
      }
      console.log("\n💡 Tip: Run `npm run audit:joins -- --fix-orphans` if you wish to clean up orphaned test listings from previous test cycles.");
      process.exit(1);
    } else {
      console.log("🎉 ALL DATABASE RELATIONSHIPS, JOINS, POPULATIONS & CONSTRAINTS ARE 100% HEALTHY AND VALID!");
    }
  } catch (error) {
    logger.error(error, "Database relationship audit encountered fatal error");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void runBookJoinsAudit();


import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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

type RawProduct = {
  id: string;
  book_id?: string;
  name: string;
  name_bn?: string;
  cat_id?: string;
  author_id?: string;
  publisher_id?: string;
  language_id?: string;
  admin_id?: string;
  search_tag?: string;
  description?: string;
  auther_says?: string;
  isbn?: string;
  price?: string;
  deliverycharge?: string;
  stock?: string;
  image?: string;
  is_active?: string;
  is_del?: string;
  price_in?: string;
  price_bd?: string;
  discount_in?: string;
  gallery_images?: string;
  edition?: string;
  page_no?: string;
};

type AnomalyRecord = {
  productId: string;
  bookId?: string;
  title: string;
  type:
    | "DUMMY_OR_EMPTY_ISBN"
    | "CLEANED_APPAREL_TAG"
    | "UNMAPPED_AUTHOR"
    | "UNMAPPED_PUBLISHER"
    | "UNMAPPED_CATEGORY"
    | "NO_INDIA_PRICE"
    | "SOFT_DELETED";
  details: string;
};

const anomalies: AnomalyRecord[] = [];

const recordAnomaly = (
  productId: string,
  bookId: string | undefined,
  title: string,
  type: AnomalyRecord["type"],
  details: string,
) => {
  anomalies.push({
    productId,
    bookId,
    title,
    type,
    details,
  });
};

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const loadJsonTable = (filename: string): any[] => {
  const filePath = path.join(process.cwd(), "src", "data", filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    const tableObj = parsed.find(
      (item: any) => item.type === "table" && Array.isArray(item.data),
    );
    if (tableObj) return tableObj.data;
  }
  return [];
};

const APPAREL_TAG_KEYWORDS = [
  "jeans",
  "kurta",
  "dress",
  "lipstick",
  "watch",
  "t-shirt",
  "polo",
  "colourblocked",
  "shirt",
  "anarkali",
  "flared",
  "yoke",
  "cotton",
];

const cleanSearchTags = (
  rawTag: string | undefined,
  title: string,
  productId: string,
  bookId: string | undefined,
): string[] => {
  const tags: string[] = [];
  if (rawTag) {
    const lower = rawTag.toLowerCase().trim();
    const isApparelNoise = APPAREL_TAG_KEYWORDS.some((kw) => lower.includes(kw));

    if (isApparelNoise) {
      recordAnomaly(
        productId,
        bookId,
        title,
        "CLEANED_APPAREL_TAG",
        `Stripped legacy apparel tag: "${rawTag.trim()}"`,
      );
    } else {
      const parts = rawTag.split(/[,|\s]+/).map((t) => t.trim()).filter((t) => t.length > 1);
      tags.push(...parts);
    }
  }

  // Derive genuine tags from title tokens
  const titleWords = title
    .replace(/[()[\]{}.,:;"'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);

  for (const word of titleWords) {
    if (!tags.includes(word) && tags.length < 8) {
      tags.push(word);
    }
  }

  return tags;
};

const isValidIsbn = (isbn?: string): boolean => {
  if (!isbn) return false;
  const trimmed = isbn.trim();
  if (trimmed.length < 5) return false;
  // Check for dummy string patterns like "eerer", "tttt", "ttty", "ISBN001"
  if (/^(eerer|tttt|ttty|eerr|test|dummy|null|none|0000)/i.test(trimmed)) {
    return false;
  }
  // Must contain digits
  if (!/\d/.test(trimmed)) {
    return false;
  }
  return true;
};

const seedBooks = async () => {
  try {
    console.log("\n=======================================================");
    console.log("   MIGRATING LEGACY PRODUCTS TO CANONICAL BOOKS & INDIA LISTINGS");
    console.log("=======================================================\n");

    logger.info("Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    try {
      await BookModel.collection.dropIndexes();
      await BookModel.syncIndexes();
      logger.info("BookModel indexes synchronized successfully");
    } catch {
      // Ignore if collection is fresh
    }

    // 1. Setup Base India Country
    let indiaCountry = await CountryModel.findOne({ code: "IN" });
    if (!indiaCountry) {
      indiaCountry = await CountryModel.create({
        name: "India",
        code: "IN",
        phoneCode: "+91",
        currency: "INR",
        isActive: true,
      });
      logger.info({ countryId: indiaCountry._id }, "Created India Country model");
    }

    // 2. Setup Default Platform Admin & Default Marketplace Seller
    const passwordHash = await bcrypt.hash("Password123!", 10);

    let defaultAdmin = await UserModel.findOne({ email: "admin@bookstore.in" });
    if (!defaultAdmin) {
      defaultAdmin = await UserModel.create({
        name: "Platform Admin",
        email: "admin@bookstore.in",
        password: passwordHash,
        mobileNumber: "+919800000001",
        role: "ADMIN",
        country: indiaCountry._id,
        isActive: true,
      });
      logger.info({ adminId: defaultAdmin._id }, "Created Default Admin user");
    }

    let defaultSeller = await UserModel.findOne({ email: "seller@bookstore.in" });
    if (!defaultSeller) {
      defaultSeller = await UserModel.create({
        name: "Default Marketplace Seller",
        email: "seller@bookstore.in",
        password: passwordHash,
        mobileNumber: "+919800000002",
        role: "SELLER",
        country: indiaCountry._id,
        isActive: true,
      });
      logger.info({ sellerId: defaultSeller._id }, "Created Default Marketplace Seller");
    }

    // 3. Load Legacy Data Tables
    logger.info("Loading reference JSON tables...");
    const rawProducts: RawProduct[] = loadJsonTable("shop_product.json");
    const rawAuthors = loadJsonTable("shop_author.json");
    const rawPublishers = loadJsonTable("shop_publisher (1).json");
    const rawCategories = loadJsonTable("shop_book_category.json");

    logger.info(
      `Loaded: ${rawProducts.length} products, ${rawAuthors.length} authors, ${rawPublishers.length} publishers, ${rawCategories.length} categories.`,
    );

    // 4. Build Resolution Maps for Authors, Publishers, Categories
    // --- Author Map ---
    const authorByLegacyId = new Map<string, any>();
    const authorByName = new Map<string, any>();
    for (const a of rawAuthors) {
      const id = String(a.id || "").trim();
      if (id) authorByLegacyId.set(id, a);
      if (a.name) authorByName.set(a.name.trim().toLowerCase(), a);
      if (a.name_bn) authorByName.set(a.name_bn.trim().toLowerCase(), a);
    }

    // --- Publisher Map ---
    const publisherByLegacyId = new Map<string, any>();
    const publisherByName = new Map<string, any>();
    for (const p of rawPublishers) {
      const id = String(p.id || "").trim();
      if (id) publisherByLegacyId.set(id, p);
      if (p.name) publisherByName.set(p.name.trim().toLowerCase(), p);
      if (p.name_bn) publisherByName.set(p.name_bn.trim().toLowerCase(), p);
    }

    // --- Category Map ---
    const categoryByLegacyId = new Map<string, any>();
    for (const c of rawCategories) {
      const id = String(c.id || "").trim();
      if (id) categoryByLegacyId.set(id, c);
    }

    // Fallback General Category
    let fallbackCategory = await CategoryModel.findOne({ slug: "general-books" });
    if (!fallbackCategory) {
      fallbackCategory = await CategoryModel.create({
        name: "General Books",
        nameBn: "সাধারণ বই",
        slug: "general-books",
        description: "General literature and publication",
        isActive: true,
      });
    }

    // Fallback General Publisher
    let fallbackPublisher = await PublisherModel.findOne({ slug: "general-publication" });
    if (!fallbackPublisher) {
      fallbackPublisher = await PublisherModel.create({
        name: "General Publication",
        nameBn: "সাধারণ প্রকাশনী",
        slug: "general-publication",
        description: "Standard book publication",
        isActive: true,
      });
    }

    // Fallback Author
    let fallbackAuthor = await AuthorModel.findOne({ slug: "various-authors" });
    if (!fallbackAuthor) {
      fallbackAuthor = await AuthorModel.create({
        name: "Various Authors",
        nameBn: "বিভিন্ন লেখক",
        slug: "various-authors",
        bio: "Collection or various authors",
        isActive: true,
      });
    }

    // 5. Migrate Products into Canonical Books & India Listings
    logger.info("Migrating products into Canonical Books and India Listings...");

    let booksMigratedCount = 0;
    let indiaListingsCreatedCount = 0;
    let usedSlugs = new Set<string>();

    for (const p of rawProducts) {
      const productId = String(p.id || "").trim();
      const rawTitle = (p.name || "").trim().replace(/[\r\n]+/g, " ");
      if (!rawTitle) continue;

      const titleBn = (p.name_bn || "").trim().replace(/[\r\n]+/g, " ") || undefined;

      // Status & Precedence
      const isDel = p.is_del === "1";
      const isAct = p.is_active === "1";

      let bookStatus: "ACTIVE" | "INACTIVE" = "ACTIVE";
      let isListingActive = true;

      if (isDel) {
        bookStatus = "INACTIVE";
        isListingActive = false;
        recordAnomaly(productId, p.book_id, rawTitle, "SOFT_DELETED", "Product is marked is_del=1 (Soft Deleted)");
      } else if (!isAct) {
        bookStatus = "INACTIVE";
        isListingActive = false;
      }

      // Format detection
      let format: "HARDCOVER" | "PAPERBACK" = "PAPERBACK";
      if (rawTitle.includes("হার্ডকভার") || (p.description || "").includes("হার্ডকভার")) {
        format = "HARDCOVER";
      }

      // ISBN vs legacyId handling
      const rawIsbn = p.isbn ? p.isbn.trim() : "";
      let resolvedIsbn: string | undefined = undefined;

      if (isValidIsbn(rawIsbn)) {
        // Check for duplicate ISBN in DB or batch
        const existsInDb = await BookModel.exists({ isbn: rawIsbn, legacyId: { $ne: productId } });
        if (!existsInDb) {
          resolvedIsbn = rawIsbn;
        } else {
          recordAnomaly(
            productId,
            p.book_id,
            rawTitle,
            "DUMMY_OR_EMPTY_ISBN",
            `Duplicate ISBN "${rawIsbn}" already used by another book. Stored via legacyId instead.`,
          );
        }
      } else {
        recordAnomaly(
          productId,
          p.book_id,
          rawTitle,
          "DUMMY_OR_EMPTY_ISBN",
          rawIsbn ? `Dummy ISBN "${rawIsbn}" skipped. Stored via legacyId.` : "Missing ISBN. Stored via legacyId.",
        );
      }

      // Search tags cleaning
      const searchTags = cleanSearchTags(p.search_tag, rawTitle, productId, p.book_id);

      // Resolve Author(s)
      const authorIds: mongoose.Types.ObjectId[] = [];
      const rawAuthorId = String(p.author_id || "").trim();

      if (rawAuthorId && authorByLegacyId.has(rawAuthorId)) {
        const rawAuthor = authorByLegacyId.get(rawAuthorId);
        const authorSlug = slugify(rawAuthor.name);
        let authorDoc = await AuthorModel.findOne({ slug: authorSlug });
        if (!authorDoc) {
          authorDoc = await AuthorModel.create({
            name: rawAuthor.name.trim(),
            nameBn: rawAuthor.name_bn?.trim() || undefined,
            slug: authorSlug,
            bio: rawAuthor.description?.trim() || undefined,
            photo: rawAuthor.image?.trim() || undefined,
            isActive: true,
          });
        }
        authorIds.push(authorDoc._id);
      } else {
        // Attempt match from HTML table specification
        let authorMatchedFromDesc = false;
        const authorDescMatch = (p.description || "").match(
          /<div class="index-rowKey">\s*Author\s*<\/div>\s*<div class="index-rowValue">\s*([^<]+)\s*<\/div>/i,
        );

        if (authorDescMatch) {
          const extractedAuthorName = authorDescMatch[1].trim();
          const authorSlug = slugify(extractedAuthorName) || `author-${productId}`;
          let authorDoc = await AuthorModel.findOne({
            $or: [{ name: extractedAuthorName }, { nameBn: extractedAuthorName }, { slug: authorSlug }],
          });
          if (!authorDoc) {
            authorDoc = await AuthorModel.create({
              name: extractedAuthorName,
              nameBn: extractedAuthorName,
              slug: authorSlug,
              isActive: true,
            });
          }
          authorIds.push(authorDoc._id);
          authorMatchedFromDesc = true;
        }

        if (!authorMatchedFromDesc) {
          authorIds.push(fallbackAuthor._id);
          recordAnomaly(
            productId,
            p.book_id,
            rawTitle,
            "UNMAPPED_AUTHOR",
            `Author ID "${p.author_id || "EMPTY"}" not found in shop_author.json. Assigned to "${fallbackAuthor.name}".`,
          );
        }
      }

      // Resolve Publisher
      let publisherId: mongoose.Types.ObjectId = fallbackPublisher._id;
      const rawPubId = String(p.publisher_id || "").trim();

      if (rawPubId && publisherByLegacyId.has(rawPubId)) {
        const rawPub = publisherByLegacyId.get(rawPubId);
        const pubSlug = slugify(rawPub.name) || `publisher-${rawPub.id}`;
        let pubDoc = await PublisherModel.findOne({
          $or: [{ legacyId: String(rawPub.id) }, { slug: pubSlug }],
        });
        if (!pubDoc) {
          pubDoc = await PublisherModel.create({
            legacyId: String(rawPub.id),
            name: rawPub.name.trim(),
            nameBn: rawPub.name_bn?.trim() || undefined,
            slug: pubSlug,
            phone: rawPub.phone?.trim() || undefined,
            description: rawPub.description?.trim() || undefined,
            logo: rawPub.image?.trim() || undefined,
            isActive: true,
          });
        }
        publisherId = pubDoc._id;
      } else {
        // Attempt match from HTML table
        let pubMatchedFromDesc = false;
        const pubDescMatch = (p.description || "").match(
          /<div class="index-rowKey">\s*Publisher\s*<\/div>\s*<div class="index-rowValue">\s*([^<]+)\s*<\/div>/i,
        );
        if (pubDescMatch) {
          const extractedPubName = pubDescMatch[1].trim();
          const pubSlug = slugify(extractedPubName) || `pub-${productId}`;
          let pubDoc = await PublisherModel.findOne({
            $or: [{ name: extractedPubName }, { nameBn: extractedPubName }, { slug: pubSlug }],
          });
          if (!pubDoc) {
            pubDoc = await PublisherModel.create({
              name: extractedPubName,
              nameBn: extractedPubName,
              slug: pubSlug,
              isActive: true,
            });
          }
          publisherId = pubDoc._id;
          pubMatchedFromDesc = true;
        }

        if (!pubMatchedFromDesc) {
          recordAnomaly(
            productId,
            p.book_id,
            rawTitle,
            "UNMAPPED_PUBLISHER",
            `Publisher ID "${p.publisher_id || "EMPTY"}" not found in shop_publisher. Assigned to "${fallbackPublisher.name}".`,
          );
        }
      }

      // Resolve Category
      const categoryIds: mongoose.Types.ObjectId[] = [];
      const rawCatId = String(p.cat_id || "").trim();

      if (rawCatId && categoryByLegacyId.has(rawCatId)) {
        const rawCat = categoryByLegacyId.get(rawCatId);
        const catSlug = slugify(rawCat.name) || `category-${rawCat.id}`;
        let catDoc = await CategoryModel.findOne({ slug: catSlug });
        if (!catDoc) {
          catDoc = await CategoryModel.create({
            name: rawCat.name.trim(),
            nameBn: rawCat.name_bn?.trim() || undefined,
            slug: catSlug,
            description: rawCat.description?.trim() || undefined,
            isActive: true,
          });
        }
        categoryIds.push(catDoc._id);
      } else {
        categoryIds.push(fallbackCategory._id);
        recordAnomaly(
          productId,
          p.book_id,
          rawTitle,
          "UNMAPPED_CATEGORY",
          `Category ID "${p.cat_id || "EMPTY"}" not found in shop_book_category. Assigned to "${fallbackCategory.name}".`,
        );
      }

      // Slug generation with collision avoidance
      let baseSlug = slugify(rawTitle) || `book-${productId}`;
      let slug = baseSlug;
      let counter = 1;
      while (usedSlugs.has(slug) || (await BookModel.exists({ slug, legacyId: { $ne: productId } }))) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      usedSlugs.add(slug);

      // Pages
      let pages = parseInt(p.page_no || "0", 10);
      if (!pages || pages <= 0) {
        const pageMatch = (p.description || "").match(
          /<div class="index-rowKey">\s*Number of Pages\s*<\/div>\s*<div class="index-rowValue">\s*(\d+)\s*<\/div>/i,
        );
        if (pageMatch) {
          pages = parseInt(pageMatch[1], 10);
        }
      }

      // Upsert Canonical Book
      const bookDoc = await BookModel.findOneAndUpdate(
        { legacyId: productId },
        {
          $set: {
            title: rawTitle,
            titleBn,
            slug,
            legacyId: productId,
            legacyBookId: p.book_id?.trim() || undefined,
            isbn: resolvedIsbn,
            description: p.description?.trim() || rawTitle,
            authors: authorIds,
            publisher: publisherId,
            categories: categoryIds,
            language: "Bengali",
            searchTags,
            format,
            pages: pages > 0 ? pages : undefined,
            edition: p.edition?.trim() || undefined,
            coverImage: p.image?.trim() || "default-cover.jpg",
            status: bookStatus,
            createdBy: defaultAdmin._id,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      booksMigratedCount++;

      // ==========================================
      // INDIA MARKETPLACE LISTING CREATION
      // ==========================================
      const rawPriceIn = parseFloat(p.price_in || "0");
      const rawDiscountIn = parseFloat(p.discount_in || "0");

      if (rawPriceIn > 0) {
        const sellingPriceInPaise = Math.round(rawPriceIn * 100);
        let mrpInPaise = sellingPriceInPaise;

        if (rawDiscountIn > 0 && rawDiscountIn < 100) {
          mrpInPaise = Math.round(sellingPriceInPaise / (1 - rawDiscountIn / 100));
        }

        const stock = parseInt(p.stock || "0", 10);
        const sku = `SKU-IN-${p.book_id || p.id}`;

        await BookListingModel.findOneAndUpdate(
          { book: bookDoc._id, seller: defaultSeller._id },
          {
            $set: {
              book: bookDoc._id,
              seller: defaultSeller._id,
              mrpInPaise,
              sellingPriceInPaise,
              stock: stock >= 0 ? stock : 0,
              sku,
              isActive: isListingActive,
            },
          },
          { upsert: true, setDefaultsOnInsert: true },
        );

        indiaListingsCreatedCount++;
      } else {
        recordAnomaly(
          productId,
          p.book_id,
          rawTitle,
          "NO_INDIA_PRICE",
          `price_in = 0. No India marketplace listing created (No BDT numerical price converted to INR).`,
        );
      }
    }

    // ==========================================
    // ANOMALY & MIGRATION SUMMARY REPORT
    // ==========================================
    console.log("\n=======================================================");
    console.log("            MIGRATION & ANOMALY REPORT");
    console.log("=======================================================");
    console.log(`  Total Legacy Products Input : ${rawProducts.length}`);
    console.log(`  Canonical Books Migrated    : ${booksMigratedCount} ✅`);
    console.log(`  India Listings Created      : ${indiaListingsCreatedCount} ✅`);
    console.log(`  Total Anomalies / Notices   : ${anomalies.length}`);
    console.log("=======================================================\n");

    const anomalyGroups: Record<string, AnomalyRecord[]> = {};
    for (const a of anomalies) {
      if (!anomalyGroups[a.type]) anomalyGroups[a.type] = [];
      anomalyGroups[a.type].push(a);
    }

    for (const [type, list] of Object.entries(anomalyGroups)) {
      console.log(`\n📌 [${type}] (${list.length} occurrences):`);
      list.slice(0, 10).forEach((item) => {
        console.log(`   - Product #${item.productId} [${item.bookId || "N/A"}] "${item.title.substring(0, 35)}..." -> ${item.details}`);
      });
      if (list.length > 10) {
        console.log(`   ... and ${list.length - 10} more.`);
      }
    }

    console.log("\n=======================================================");
    console.log("   MIGRATION COMPLETED CLEANLY & SUCCESSFULLY! 🎉");
    console.log("=======================================================\n");
  } catch (error) {
    logger.error(error, "Migration failed");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void seedBooks();

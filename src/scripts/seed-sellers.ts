import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import { env } from "../config/env.js";
import { UserModel, BookListingModel, CountryModel } from "../models/index.js";
import { logger } from "../utils/logger.js";

const seedSellers = async () => {
  try {
    logger.info("Connecting to MongoDB for seller seeding...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    // 1. Ensure Country exists
    let india = await CountryModel.findOne({ code: "IN" });
    if (!india) {
      india = await CountryModel.create({
        name: "India",
        code: "IN",
        phoneCode: "+91",
        currency: "INR",
        isActive: true,
      });
      logger.info({ countryId: india._id }, "Created India Country model");
    }

    const defaultPassword = await bcrypt.hash("Password123!", 10);

    // 2. Define sellers to ensure exist
    const sellersToSeed = [
      {
        name: "Default Marketplace Seller",
        email: "seller@bookstore.in",
        mobileNumber: "+919800000002",
        role: "SELLER" as const,
        country: india._id,
        isActive: true,
      },
      {
        name: "Oxford Book Store",
        email: "oxford@bookstore.in",
        mobileNumber: "+919800000003",
        role: "SELLER" as const,
        country: india._id,
        isActive: true,
      },
      {
        name: "Boighar Book Depot",
        email: "boighar@bookstore.in",
        mobileNumber: "+919800000004",
        role: "SELLER" as const,
        country: india._id,
        isActive: true,
      },
    ];

    const availableSellers: mongoose.Types.ObjectId[] = [];

    for (const sellerData of sellersToSeed) {
      let seller = await UserModel.findOne({ email: sellerData.email });
      if (!seller) {
        seller = await UserModel.create({
          ...sellerData,
          password: defaultPassword,
          isEmailVerified: true,
          isMobileVerified: true,
        });
        logger.info({ sellerId: seller._id, email: seller.email, name: seller.name }, "Created Seller");
      } else {
        seller.role = "SELLER";
        seller.isActive = true;
        await seller.save();
        logger.info({ sellerId: seller._id, email: seller.email, name: seller.name }, "Seller already exists, verified active");
      }

      availableSellers.push(seller._id);
    }

    // 3. Get all valid seller IDs in memory in 1 query
    const validSellerUsers = await UserModel.find({ role: "SELLER", isActive: true }).select("_id").lean();
    const validSellerIdSet = new Set<string>(validSellerUsers.map((u) => u._id.toString()));

    // 4. Fetch all BookListings in 1 query
    const allListings = await BookListingModel.find().select("_id book seller").lean();
    logger.info({ totalListings: allListings.length }, "Total BookListings in database");

    // Build map of bookId -> Set of existing assigned seller IDs
    const bookSellerMap = new Map<string, Set<string>>();

    for (const listing of allListings) {
      const bookIdStr = listing.book.toString();
      if (!bookSellerMap.has(bookIdStr)) {
        bookSellerMap.set(bookIdStr, new Set());
      }
      if (listing.seller && validSellerIdSet.has(listing.seller.toString())) {
        bookSellerMap.get(bookIdStr)!.add(listing.seller.toString());
      }
    }

    const bulkOps = [];
    let updatedCount = 0;

    for (const listing of allListings) {
      const isSellerValid = listing.seller && validSellerIdSet.has(listing.seller.toString());

      if (!isSellerValid) {
        const bookIdStr = listing.book.toString();
        const assignedSet = bookSellerMap.get(bookIdStr) || new Set();

        // Pick an available seller that is not yet assigned for this book
        let chosenSellerId: mongoose.Types.ObjectId | null = null;
        for (const sellerId of availableSellers) {
          if (!assignedSet.has(sellerId.toString())) {
            chosenSellerId = sellerId;
            break;
          }
        }

        if (!chosenSellerId) {
          chosenSellerId = availableSellers[0];
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: listing._id },
            update: { $set: { seller: chosenSellerId } },
          },
        });

        assignedSet.add(chosenSellerId.toString());
        bookSellerMap.set(bookIdStr, assignedSet);
        updatedCount++;
      }
    }

    if (bulkOps.length > 0) {
      await BookListingModel.bulkWrite(bulkOps);
    }

    logger.info(
      {
        totalListings: allListings.length,
        relinkedListings: updatedCount,
      },
      "Seller seeding and listing reconnection completed successfully!",
    );

    console.log("\n========================================================");
    console.log("              SELLER SEEDING COMPLETE");
    console.log("========================================================");
    console.log("Sellers in Database:");
    console.log(`1. Default Marketplace Seller (seller@bookstore.in) - ID: ${availableSellers[0]}`);
    console.log(`2. Oxford Book Store (oxford@bookstore.in) - ID: ${availableSellers[1]}`);
    console.log(`3. Boighar Book Depot (boighar@bookstore.in) - ID: ${availableSellers[2]}`);
    console.log(`\nRe-linked ${updatedCount} orphaned book listings using bulkWrite.`);
    console.log("========================================================\n");
  } catch (error) {
    logger.error(error, "Failed to seed sellers");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void seedSellers();

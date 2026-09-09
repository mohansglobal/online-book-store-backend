import mongoose from "mongoose";

import { env } from "../config/env.js";
import { BookModel, BookListingModel, UserModel } from "../models/index.js";
import { logger } from "../utils/logger.js";

type LegacyPriceEntry = {
  id: string;
  price_in: string;
};

export const legacyBookPrices: LegacyPriceEntry[] = [
  { id: "1", price_in: "0" },
  { id: "2", price_in: "0" },
  { id: "3", price_in: "168" },
  { id: "4", price_in: "272" },
  { id: "5", price_in: "198" },
  { id: "6", price_in: "100" },
  { id: "7", price_in: "176" },
  { id: "8", price_in: "100" },
  { id: "9", price_in: "100" },
  { id: "10", price_in: "100" },
  { id: "11", price_in: "100" },
  { id: "14", price_in: "100" },
  { id: "15", price_in: "200" },
  { id: "16", price_in: "300" },
  { id: "17", price_in: "300" },
  { id: "18", price_in: "200" },
  { id: "19", price_in: "233" },
  { id: "20", price_in: "400" },
  { id: "21", price_in: "0" },
  { id: "22", price_in: "0" },
  { id: "23", price_in: "176" },
  { id: "24", price_in: "196" },
  { id: "25", price_in: "105" },
  { id: "26", price_in: "338" },
  { id: "27", price_in: "144" },
  { id: "28", price_in: "200" },
  { id: "29", price_in: "160" },
  { id: "30", price_in: "187" },
  { id: "31", price_in: "110" },
  { id: "32", price_in: "255" },
  { id: "33", price_in: "354" },
  { id: "34", price_in: "125" },
  { id: "35", price_in: "150" },
  { id: "36", price_in: "245" },
  { id: "37", price_in: "394" },
  { id: "38", price_in: "400" },
  { id: "39", price_in: "171" },
  { id: "40", price_in: "261" },
  { id: "41", price_in: "285" },
  { id: "42", price_in: "1078" },
  { id: "43", price_in: "506" },
  { id: "44", price_in: "300" },
  { id: "45", price_in: "200" },
  { id: "46", price_in: "210" },
  { id: "47", price_in: "176" },
  { id: "48", price_in: "400" },
  { id: "49", price_in: "160" },
  { "id": "50", price_in: "112" },
  { "id": "51", price_in: "300" },
  { "id": "52", price_in: "188" },
  { "id": "53", price_in: "350" },
  { "id": "54", price_in: "275" },
  { "id": "55", price_in: "166" },
  { "id": "56", price_in: "155" },
  { "id": "57", price_in: "106" },
  { "id": "58", price_in: "150" },
  { "id": "59", price_in: "273" },
  { "id": "60", price_in: "240" },
  { "id": "61", price_in: "0" },
  { "id": "62", price_in: "110" },
  { "id": "63", price_in: "250" },
  { "id": "64", price_in: "750" },
  { "id": "65", price_in: "120" },
  { "id": "66", price_in: "100" },
  { "id": "67", price_in: "90" },
  { "id": "68", price_in: "100" },
  { "id": "69", price_in: "80" },
  { "id": "70", price_in: "60" },
  { "id": "71", price_in: "550" },
  { "id": "72", price_in: "120" },
  { "id": "73", price_in: "300" },
  { "id": "74", price_in: "100" },
  { "id": "75", price_in: "250" },
  { "id": "76", price_in: "100" },
  { "id": "77", price_in: "100" },
  { "id": "78", price_in: "90" },
  { "id": "79", price_in: "90" },
  { "id": "80", price_in: "80" },
  { "id": "81", price_in: "800" },
  { "id": "82", price_in: "80" },
  { "id": "83", price_in: "250" },
  { "id": "84", price_in: "120" },
  { "id": "85", price_in: "150" },
  { "id": "86", price_in: "2500" },
  { "id": "87", price_in: "595" },
  { "id": "88", price_in: "441" },
  { "id": "89", price_in: "0" },
  { "id": "90", price_in: "128.58" },
  { "id": "91", price_in: "0" },
  { "id": "92", price_in: "0" },
  { "id": "93", price_in: "0" },
  { "id": "94", price_in: "500" },
  { "id": "95", price_in: "700" },
  { "id": "97", price_in: "0" },
  { "id": "100", price_in: "0" },
  { "id": "101", price_in: "449" },
  { "id": "104", price_in: "149" },
  { "id": "107", price_in: "1080" },
  { "id": "109", price_in: "234" },
  { "id": "110", price_in: "359.1" },
  { "id": "111", price_in: "292.5" },
  { "id": "112", price_in: "427.5" },
  { "id": "113", price_in: "585" },
  { "id": "114", price_in: "275" },
  { "id": "115", price_in: "223" },
  { "id": "116", price_in: "225" },
  { "id": "117", price_in: "405" },
  { "id": "118", price_in: "315" },
  { "id": "119", price_in: "449" },
  { "id": "120", price_in: "180" },
  { "id": "121", price_in: "292.5" },
  { "id": "122", price_in: "144" },
  { "id": "123", price_in: "202.5" },
  { "id": "124", price_in: "157.5" },
  { "id": "125", price_in: "404.1" },
  { "id": "126", price_in: "170.1" },
  { "id": "127", price_in: "180" },
  { "id": "128", price_in: "180" },
  { "id": "129", price_in: "170.1" },
  { "id": "130", price_in: "472.5" },
  { "id": "131", price_in: "179.1" },
  { "id": "132", price_in: "450" },
  { "id": "133", price_in: "359.1" },
  { "id": "134", price_in: "359.1" },
  { "id": "135", price_in: "247.5" },
  { "id": "136", price_in: "247.5" },
  { "id": "137", price_in: "290.5" },
  { "id": "138", price_in: "224.1" },
  { "id": "139", price_in: "202.5" },
  { "id": "140", price_in: "225" },
  { "id": "141", price_in: "135" },
  { "id": "142", price_in: "224.1" },
  { "id": "143", price_in: "315" },
  { "id": "144", price_in: "225" },
  { "id": "145", price_in: "585" },
  { "id": "146", price_in: "202.5" },
  { "id": "147", price_in: "260.1" },
  { "id": "148", price_in: "180" },
  { "id": "149", price_in: "135" },
  { "id": "150", price_in: "179.1" },
  { "id": "151", price_in: "225" },
  { "id": "152", price_in: "202.5" },
  { "id": "153", price_in: "539.1" },
  { "id": "154", price_in: "180" },
  { "id": "155", price_in: "349" },
  { "id": "156", price_in: "292.5" },
  { "id": "157", price_in: "225" },
  { "id": "158", price_in: "180" },
  { "id": "159", price_in: "10" },
];

export const updateBookPrices = async () => {
  try {
    console.log("\n=======================================================");
    console.log("          UPDATE BOOK PRICES VIA LEGACY ID");
    console.log("=======================================================\n");

    logger.info("Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("Connected to MongoDB successfully");

    // Retrieve default seller if available for listing synchronization
    const defaultSeller =
      (await UserModel.findOne({ role: "SELLER" })) ||
      (await UserModel.findOne({ role: "ADMIN" }));

    let updatedBooksCount = 0;
    let notFoundCount = 0;
    let listingsUpdatedCount = 0;
    const notFoundIds: string[] = [];

    for (const item of legacyBookPrices) {
      const parsedPrice = parseFloat(item.price_in) || 0;
      const priceNum = parsedPrice >= 0 ? parsedPrice : 0;
      const idStr = item.id.trim();
      const padded4 = idStr.padStart(4, "0");
      const bookIdPatterns = [
        idStr,
        `0141${padded4}`,
        `0205${padded4}`,
      ];

      const book = await BookModel.findOneAndUpdate(
        {
          $or: [
            { legacyId: idStr },
            { legacyBookId: { $in: bookIdPatterns } },
          ],
        },
        {
          $set: {
            price: priceNum,
            priceIn: priceNum,
            ...(idStr ? { legacyId: idStr } : {}),
          },
        },
        { returnDocument: "after" },
      );

      if (book) {
        updatedBooksCount++;

        // Keep BookListing synchronized
        if (defaultSeller) {
          const sellingPriceInPaise = Math.round(priceNum * 100);

          const existingListing = await BookListingModel.findOne({
            book: book._id,
            seller: defaultSeller._id,
          });

          if (existingListing) {
            existingListing.sellingPriceInPaise = sellingPriceInPaise;
            if (existingListing.mrpInPaise < sellingPriceInPaise) {
              existingListing.mrpInPaise = sellingPriceInPaise;
            }
            await existingListing.save();
            listingsUpdatedCount++;
          } else if (priceNum > 0) {
            await BookListingModel.create({
              book: book._id,
              seller: defaultSeller._id,
              mrpInPaise: sellingPriceInPaise,
              sellingPriceInPaise,
              stock: 50,
              sku: `SKU-IN-${book.legacyBookId || book.legacyId || book._id}`,
              isActive: true,
            });
            listingsUpdatedCount++;
          }
        }
      } else {
        notFoundCount++;
        notFoundIds.push(item.id);
      }
    }

    console.log("\n=======================================================");
    console.log("               UPDATE SUMMARY REPORT");
    console.log("=======================================================");
    console.log(`  Total Price Items Input    : ${legacyBookPrices.length}`);
    console.log(`  Books Successfully Updated : ${updatedBooksCount} ✅`);
    console.log(`  Listings Synchronized      : ${listingsUpdatedCount} ✅`);
    console.log(`  Books Not Found (Legacy ID): ${notFoundCount}`);
    if (notFoundIds.length > 0) {
      console.log(`  Unmatched Legacy IDs       : ${notFoundIds.join(", ")}`);
    }

    const sampleUpdated = await BookModel.find({ legacyId: { $in: ["4", "5", "6", "10", "15", "101"] } })
      .select("title legacyId price priceIn")
      .lean();

    console.log("\nSample Verified Updated Books:");
    sampleUpdated.forEach((b) => {
      console.log(`  - [ID: ${b.legacyId}] "${b.title}": price = ₹${b.price}, priceIn = ₹${b.priceIn}`);
    });
    console.log("=======================================================\n");
  } catch (error) {
    logger.error({ error }, "Error updating book prices");
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

// Auto-run if executed directly
if (process.argv[1]?.includes("update-book-prices")) {
  updateBookPrices()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

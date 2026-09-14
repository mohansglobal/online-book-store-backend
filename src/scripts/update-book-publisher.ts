import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { PublisherModel, BookModel, BookListingModel } from "../models/index.js";

async function main() {
  await connectDB();

  const publisherId = "6a9fb2338fc3e365f454dc7d";
  const bookIds = [
    "6a9fd2be463e5a288a8192bc",
    "6a9fd2be463e5a288a8192b2",
  ];

  console.log(`Checking publisher: ${publisherId}...`);
  const publisher = await PublisherModel.findById(publisherId).lean();
  if (!publisher) {
    console.error(`❌ Publisher not found with ID: ${publisherId}`);
  } else {
    console.log(`✅ Found publisher: "${publisher.name}" (slug: ${publisher.slug})`);
  }

  for (const bookId of bookIds) {
    const book = await BookModel.findById(bookId);
    if (!book) {
      console.log(`❌ Book not found with ID: ${bookId}`);
      continue;
    }
    console.log(`Found book: "${book.title}" (Current Publisher: ${book.publisher})`);

    book.publisher = new mongoose.Types.ObjectId(publisherId);
    await book.save();
    console.log(`✅ Updated Book "${book.title}" with publisher: ${publisherId}`);

    // Also update any existing listings for this book that might not have publisher set or have previous publisher
    const listingUpdateResult = await BookListingModel.updateMany(
      { book: book._id },
      { $set: { publisher: new mongoose.Types.ObjectId(publisherId) } }
    );
    console.log(`  Listings updated for this book: ${listingUpdateResult.modifiedCount}`);
  }

  await mongoose.disconnect();
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error executing script:", err);
  process.exit(1);
});

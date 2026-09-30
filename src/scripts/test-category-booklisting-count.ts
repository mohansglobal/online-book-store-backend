import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { BookListingModel } from "../models/book-listing.model.js";
import { BookModel } from "../models/book.model.js";
import { CategoryModel } from "../models/category.model.js";

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || "");
  
  const totalListings = await BookListingModel.countDocuments();
  const activeListings = await BookListingModel.countDocuments({ isActive: true });
  console.log("Total listings:", totalListings, "Active listings:", activeListings);
  
  const categories = await CategoryModel.find().limit(9).lean();
  const categoryIds = categories.map((c) => c._id);

  console.time("aggregate-listings");
  const bookCounts = await BookListingModel.aggregate([
    { $match: { isActive: true } },
    {
      $lookup: {
        from: "books",
        localField: "book",
        foreignField: "_id",
        as: "bookDoc",
      },
    },
    { $unwind: "$bookDoc" },
    {
      $match: {
        "bookDoc.status": "ACTIVE",
        "bookDoc.categories": { $in: categoryIds },
      },
    },
    { $unwind: "$bookDoc.categories" },
    {
      $group: {
        _id: "$bookDoc.categories",
        count: { $sum: 1 },
      },
    },
  ]);
  console.timeEnd("aggregate-listings");
  console.log("Counts found:", bookCounts);

  console.time("hasBooks-check");
  const activeBookIds = await BookListingModel.find({ isActive: true }).distinct("book");
  const categoriesWithListings = await BookModel.find({
    _id: { $in: activeBookIds },
    status: "ACTIVE",
  }).distinct("categories");
  console.timeEnd("hasBooks-check");
  console.log("Categories with active listings count:", categoriesWithListings.length);

  await mongoose.disconnect();
}

run().catch(console.error);

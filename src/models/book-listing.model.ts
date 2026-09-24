import { Schema, model, type InferSchemaType } from "mongoose";

const bookListingSchema = new Schema(
  {
    book: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mrpInPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "MRP must be an integer in paise",
      },
    },
    sellingPriceInPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        {
          validator: Number.isInteger,
          message: "Selling price must be an integer in paise",
        },
        {
          validator: function (this: { mrpInPaise: number }, value: number) {
            return value <= this.mrpInPaise;
          },
          message: "Selling price cannot exceed MRP",
        },
      ],
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "Stock must be a whole number",
      },
    },
    sku: {
      type: String,
      trim: true,
    },
    listingImages: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

bookListingSchema.virtual("price").get(function () {
  return typeof this.sellingPriceInPaise === "number"
    ? Math.round(this.sellingPriceInPaise / 100)
    : 0;
});

bookListingSchema.virtual("priceInPaise").get(function () {
  return this.sellingPriceInPaise ?? 0;
});

bookListingSchema.virtual("mrp").get(function () {
  return typeof this.mrpInPaise === "number"
    ? Math.round(this.mrpInPaise / 100)
    : 0;
});

bookListingSchema.virtual("discountPercentage").get(function () {
  if (!this.mrpInPaise || this.mrpInPaise <= 0) return 0;
  return Math.round(
    ((this.mrpInPaise - this.sellingPriceInPaise) / this.mrpInPaise) * 100,
  );
});

bookListingSchema.virtual("effectiveImages").get(function (this: {
  listingImages?: string[];
  book?: { images?: string[]; coverImage?: string };
}) {
  const cover =
    this.book && typeof this.book === "object" && this.book.coverImage
      ? this.book.coverImage.trim()
      : "";

  const extraImages = Array.isArray(this.listingImages)
    ? this.listingImages.filter(
        (img) => typeof img === "string" && img.trim().length > 0,
      )
    : [];

  const images: string[] = [];
  if (cover) {
    images.push(cover);
  }

  for (const img of extraImages) {
    const trimmed = img.trim();
    if (!images.includes(trimmed)) {
      images.push(trimmed);
    }
  }

  if (
    images.length === 0 &&
    this.book &&
    typeof this.book === "object" &&
    Array.isArray(this.book.images)
  ) {
    for (const img of this.book.images) {
      if (
        typeof img === "string" &&
        img.trim().length > 0 &&
        !images.includes(img.trim())
      ) {
        images.push(img.trim());
      }
    }
  }

  return images;
});

bookListingSchema.index({ book: 1, seller: 1 }, { unique: true });
bookListingSchema.index({ seller: 1 });
bookListingSchema.index({ book: 1, isActive: 1 });
bookListingSchema.index({ sellingPriceInPaise: 1 });

export type BookListingDocument = InferSchemaType<typeof bookListingSchema>;

export const BookListingModel = model("BookListing", bookListingSchema);

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

bookListingSchema.virtual("discountPercentage").get(function () {
  if (!this.mrpInPaise || this.mrpInPaise <= 0) return 0;
  return Math.round(
    ((this.mrpInPaise - this.sellingPriceInPaise) / this.mrpInPaise) * 100,
  );
});

bookListingSchema.index({ book: 1, seller: 1 }, { unique: true });
bookListingSchema.index({ seller: 1 });
bookListingSchema.index({ book: 1, isActive: 1 });
bookListingSchema.index({ sellingPriceInPaise: 1 });

export type BookListingDocument = InferSchemaType<typeof bookListingSchema>;

export const BookListingModel = model("BookListing", bookListingSchema);

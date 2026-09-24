import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const commaSeparatedListSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    const rawItems = Array.isArray(val)
      ? val.flatMap((s) => s.split(","))
      : val.split(",");

    const cleaned = rawItems
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return cleaned.length > 0 ? cleaned : undefined;
  });

export const bookListingQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    book: z.string().trim().regex(objectIdRegex, "Invalid book ID").optional(),
    seller: z.string().trim().regex(objectIdRegex, "Invalid seller ID").optional(),
    category: commaSeparatedListSchema,
    categories: commaSeparatedListSchema,
    author: commaSeparatedListSchema,
    authors: commaSeparatedListSchema,
    publisher: commaSeparatedListSchema,
    publishers: commaSeparatedListSchema,
    country: commaSeparatedListSchema,
    language: z.string().trim().optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    homesection: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((val) => val === true || val === "true")
      .optional(),
    groupByBook: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((val) => val === true || val === "true")
      .optional(),
    sortBy: z
      .enum([
        "sellingPriceInPaise",
        "stock",
        "createdAt",
        "publicationDate",
        "publishedDate",
        "publishedYear",
        "recent",
        "price_asc",
        "price_desc",
        "price-asc",
        "price-desc",
        "price_low_to_high",
        "price_high_to_low",
        "price-low-to-high",
        "price-high-to-low",
        "newest",
        "oldest",
        "title",
        "title_asc",
        "title_desc",
        "title-asc",
        "title-desc",
        "title_az",
        "title_za",
        "title-az",
        "title-za",
        "a_to_z",
        "z_to_a",
        "a-z",
        "z-a",
        "name",
        "name_asc",
        "name_desc",
      ])
      .default("sellingPriceInPaise"),
    sortOrder: z
      .enum(["asc", "desc", "lowToHigh", "highToLow", "1", "-1"])
      .default("asc"),
  })
  .transform((data) => {
    const categories = Array.from(
      new Set([...(data.category ?? []), ...(data.categories ?? [])]),
    );
    const authors = Array.from(
      new Set([...(data.author ?? []), ...(data.authors ?? [])]),
    );
    const publishers = Array.from(
      new Set([...(data.publisher ?? []), ...(data.publishers ?? [])]),
    );

    let sortBy: "sellingPriceInPaise" | "stock" | "createdAt" | "title" = "sellingPriceInPaise";
    let sortOrder: "asc" | "desc" =
      data.sortOrder === "lowToHigh" || data.sortOrder === "1"
        ? "asc"
        : data.sortOrder === "highToLow" || data.sortOrder === "-1"
          ? "desc"
          : data.sortOrder;

    const rawSortBy = data.sortBy;
    if (
      rawSortBy === "price_asc" ||
      rawSortBy === "price-asc" ||
      rawSortBy === "price_low_to_high" ||
      rawSortBy === "price-low-to-high"
    ) {
      sortBy = "sellingPriceInPaise";
      sortOrder = "asc";
    } else if (
      rawSortBy === "price_desc" ||
      rawSortBy === "price-desc" ||
      rawSortBy === "price_high_to_low" ||
      rawSortBy === "price-high-to-low"
    ) {
      sortBy = "sellingPriceInPaise";
      sortOrder = "desc";
    } else if (
      rawSortBy === "newest" ||
      rawSortBy === "recent" ||
      rawSortBy === "publicationDate" ||
      rawSortBy === "publishedDate" ||
      rawSortBy === "publishedYear"
    ) {
      sortBy = "createdAt";
      sortOrder = data.sortOrder === "asc" ? "asc" : "desc";
    } else if (rawSortBy === "oldest") {
      sortBy = "createdAt";
      sortOrder = "asc";
    } else if (rawSortBy === "title" || rawSortBy === "name") {
      sortBy = "title";
    } else if (
      rawSortBy === "title_asc" ||
      rawSortBy === "title-asc" ||
      rawSortBy === "title_az" ||
      rawSortBy === "title-az" ||
      rawSortBy === "a_to_z" ||
      rawSortBy === "a-z" ||
      rawSortBy === "name_asc"
    ) {
      sortBy = "title";
      sortOrder = "asc";
    } else if (
      rawSortBy === "title_desc" ||
      rawSortBy === "title-desc" ||
      rawSortBy === "title_za" ||
      rawSortBy === "title-za" ||
      rawSortBy === "z_to_a" ||
      rawSortBy === "z-a" ||
      rawSortBy === "name_desc"
    ) {
      sortBy = "title";
      sortOrder = "desc";
    } else if (
      rawSortBy === "sellingPriceInPaise" ||
      rawSortBy === "stock" ||
      rawSortBy === "createdAt"
    ) {
      sortBy = rawSortBy;
    }

    return {
      page: data.page,
      limit: data.limit,
      search: data.search,
      book: data.book,
      seller: data.seller,
      category: categories.length > 0 ? categories : undefined,
      author: authors.length > 0 ? authors : undefined,
      publisher: publishers.length > 0 ? publishers : undefined,
      country: data.country,
      language: data.language,
      isActive: data.isActive,
      minPrice: data.minPrice,
      maxPrice: data.maxPrice,
      sortBy,
      sortOrder,
      homesection: data.homesection || data.groupByBook,
    };
  });

export type BookListingQueryInput = z.infer<typeof bookListingQuerySchema>;

export const bookListingParamSchema = z.object({
  id: z.string().trim().regex(objectIdRegex, "Invalid listing ID"),
});

export type BookListingParamInput = z.infer<typeof bookListingParamSchema>;

const objectIdOrArray = z.union([
  z.string().trim().regex(objectIdRegex, "Invalid ID format"),
  z.array(z.string().trim().regex(objectIdRegex, "Invalid ID format")),
]);

export const createBookListingSchema = z
  .object({
    book: z.string().trim().regex(objectIdRegex, "Invalid book ID format").optional(),
    isbn: z.string().trim().optional(),
    title: z.string().trim().max(250).optional(),
    titleBn: z.string().trim().max(250).optional(),
    description: z.string().trim().optional(),
    author: objectIdOrArray.optional(),
    authors: objectIdOrArray.optional(),
    publisher: z.string().trim().regex(objectIdRegex, "Invalid publisher ID format").optional(),
    category: objectIdOrArray.optional(),
    categories: objectIdOrArray.optional(),
    country: z.string().trim().regex(objectIdRegex, "Invalid country ID format").optional(),
    checkCountry: z.string().trim().regex(objectIdRegex, "Invalid country ID format").optional(),
    language: z.string().trim().optional(),
    searchTag: z.union([z.string(), z.array(z.string())]).optional(),
    searchTags: z.union([z.string(), z.array(z.string())]).optional(),
    format: z.string().trim().optional(),
    edition: z.string().trim().optional(),
    pages: z.coerce.number().int().positive().optional(),
    noOfPage: z.coerce.number().int().positive().optional(),
    coverImage: z.string().trim().optional(),
    images: z.array(z.string().trim()).optional(),
    price: z.coerce.number().nonnegative().optional(),
    priceIn: z.coerce.number().nonnegative().optional(),
    priceMrp: z.coerce.number().nonnegative().optional(),
    mrp: z.coerce.number().nonnegative().optional(),
    mrpPrice: z.coerce.number().nonnegative().optional(),
    mrpInPaise: z.coerce
      .number()
      .int("MRP must be an integer in paise")
      .nonnegative("MRP cannot be negative")
      .optional(),
    sellingPrice: z.coerce.number().nonnegative().optional(),
    sellingPriceInPaise: z.coerce
      .number()
      .int("Selling price must be an integer in paise")
      .nonnegative("Selling price cannot be negative")
      .optional(),
    priceInPaise: z.coerce
      .number()
      .int("Price must be an integer in paise")
      .nonnegative("Price cannot be negative")
      .optional(),
    stock: z.coerce
      .number()
      .int("Stock must be an integer")
      .nonnegative("Stock cannot be negative")
      .optional()
      .default(0),
    sku: z.string().trim().optional(),
    listingImages: z.array(z.string().trim()).optional().default([]),
    isActive: z.boolean().optional().default(true),
  })
  .transform((data) => {
    // 1. Resolve MRP in paise
    let mrpInPaise = data.mrpInPaise;
    if (mrpInPaise === undefined) {
      const rawMrpInRupees = data.priceMrp ?? data.mrpPrice ?? data.mrp;
      if (rawMrpInRupees !== undefined) {
        mrpInPaise = Math.round(rawMrpInRupees * 100);
      }
    }

    // 2. Resolve Selling Price in paise
    let sellingPriceInPaise = data.sellingPriceInPaise ?? data.priceInPaise;
    if (sellingPriceInPaise === undefined) {
      const rawSellingInRupees = data.sellingPrice ?? data.price ?? data.priceIn;
      if (rawSellingInRupees !== undefined) {
        sellingPriceInPaise = Math.round(rawSellingInRupees * 100);
      }
    }

    // 3. Fallbacks if only one value was provided
    if (mrpInPaise === undefined && sellingPriceInPaise !== undefined) {
      mrpInPaise = sellingPriceInPaise;
    }
    if (sellingPriceInPaise === undefined && mrpInPaise !== undefined) {
      sellingPriceInPaise = mrpInPaise;
    }

    const rawAuthors = [
      ...(data.authors ? (Array.isArray(data.authors) ? data.authors : [data.authors]) : []),
      ...(data.author ? (Array.isArray(data.author) ? data.author : [data.author]) : []),
    ];
    const authors = Array.from(new Set(rawAuthors));

    const rawCategories = [
      ...(data.categories ? (Array.isArray(data.categories) ? data.categories : [data.categories]) : []),
      ...(data.category ? (Array.isArray(data.category) ? data.category : [data.category]) : []),
    ];
    const categories = Array.from(new Set(rawCategories));

    const rawTags = [
      ...(data.searchTags
        ? Array.isArray(data.searchTags)
          ? data.searchTags
          : data.searchTags.split(",")
        : []),
      ...(data.searchTag
        ? Array.isArray(data.searchTag)
          ? data.searchTag
          : data.searchTag.split(",")
        : []),
    ]
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const searchTags = Array.from(new Set(rawTags));

    return {
      book: data.book,
      isbn: data.isbn?.trim(),
      title: data.title,
      titleBn: data.titleBn,
      description: data.description,
      authors: authors.length > 0 ? authors : undefined,
      publisher: data.publisher,
      categories: categories.length > 0 ? categories : undefined,
      country: data.country ?? data.checkCountry,
      language: data.language,
      searchTags: searchTags.length > 0 ? searchTags : undefined,
      format: data.format,
      edition: data.edition,
      pages: data.pages ?? data.noOfPage,
      coverImage: data.coverImage,
      images: data.images,
      mrpInPaise: mrpInPaise ?? 0,
      sellingPriceInPaise: sellingPriceInPaise ?? 0,
      stock: data.stock,
      sku: data.sku,
      listingImages:
        data.listingImages && data.listingImages.length > 0
          ? data.listingImages
          : data.images && data.images.length > 0
            ? data.images
            : [],
      isActive: data.isActive,
    };
  })
  .refine((data) => data.book || data.isbn || data.title, {
    message: "Either book ID, ISBN, or title must be provided to create a listing",
    path: ["book"],
  })
  .refine((data) => data.sellingPriceInPaise <= data.mrpInPaise, {
    message: "Selling price cannot exceed MRP",
    path: ["sellingPriceInPaise"],
  });

export type CreateBookListingInput = z.input<typeof createBookListingSchema>;
export type CreateBookListingOutput = z.output<typeof createBookListingSchema>;

export const updateBookListingSchema = z
  .object({
    price: z.coerce.number().nonnegative().optional(),
    priceIn: z.coerce.number().nonnegative().optional(),
    priceMrp: z.coerce.number().nonnegative().optional(),
    mrp: z.coerce.number().nonnegative().optional(),
    mrpPrice: z.coerce.number().nonnegative().optional(),
    mrpInPaise: z.coerce
      .number()
      .int("MRP must be an integer in paise")
      .nonnegative("MRP cannot be negative")
      .optional(),
    sellingPrice: z.coerce.number().nonnegative().optional(),
    sellingPriceInPaise: z.coerce
      .number()
      .int("Selling price must be an integer in paise")
      .nonnegative("Selling price cannot be negative")
      .optional(),
    priceInPaise: z.coerce
      .number()
      .int("Price must be an integer in paise")
      .nonnegative("Price cannot be negative")
      .optional(),
    stock: z.coerce
      .number()
      .int("Stock must be an integer")
      .nonnegative("Stock cannot be negative")
      .optional(),
    sku: z.string().trim().optional(),
    images: z.array(z.string().trim()).optional(),
    listingImages: z.array(z.string().trim()).optional(),
    isActive: z.boolean().optional(),
  })
  .transform((data) => {
    let mrpInPaise = data.mrpInPaise;
    if (mrpInPaise === undefined) {
      const rawMrpInRupees = data.priceMrp ?? data.mrpPrice ?? data.mrp;
      if (rawMrpInRupees !== undefined) {
        mrpInPaise = Math.round(rawMrpInRupees * 100);
      }
    }

    let sellingPriceInPaise = data.sellingPriceInPaise ?? data.priceInPaise;
    if (sellingPriceInPaise === undefined) {
      const rawSellingInRupees = data.sellingPrice ?? data.price ?? data.priceIn;
      if (rawSellingInRupees !== undefined) {
        sellingPriceInPaise = Math.round(rawSellingInRupees * 100);
      }
    }

    const resolvedListingImages =
      data.listingImages !== undefined
        ? data.listingImages
        : data.images !== undefined
          ? data.images
          : undefined;

    return {
      mrpInPaise,
      sellingPriceInPaise,
      stock: data.stock,
      sku: data.sku,
      listingImages: resolvedListingImages,
      isActive: data.isActive,
    };
  })
  .refine(
    (data) => {
      if (
        data.mrpInPaise !== undefined &&
        data.sellingPriceInPaise !== undefined
      ) {
        return data.sellingPriceInPaise <= data.mrpInPaise;
      }
      return true;
    },
    {
      message: "Selling price cannot exceed MRP",
      path: ["sellingPriceInPaise"],
    },
  );

export type UpdateBookListingInput = z.input<typeof updateBookListingSchema>;
export type UpdateBookListingOutput = z.output<typeof updateBookListingSchema>;

export const myBookListingQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    isActive: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((val) => (typeof val === "boolean" ? val : val === "true"))
      .optional(),
    inStock: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((val) => (typeof val === "boolean" ? val : val === "true"))
      .optional(),
    sortBy: z
      .enum([
        "createdAt",
        "sellingPriceInPaise",
        "stock",
        "mrpInPaise",
        "title",
        "recent",
        "newest",
        "oldest",
        "price_asc",
        "price_desc",
        "price-asc",
        "price-desc",
        "stock_asc",
        "stock_desc",
        "title_asc",
        "title_desc",
      ])
      .default("createdAt"),
    sortOrder: z
      .enum(["asc", "desc", "lowToHigh", "highToLow", "1", "-1"])
      .default("desc"),
  })
  .transform((data) => {
    let sortBy:
      | "createdAt"
      | "sellingPriceInPaise"
      | "stock"
      | "mrpInPaise"
      | "title" = "createdAt";
    let sortOrder: "asc" | "desc" =
      data.sortOrder === "lowToHigh" || data.sortOrder === "1"
        ? "asc"
        : data.sortOrder === "highToLow" || data.sortOrder === "-1"
          ? "desc"
          : data.sortOrder;

    const rawSortBy = data.sortBy;
    if (rawSortBy === "price_asc" || rawSortBy === "price-asc") {
      sortBy = "sellingPriceInPaise";
      sortOrder = "asc";
    } else if (rawSortBy === "price_desc" || rawSortBy === "price-desc") {
      sortBy = "sellingPriceInPaise";
      sortOrder = "desc";
    } else if (rawSortBy === "newest" || rawSortBy === "recent") {
      sortBy = "createdAt";
      sortOrder = "desc";
    } else if (rawSortBy === "oldest") {
      sortBy = "createdAt";
      sortOrder = "asc";
    } else if (rawSortBy === "stock_asc") {
      sortBy = "stock";
      sortOrder = "asc";
    } else if (rawSortBy === "stock_desc") {
      sortBy = "stock";
      sortOrder = "desc";
    } else if (rawSortBy === "title_asc") {
      sortBy = "title";
      sortOrder = "asc";
    } else if (rawSortBy === "title_desc") {
      sortBy = "title";
      sortOrder = "desc";
    } else {
      sortBy = rawSortBy as
        | "createdAt"
        | "sellingPriceInPaise"
        | "stock"
        | "mrpInPaise"
        | "title";
    }

    return {
      page: data.page,
      limit: data.limit,
      search: data.search,
      isActive: data.isActive,
      inStock: data.inStock,
      sortBy,
      sortOrder,
    };
  });

export type MyBookListingQueryInput = z.input<typeof myBookListingQuerySchema>;

export const updateStockSchema = z
  .object({
    operation: z.enum(["increase", "decrease", "set"], {
      message: "Operation must be 'increase', 'decrease', or 'set'",
    }),
    quantity: z.coerce
      .number()
      .int("Quantity must be an integer")
      .nonnegative("Quantity cannot be negative"),
  })
  .refine(
    (data) => {
      if (
        (data.operation === "increase" || data.operation === "decrease") &&
        data.quantity <= 0
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "Quantity must be greater than 0 for increase or decrease operations",
      path: ["quantity"],
    },
  );

export type UpdateStockInput = z.infer<typeof updateStockSchema>;

export const toggleBookListingStatusSchema = z.object({
  isActive: z.boolean().optional(),
});

export type ToggleBookListingStatusInput = z.infer<typeof toggleBookListingStatusSchema>;

export const applyListingDiscountSchema = z
  .object({
    discountType: z
      .enum(["PERCENTAGE", "FLAT", "percentage", "flat"])
      .transform((val) => val.toUpperCase() as "PERCENTAGE" | "FLAT"),
    discountValue: z.coerce
      .number()
      .min(0, "Discount value cannot be negative"),
    mrp: z.coerce
      .number()
      .positive("MRP in rupees must be positive")
      .optional(),
    mrpInPaise: z.coerce
      .number()
      .int("MRP in paise must be an integer")
      .positive("MRP in paise must be positive")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.discountType === "PERCENTAGE" && data.discountValue > 100) {
        return false;
      }
      return true;
    },
    {
      message: "Percentage discount cannot exceed 100%",
      path: ["discountValue"],
    },
  );

export type ApplyListingDiscountInput = z.infer<typeof applyListingDiscountSchema>;






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
    priceMrp: z.coerce.number().nonnegative().optional(),
    mrp: z.coerce.number().nonnegative().optional(),
    mrpInPaise: z.coerce
      .number()
      .int("MRP must be an integer in paise")
      .nonnegative("MRP cannot be negative")
      .optional(),
    sellingPriceInPaise: z.coerce
      .number()
      .int("Selling price must be an integer in paise")
      .nonnegative("Selling price cannot be negative")
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
    let mrpInPaise = data.mrpInPaise;
    if (mrpInPaise === undefined) {
      const rawMrp = data.priceMrp ?? data.mrp ?? data.price;
      if (rawMrp !== undefined) {
        mrpInPaise = Math.round(rawMrp * 100);
      }
    }

    let sellingPriceInPaise = data.sellingPriceInPaise;
    if (sellingPriceInPaise === undefined) {
      const rawSelling = data.price ?? data.mrp ?? data.priceMrp;
      if (rawSelling !== undefined) {
        sellingPriceInPaise = Math.round(rawSelling * 100);
      }
    }

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
      listingImages: data.listingImages,
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
    mrpInPaise: z.coerce
      .number()
      .int("MRP must be an integer in paise")
      .nonnegative("MRP cannot be negative")
      .optional(),
    sellingPriceInPaise: z.coerce
      .number()
      .int("Selling price must be an integer in paise")
      .nonnegative("Selling price cannot be negative")
      .optional(),
    stock: z.coerce
      .number()
      .int("Stock must be an integer")
      .nonnegative("Stock cannot be negative")
      .optional(),
    sku: z.string().trim().optional(),
    listingImages: z.array(z.string().trim()).optional(),
    isActive: z.boolean().optional(),
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


import http from "http";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import app from "../app.js";
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

type TestResult = {
  section: string;
  testName: string;
  endpoint: string;
  expectedStatus: number | string;
  actualStatus: number | string;
  passed: boolean;
  notes?: string;
};

const results: TestResult[] = [];

const recordTest = (
  section: string,
  testName: string,
  endpoint: string,
  expectedStatus: number | string,
  actualStatus: number | string,
  passed: boolean,
  notes?: string,
) => {
  results.push({
    section,
    testName,
    endpoint,
    expectedStatus,
    actualStatus,
    passed,
    notes,
  });

  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`  [${icon}] ${testName} (${endpoint}) -> Expected: ${expectedStatus}, Got: ${actualStatus}${notes ? ` | ${notes}` : ""}`);
};

const runCatalogVerification = async () => {
  let server: http.Server | null = null;

  try {
    console.log("\n=======================================================");
    console.log("   ONLINE BOOKSTORE END-TO-END CATALOG & AUTH API TEST");
    console.log("=======================================================\n");

    logger.info("Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    logger.info("MongoDB connected successfully");

    // Start Express app on ephemeral port for real HTTP testing
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine server port");
    }
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    logger.info(`Ephemeral HTTP Server running at ${baseUrl}`);

    const TEST_PREFIX = `cat_${Date.now()}`;

    // Helper fetch wrapper
    const apiRequest = async (
      path: string,
      options: {
        method?: string;
        body?: unknown;
        token?: string;
        headers?: Record<string, string>;
      } = {},
    ) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
      };

      if (options.token) {
        headers["Authorization"] = `Bearer ${options.token}`;
      }

      const res = await fetch(`${baseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Not JSON
      }

      return {
        status: res.status,
        headers: res.headers,
        data,
      };
    };

    // ==========================================
    // 0. BASELINE ENTITIES SETUP
    // ==========================================
    console.log("\n--- [0. SETUP BASELINE ENTITIES] ---");
    const uniqueCountryCode = `C${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const country = await CountryModel.create({
      name: `Catalog Test Country ${TEST_PREFIX}`,
      code: uniqueCountryCode,
      phoneCode: "+880",
      currency: "BDT",
      isActive: true,
    });

    const author1 = await AuthorModel.create({
      name: `Sir Arthur Conan Doyle ${TEST_PREFIX}`,
      slug: `arthur-conan-doyle-${TEST_PREFIX}`,
      bio: "Scottish writer and physician, created Sherlock Holmes.",
      isActive: true,
    });

    const author2 = await AuthorModel.create({
      name: `Leo Tolstoy ${TEST_PREFIX}`,
      slug: `leo-tolstoy-${TEST_PREFIX}`,
      bio: "Russian master of realistic fiction.",
      isActive: true,
    });

    const oxfordPublisher = await PublisherModel.create({
      name: `Oxford University Press ${TEST_PREFIX}`,
      slug: `oxford-press-${TEST_PREFIX}`,
      email: `oxford_${TEST_PREFIX}@example.com`,
      phone: `+880${Math.floor(100000000 + Math.random() * 900000000)}`,
      website: "https://global.oup.com",
      description: "Major university press publisher.",
      isActive: true,
    });

    const categoryFiction = await CategoryModel.create({
      name: `Detective & Mystery ${TEST_PREFIX}`,
      slug: `detective-mystery-${TEST_PREFIX}`,
      description: "Mystery, thriller, and detective novels",
      isActive: true,
    });

    const categoryClassics = await CategoryModel.create({
      name: `World Classics ${TEST_PREFIX}`,
      slug: `world-classics-${TEST_PREFIX}`,
      description: "Time-tested literary classics",
      isActive: true,
    });

    console.log("  Baseline country, authors, publisher, and categories ready.");

    // ==========================================
    // 1. AUTH & RBAC ENDPOINTS (/auth)
    // ==========================================
    console.log("\n--- [1. AUTH & RBAC ENDPOINTS] ---");

    // 1.1 Register Buyer
    const buyerEmail = `buyer_${TEST_PREFIX}@example.com`;
    const buyerMobile = `+880${Math.floor(100000000 + Math.random() * 900000000)}`;
    const regBuyerRes = await apiRequest("/auth/register", {
      method: "POST",
      body: {
        name: "Alice Buyer",
        email: buyerEmail,
        password: "Password123!",
        mobileNumber: buyerMobile,
        role: "BUYER",
        country: country._id.toString(),
      },
    });
    recordTest(
      "Auth",
      "Register Buyer",
      "POST /auth/register",
      201,
      regBuyerRes.status,
      regBuyerRes.status === 201 && regBuyerRes.data?.data?.role === "BUYER",
    );

    // 1.2 Register Independent Seller
    const sellerEmail = `seller_bob_${TEST_PREFIX}@example.com`;
    const sellerMobile = `+880${Math.floor(100000000 + Math.random() * 900000000)}`;
    const regSellerRes = await apiRequest("/auth/register", {
      method: "POST",
      body: {
        name: "Bob Independent Seller",
        email: sellerEmail,
        password: "Password123!",
        mobileNumber: sellerMobile,
        role: "SELLER",
        country: country._id.toString(),
      },
    });
    recordTest(
      "Auth",
      "Register Independent Seller",
      "POST /auth/register",
      201,
      regSellerRes.status,
      regSellerRes.status === 201 && regSellerRes.data?.data?.role === "SELLER" && !regSellerRes.data?.data?.publisher,
    );

    // 1.3 Register Publisher Seller (Matching Publisher Email -> Auto-linkage!)
    const publisherSellerEmail = oxfordPublisher.email!;
    const publisherSellerMobile = `+880${Math.floor(100000000 + Math.random() * 900000000)}`;
    const regPubSellerRes = await apiRequest("/auth/register", {
      method: "POST",
      body: {
        name: "Oxford Press Official Seller",
        email: publisherSellerEmail,
        password: "Password123!",
        mobileNumber: publisherSellerMobile,
        role: "SELLER",
        country: country._id.toString(),
      },
    });
    const autoLinkedPublisher = regPubSellerRes.data?.data?.publisher?.id === oxfordPublisher._id.toString();
    recordTest(
      "Auth",
      "Register Publisher-Linked Seller (Auto Linkage)",
      "POST /auth/register",
      201,
      regPubSellerRes.status,
      regPubSellerRes.status === 201 && autoLinkedPublisher,
      "Auto-linked seller to Oxford University Press via email",
    );

    // 1.4 Register Duplicate Email (Conflict 409)
    const dupEmailRes = await apiRequest("/auth/register", {
      method: "POST",
      body: {
        name: "Duplicate User",
        email: buyerEmail,
        password: "Password123!",
        mobileNumber: `+880${Math.floor(100000000 + Math.random() * 900000000)}`,
        role: "BUYER",
      },
    });
    recordTest(
      "Auth",
      "Reject Duplicate Email Registration",
      "POST /auth/register",
      409,
      dupEmailRes.status,
      dupEmailRes.status === 409,
    );

    // 1.5 Register Invalid Password (<8 chars -> Bad Request 400)
    const shortPassRes = await apiRequest("/auth/register", {
      method: "POST",
      body: {
        name: "Bad Pass User",
        email: `badpass_${TEST_PREFIX}@example.com`,
        password: "short",
        mobileNumber: `+880${Math.floor(100000000 + Math.random() * 900000000)}`,
        role: "BUYER",
      },
    });
    recordTest(
      "Auth",
      "Reject Invalid Schema Input (Short Password)",
      "POST /auth/register",
      400,
      shortPassRes.status,
      shortPassRes.status === 400,
    );

    // 1.6 Create Admin User in DB
    const adminPasswordHash = await bcrypt.hash("AdminSecret123!", 10);
    const adminMobile = `+880${Math.floor(100000000 + Math.random() * 900000000)}`;
    const adminUser = await UserModel.create({
      name: "Super Admin",
      email: `admin_${TEST_PREFIX}@example.com`,
      password: adminPasswordHash,
      mobileNumber: adminMobile,
      role: "ADMIN",
      country: country._id,
      isActive: true,
    });

    // 1.7 Login Tests
    const loginBuyerRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: buyerMobile, password: "Password123!" },
    });
    const buyerToken = loginBuyerRes.data?.data?.accessToken;
    const setCookies = (loginBuyerRes.headers as any).getSetCookie
      ? (loginBuyerRes.headers as any).getSetCookie()
      : [loginBuyerRes.headers.get("set-cookie") || ""];
    let buyerRefreshToken = "";
    for (const sc of setCookies) {
      const match = typeof sc === "string" ? sc.match(/refreshToken=([^;]+)/) : null;
      if (match) {
        buyerRefreshToken = match[1];
        break;
      }
    }
    recordTest(
      "Auth",
      "Login Buyer with Mobile Number",
      "POST /auth/login",
      200,
      loginBuyerRes.status,
      loginBuyerRes.status === 200 && Boolean(buyerToken) && Boolean(buyerRefreshToken),
    );

    const loginSellerRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: sellerMobile, password: "Password123!" },
    });
    const sellerToken = loginSellerRes.data?.data?.accessToken;
    recordTest(
      "Auth",
      "Login Independent Seller",
      "POST /auth/login",
      200,
      loginSellerRes.status,
      loginSellerRes.status === 200 && Boolean(sellerToken),
    );

    const loginPubSellerRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: publisherSellerMobile, password: "Password123!" },
    });
    const pubSellerToken = loginPubSellerRes.data?.data?.accessToken;
    recordTest(
      "Auth",
      "Login Publisher-Linked Seller",
      "POST /auth/login",
      200,
      loginPubSellerRes.status,
      loginPubSellerRes.status === 200 && Boolean(pubSellerToken) && Boolean(loginPubSellerRes.data?.data?.user?.publisher),
    );

    const loginAdminRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: adminMobile, password: "AdminSecret123!" },
    });
    const adminToken = loginAdminRes.data?.data?.accessToken;
    recordTest(
      "Auth",
      "Login Admin",
      "POST /auth/login",
      200,
      loginAdminRes.status,
      loginAdminRes.status === 200 && Boolean(adminToken),
    );

    // 1.8 Login with Wrong Password -> 401
    const wrongPassRes = await apiRequest("/auth/login", {
      method: "POST",
      body: { mobileNumber: buyerMobile, password: "WrongPassword999!" },
    });
    recordTest(
      "Auth",
      "Reject Invalid Login Credentials",
      "POST /auth/login",
      401,
      wrongPassRes.status,
      wrongPassRes.status === 401,
    );

    // 1.9 GET /auth/me with and without token
    const meWithoutTokenRes = await apiRequest("/auth/me");
    recordTest(
      "Auth",
      "Reject /auth/me Without Token",
      "GET /auth/me",
      401,
      meWithoutTokenRes.status,
      meWithoutTokenRes.status === 401,
    );

    const meWithBuyerRes = await apiRequest("/auth/me", { token: buyerToken });
    recordTest(
      "Auth",
      "Get Authenticated Buyer Profile",
      "GET /auth/me",
      200,
      meWithBuyerRes.status,
      meWithBuyerRes.status === 200 && meWithBuyerRes.data?.data?.email === buyerEmail,
    );

    const meWithPubSellerRes = await apiRequest("/auth/me", { token: pubSellerToken });
    recordTest(
      "Auth",
      "Get Authenticated Publisher Seller Profile with Populated Publisher",
      "GET /auth/me",
      200,
      meWithPubSellerRes.status,
      meWithPubSellerRes.status === 200 && meWithPubSellerRes.data?.data?.publisher?.name.includes("Oxford"),
    );

    // 1.10 Refresh Token Endpoint
    const refreshRes = await apiRequest("/auth/refresh-token", {
      method: "POST",
      body: { refreshToken: buyerRefreshToken },
      headers: { Cookie: `refreshToken=${buyerRefreshToken}` },
    });
    recordTest(
      "Auth",
      "Refresh Token Rotation & Access Token Reissue",
      "POST /auth/refresh-token",
      200,
      refreshRes.status,
      refreshRes.status === 200 && Boolean(refreshRes.data?.data?.accessToken),
    );

    // ==========================================
    // 2. CATEGORIES ENDPOINTS (/categories)
    // ==========================================
    console.log("\n--- [2. CATEGORIES CATALOG ENDPOINTS] ---");

    const getCategoriesRes = await apiRequest("/categories?limit=10");
    recordTest(
      "Categories",
      "List Categories with Pagination",
      "GET /categories",
      200,
      getCategoriesRes.status,
      getCategoriesRes.status === 200 && Array.isArray(getCategoriesRes.data?.data) && getCategoriesRes.data?.data?.length >= 2,
    );

    const getCatBySlugRes = await apiRequest(`/categories/${categoryFiction.slug}`);
    recordTest(
      "Categories",
      "Get Category by Slug",
      `GET /categories/${categoryFiction.slug}`,
      200,
      getCatBySlugRes.status,
      getCatBySlugRes.status === 200 && getCatBySlugRes.data?.data?.slug === categoryFiction.slug,
    );

    const getCatNotFoundRes = await apiRequest("/categories/non-existent-category-slug-999");
    recordTest(
      "Categories",
      "Return 404 for Non-Existent Category Slug",
      "GET /categories/:slug",
      404,
      getCatNotFoundRes.status,
      getCatNotFoundRes.status === 404,
    );

    // ==========================================
    // 3. AUTHORS ENDPOINTS (/authors)
    // ==========================================
    console.log("\n--- [3. AUTHORS CATALOG ENDPOINTS] ---");

    const getAuthorsRes = await apiRequest("/authors?limit=10");
    recordTest(
      "Authors",
      "List Authors with Pagination",
      "GET /authors",
      200,
      getAuthorsRes.status,
      getAuthorsRes.status === 200 && Array.isArray(getAuthorsRes.data?.data) && getAuthorsRes.data?.data?.length >= 2,
    );

    const getAuthorBySlugRes = await apiRequest(`/authors/${author1.slug}`);
    recordTest(
      "Authors",
      "Get Author by Slug",
      `GET /authors/${author1.slug}`,
      200,
      getAuthorBySlugRes.status,
      getAuthorBySlugRes.status === 200 && getAuthorBySlugRes.data?.data?.slug === author1.slug,
    );

    const getAuthorNotFoundRes = await apiRequest("/authors/non-existent-author-slug-999");
    recordTest(
      "Authors",
      "Return 404 for Non-Existent Author Slug",
      "GET /authors/:slug",
      404,
      getAuthorNotFoundRes.status,
      getAuthorNotFoundRes.status === 404,
    );

    // ==========================================
    // 4. PUBLISHERS ENDPOINTS (/publishers)
    // ==========================================
    console.log("\n--- [4. PUBLISHERS CATALOG ENDPOINTS] ---");

    const getPublishersRes = await apiRequest("/publishers");
    recordTest(
      "Publishers",
      "List Publishers",
      "GET /publishers",
      200,
      getPublishersRes.status,
      getPublishersRes.status === 200 && Array.isArray(getPublishersRes.data?.data),
    );

    const getPubByIdRes = await apiRequest(`/publishers/${oxfordPublisher.slug}`);
    recordTest(
      "Publishers",
      "Get Publisher by Slug or ID",
      `GET /publishers/${oxfordPublisher.slug}`,
      200,
      getPubByIdRes.status,
      getPubByIdRes.status === 200 && getPubByIdRes.data?.data?.slug === oxfordPublisher.slug,
    );

    // 4.1 Create Publisher with Seller Token -> 403 Forbidden
    const createPubBySellerRes = await apiRequest("/publishers", {
      method: "POST",
      token: sellerToken,
      body: {
        name: `Unauthorized Publisher ${TEST_PREFIX}`,
        email: `unauth_${TEST_PREFIX}@example.com`,
      },
    });
    recordTest(
      "Publishers",
      "Forbid Seller from Creating Publisher (Admin Only)",
      "POST /publishers",
      403,
      createPubBySellerRes.status,
      createPubBySellerRes.status === 403,
    );

    // 4.2 Create Publisher with Admin Token -> 201 Created
    const createPubByAdminRes = await apiRequest("/publishers", {
      method: "POST",
      token: adminToken,
      body: {
        name: `HarperCollins Test ${TEST_PREFIX}`,
        email: `harper_${TEST_PREFIX}@example.com`,
        phone: `+880${Math.floor(100000000 + Math.random() * 900000000)}`,
        website: "https://www.harpercollins.com",
        description: "Global publishing company.",
      },
    });
    const createdPublisherId = createPubByAdminRes.data?.data?._id;
    recordTest(
      "Publishers",
      "Admin Successfully Creates Publisher",
      "POST /publishers",
      201,
      createPubByAdminRes.status,
      createPubByAdminRes.status === 201 && Boolean(createdPublisherId),
    );

    // 4.3 GET /publishers/me for normal seller (404) vs linked publisher seller (200)
    const pubMeNormalRes = await apiRequest("/publishers/me", { token: sellerToken });
    recordTest(
      "Publishers",
      "Get My Publisher Profile (Unlinked Seller -> 404)",
      "GET /publishers/me",
      404,
      pubMeNormalRes.status,
      pubMeNormalRes.status === 404,
    );

    const pubMeLinkedRes = await apiRequest("/publishers/me", { token: pubSellerToken });
    recordTest(
      "Publishers",
      "Get My Publisher Profile (Linked Seller -> 200)",
      "GET /publishers/me",
      200,
      pubMeLinkedRes.status,
      pubMeLinkedRes.status === 200 && pubMeLinkedRes.data?.data?._id === oxfordPublisher._id.toString(),
    );

    // 4.4 Update Publisher Authorization
    // Normal seller trying to update Oxford -> 403
    const updatePubByStrangerRes = await apiRequest(`/publishers/${oxfordPublisher._id}`, {
      method: "PATCH",
      token: sellerToken,
      body: { description: "Hacked description by Bob" },
    });
    recordTest(
      "Publishers",
      "Forbid Unrelated Seller from Editing Publisher Profile",
      "PATCH /publishers/:id",
      403,
      updatePubByStrangerRes.status,
      updatePubByStrangerRes.status === 403,
    );

    // Oxford linked seller updating Oxford -> 200
    const updatePubByOwnerRes = await apiRequest(`/publishers/${oxfordPublisher._id}`, {
      method: "PATCH",
      token: pubSellerToken,
      body: { description: "Updated description by official Oxford store." },
    });
    recordTest(
      "Publishers",
      "Allow Linked Publisher Seller to Update Own Publisher Profile",
      "PATCH /publishers/:id",
      200,
      updatePubByOwnerRes.status,
      updatePubByOwnerRes.status === 200 && updatePubByOwnerRes.data?.data?.description === "Updated description by official Oxford store.",
    );

    // ==========================================
    // 5. CANONICAL BOOKS ENDPOINTS (/books)
    // ==========================================
    console.log("\n--- [5. CANONICAL BOOKS CATALOG ENDPOINTS] ---");

    // 5.1 Buyer cannot create book -> 403
    const createBookBuyerRes = await apiRequest("/books", {
      method: "POST",
      token: buyerToken,
      body: {
        title: "Unauthorized Book",
        isbn: `ISBN-BUYER-${TEST_PREFIX}`,
        description: "Test description",
        authors: [author1._id.toString()],
        publisher: oxfordPublisher._id.toString(),
        categories: [categoryFiction._id.toString()],
        coverImage: "https://example.com/cover.jpg",
      },
    });
    recordTest(
      "Books",
      "Forbid Buyer from Creating Canonical Book",
      "POST /books",
      403,
      createBookBuyerRes.status,
      createBookBuyerRes.status === 403,
    );

    // 5.2 Seller creates Canonical Book 1 (Sherlock Holmes)
    const book1Isbn = `ISBN-SHERLOCK-${TEST_PREFIX}`;
    const createBook1Res = await apiRequest("/books", {
      method: "POST",
      token: sellerToken,
      body: {
        title: "The Hound of the Baskervilles",
        isbn: book1Isbn,
        description: "Sherlock Holmes investigates mysterious deaths in Dartmoor.",
        authors: [author1._id.toString()],
        publisher: oxfordPublisher._id.toString(),
        categories: [categoryFiction._id.toString()],
        language: "English",
        searchTags: ["sherlock", "detective", "holmes"],
        format: "PAPERBACK",
        pages: 256,
        coverImage: "https://example.com/hound.jpg",
        status: "ACTIVE",
      },
    });
    const book1Id = createBook1Res.data?.data?._id;
    const book1Slug = createBook1Res.data?.data?.slug;
    recordTest(
      "Books",
      "Seller Creates Canonical Book 1",
      "POST /books",
      201,
      createBook1Res.status,
      createBook1Res.status === 201 && Boolean(book1Id),
    );

    // 5.3 Publisher Seller creates Canonical Book 2 (War and Peace)
    const book2Isbn = `ISBN-WARPEACE-${TEST_PREFIX}`;
    const createBook2Res = await apiRequest("/books", {
      method: "POST",
      token: pubSellerToken,
      body: {
        title: "War and Peace",
        isbn: book2Isbn,
        description: "Epic chronicle of Russian society during the Napoleonic Era.",
        authors: [author2._id.toString()],
        publisher: oxfordPublisher._id.toString(),
        categories: [categoryClassics._id.toString()],
        language: "English",
        searchTags: ["tolstoy", "russia", "classic"],
        format: "HARDCOVER",
        pages: 1225,
        coverImage: "https://example.com/warpeace.jpg",
        status: "ACTIVE",
      },
    });
    const book2Id = createBook2Res.data?.data?._id;
    recordTest(
      "Books",
      "Publisher Seller Creates Canonical Book 2",
      "POST /books",
      201,
      createBook2Res.status,
      createBook2Res.status === 201 && Boolean(book2Id),
    );

    // 5.4 Reject Duplicate ISBN -> 409
    const dupIsbnRes = await apiRequest("/books", {
      method: "POST",
      token: sellerToken,
      body: {
        title: "Duplicate ISBN Book",
        isbn: book1Isbn,
        description: "Another copy",
        authors: [author1._id.toString()],
        publisher: oxfordPublisher._id.toString(),
        categories: [categoryFiction._id.toString()],
        coverImage: "https://example.com/cover2.jpg",
      },
    });
    recordTest(
      "Books",
      "Reject Duplicate ISBN Registration",
      "POST /books",
      409,
      dupIsbnRes.status,
      dupIsbnRes.status === 409,
    );

    // 5.5 List Books with Query Filters
    const queryBooksRes = await apiRequest(`/books?category=${categoryFiction._id}&author=${author1._id}`);
    recordTest(
      "Books",
      "Query Books by Category and Author Filters",
      "GET /books",
      200,
      queryBooksRes.status,
      queryBooksRes.status === 200 && Array.isArray(queryBooksRes.data?.data) && queryBooksRes.data?.data?.length >= 1,
    );

    // 5.6 Get Book by Slug with Populated References
    const getBookBySlugRes = await apiRequest(`/books/${book1Slug}`);
    recordTest(
      "Books",
      "Get Book by Slug (Populated Author, Publisher, Category)",
      `GET /books/${book1Slug}`,
      200,
      getBookBySlugRes.status,
      getBookBySlugRes.status === 200 && getBookBySlugRes.data?.data?.publisher?.name.includes("Oxford") && getBookBySlugRes.data?.data?.authors?.length > 0,
    );

    // 5.7 Book Edit Ownership (Bob created Book 1, Oxford Seller cannot edit it -> 403)
    const unauthEditBookRes = await apiRequest(`/books/${book1Id}`, {
      method: "PATCH",
      token: pubSellerToken,
      body: { title: "Hacked Book Title" },
    });
    recordTest(
      "Books",
      "Forbid Non-Creator Seller from Editing Canonical Book",
      "PATCH /books/:id",
      403,
      unauthEditBookRes.status,
      unauthEditBookRes.status === 403,
    );

    // Creator Bob editing Book 1 -> 200
    const authEditBookRes = await apiRequest(`/books/${book1Id}`, {
      method: "PATCH",
      token: sellerToken,
      body: { description: "Updated authorized description by creator." },
    });
    recordTest(
      "Books",
      "Allow Creator Seller to Update Canonical Book",
      "PATCH /books/:id",
      200,
      authEditBookRes.status,
      authEditBookRes.status === 200 && authEditBookRes.data?.data?.description === "Updated authorized description by creator.",
    );

    // ==========================================
    // 6. BOOK LISTINGS & MULTI-SELLER MARKETPLACE (/listings)
    // ==========================================
    console.log("\n--- [6. BOOK LISTINGS & MULTI-SELLER MARKETPLACE ENDPOINTS] ---");

    // 6.1 Buyer cannot create listing -> 403
    const listingBuyerRes = await apiRequest("/listings", {
      method: "POST",
      token: buyerToken,
      body: {
        book: book1Id,
        mrpInPaise: 49900,
        sellingPriceInPaise: 39900,
        stock: 20,
      },
    });
    recordTest(
      "Listings",
      "Forbid Buyer from Creating Book Listing",
      "POST /listings",
      403,
      listingBuyerRes.status,
      listingBuyerRes.status === 403,
    );

    // 6.2 Selling Price > MRP -> 400 Bad Request
    const invalidPriceListingRes = await apiRequest("/listings", {
      method: "POST",
      token: sellerToken,
      body: {
        book: book1Id,
        mrpInPaise: 49900,
        sellingPriceInPaise: 59900, // Invalid: > MRP
        stock: 20,
      },
    });
    recordTest(
      "Listings",
      "Reject Listing where Selling Price > MRP",
      "POST /listings",
      400,
      invalidPriceListingRes.status,
      invalidPriceListingRes.status === 400,
    );

    // 6.3 Bob lists Book 1 (Hound of Baskervilles) at ₹399.00 (MRP ₹499.00, stock 50)
    const listing1Res = await apiRequest("/listings", {
      method: "POST",
      token: sellerToken,
      body: {
        book: book1Id,
        mrpInPaise: 49900,
        sellingPriceInPaise: 39900,
        stock: 50,
        sku: `SKU-BOB-BASKERVILLE-${TEST_PREFIX}`,
        isActive: true,
      },
    });
    const listing1Id = listing1Res.data?.data?._id;
    recordTest(
      "Listings",
      "Independent Seller Lists Canonical Book 1 at ₹399 (Stock 50)",
      "POST /listings",
      201,
      listing1Res.status,
      listing1Res.status === 201 && Boolean(listing1Id),
    );

    // 6.4 Bob creates duplicate listing for same Book 1 -> 409 Conflict
    const dupListingRes = await apiRequest("/listings", {
      method: "POST",
      token: sellerToken,
      body: {
        book: book1Id,
        mrpInPaise: 49900,
        sellingPriceInPaise: 37900,
        stock: 10,
      },
    });
    recordTest(
      "Listings",
      "Reject Duplicate Listing for Same (Book, Seller) Pair",
      "POST /listings",
      409,
      dupListingRes.status,
      dupListingRes.status === 409,
    );

    // 6.5 Oxford Press (Publisher Seller) lists SAME Book 1 at competitive price ₹349.00 (Stock 30)
    const listing2Res = await apiRequest("/listings", {
      method: "POST",
      token: pubSellerToken,
      body: {
        book: book1Id,
        mrpInPaise: 49900,
        sellingPriceInPaise: 34900,
        stock: 30,
        sku: `SKU-OXFORD-BASKERVILLE-${TEST_PREFIX}`,
        isActive: true,
      },
    });
    const listing2Id = listing2Res.data?.data?._id;
    recordTest(
      "Listings",
      "Publisher Seller Lists SAME Book 1 at Competitive ₹349 (Multi-Seller)",
      "POST /listings",
      201,
      listing2Res.status,
      listing2Res.status === 201 && Boolean(listing2Id),
    );

    // 6.6 Oxford Press lists its own Book 2 (War and Peace) at ₹750.00 (MRP ₹900.00, Stock 100)
    const listing3Res = await apiRequest("/listings", {
      method: "POST",
      token: pubSellerToken,
      body: {
        book: book2Id,
        mrpInPaise: 90000,
        sellingPriceInPaise: 75000,
        stock: 100,
        sku: `SKU-OXFORD-WARPEACE-${TEST_PREFIX}`,
        isActive: true,
      },
    });
    const listing3Id = listing3Res.data?.data?._id;
    recordTest(
      "Listings",
      "Publisher Seller Lists Own Published Book 2 at ₹750 (Stock 100)",
      "POST /listings",
      201,
      listing3Res.status,
      listing3Res.status === 201 && Boolean(listing3Id),
    );

    // 6.7 Query Listings by Book ID -> Returns 2 distinct sellers for Book 1
    const multiSellerListingsRes = await apiRequest(`/listings?book=${book1Id}`);
    const listingsCountForBook1 = multiSellerListingsRes.data?.data?.length;
    recordTest(
      "Listings",
      "Query Multi-Seller Listings for Book 1",
      `GET /listings?book=${book1Id}`,
      200,
      multiSellerListingsRes.status,
      multiSellerListingsRes.status === 200 && listingsCountForBook1 === 2,
      `Found ${listingsCountForBook1} distinct competitive seller listings for the same book`,
    );

    // 6.8 Get Single Listing by ID (Populated Book & Seller)
    const getSingleListingRes = await apiRequest(`/listings/${listing1Id}`);
    recordTest(
      "Listings",
      "Get Listing by ID (Populated Book & Seller)",
      `GET /listings/${listing1Id}`,
      200,
      getSingleListingRes.status,
      getSingleListingRes.status === 200 && getSingleListingRes.data?.data?.book?.title === "The Hound of the Baskervilles" && getSingleListingRes.data?.data?.seller?.name === "Bob Independent Seller",
    );

    // 6.9 Cross-Seller Mutation Security (Bob attempts to update Oxford's listing -> 403)
    const unauthUpdateListingRes = await apiRequest(`/listings/${listing2Id}`, {
      method: "PATCH",
      token: sellerToken,
      body: { sellingPriceInPaise: 1000 },
    });
    recordTest(
      "Listings",
      "Forbid Seller from Editing Another Seller's Listing",
      "PATCH /listings/:id",
      403,
      unauthUpdateListingRes.status,
      unauthUpdateListingRes.status === 403,
    );

    // 6.10 Authorized Update & Price Isolation (Oxford updates listing to ₹329.00 / stock 25)
    const authUpdateListingRes = await apiRequest(`/listings/${listing2Id}`, {
      method: "PATCH",
      token: pubSellerToken,
      body: { sellingPriceInPaise: 32900, stock: 25 },
    });

    const verifyListing1 = await BookListingModel.findById(listing1Id);
    const verifyListing2 = await BookListingModel.findById(listing2Id);
    const pricesIsolated = verifyListing1?.sellingPriceInPaise === 39900 && verifyListing2?.sellingPriceInPaise === 32900 && verifyListing2?.stock === 25;

    recordTest(
      "Listings",
      "Authorized Seller Updates Own Listing Price/Stock with Strict Isolation",
      "PATCH /listings/:id",
      200,
      authUpdateListingRes.status,
      authUpdateListingRes.status === 200 && pricesIsolated,
      "Oxford updated to ₹329/stock 25; Bob remains ₹399/stock 50",
    );

    // 6.11 Delete Listing Security (Bob attempts to delete Oxford's listing -> 403)
    const unauthDeleteListingRes = await apiRequest(`/listings/${listing2Id}`, {
      method: "DELETE",
      token: sellerToken,
    });
    recordTest(
      "Listings",
      "Forbid Seller from Deleting Another Seller's Listing",
      "DELETE /listings/:id",
      403,
      unauthDeleteListingRes.status,
      unauthDeleteListingRes.status === 403,
    );

    // 6.12 Create & Delete Temporary Listing by Owner -> 200
    const tempListingRes = await apiRequest("/listings", {
      method: "POST",
      token: sellerToken,
      body: {
        book: book2Id,
        mrpInPaise: 90000,
        sellingPriceInPaise: 82000,
        stock: 5,
        sku: `SKU-TEMP-DELETE-${TEST_PREFIX}`,
      },
    });
    const tempListingId = tempListingRes.data?.data?._id;
    const authDeleteListingRes = await apiRequest(`/listings/${tempListingId}`, {
      method: "DELETE",
      token: sellerToken,
    });
    recordTest(
      "Listings",
      "Allow Owner Seller to Delete Own Listing",
      "DELETE /listings/:id",
      200,
      authDeleteListingRes.status,
      authDeleteListingRes.status === 200,
    );

    // ==========================================
    // SUMMARY REPORT
    // ==========================================
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log("\n=======================================================");
    console.log("            CATALOG & AUTH API TEST REPORT");
    console.log("=======================================================");
    console.log(`  Total Tests Run : ${totalTests}`);
    console.log(`  Passed          : ${passedTests} ✅`);
    console.log(`  Failed          : ${failedTests} ${failedTests === 0 ? "🎉" : "❌"}`);
    console.log("=======================================================\n");

    console.log("Persisted Catalog Data in Database:");
    console.log(`  - Country: ${country.name} (Code: ${country.code})`);
    console.log(`  - Authors: ${author1.name}, ${author2.name}`);
    console.log(`  - Publisher: ${oxfordPublisher.name} (Slug: ${oxfordPublisher.slug})`);
    console.log(`  - Categories: ${categoryFiction.name}, ${categoryClassics.name}`);
    console.log(`  - Users: Buyer (${buyerEmail}), Independent Seller (${sellerEmail}), Publisher Seller (${publisherSellerEmail}), Admin (${adminUser.email})`);
    console.log(`  - Books: '${createBook1Res.data?.data?.title}' (ID: ${book1Id}), '${createBook2Res.data?.data?.title}' (ID: ${book2Id})`);
    console.log(`  - Active Listings:`);
    console.log(`      * Listing 1: Bob -> ₹399.00 (Stock: 50)`);
    console.log(`      * Listing 2: Oxford Press -> ₹329.00 (Stock: 25)`);
    console.log(`      * Listing 3: Oxford Press -> ₹750.00 (Stock: 100)`);
    console.log("\n  ℹ️ NOTE: As requested, no cleanup was performed at the end of the test run.\n");

    if (failedTests > 0) {
      console.log("Failed Tests Details:");
      results.filter((r) => !r.passed).forEach((r) => {
        console.log(`  ❌ [${r.section}] ${r.testName} (${r.endpoint}) -> Expected: ${r.expectedStatus}, Got: ${r.actualStatus} | Notes: ${r.notes || 'None'}`);
      });
      process.exit(1);
    }
  } catch (error) {
    logger.error(error, "Catalog API verification failed with uncaught exception");
    process.exit(1);
  } finally {
    if (server) {
      server.close();
      logger.info("Ephemeral HTTP server closed");
    }
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
  }
};

void runCatalogVerification();

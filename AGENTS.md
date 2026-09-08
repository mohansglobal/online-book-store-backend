# AGENTS.md

## Purpose

This file defines the engineering rules for this backend.

All AI agents and contributors must follow these rules when creating, editing, refactoring, reviewing, or deleting backend code.

The primary goals are:

* readable code
* predictable structure
* strong TypeScript safety
* small focused modules
* reusable business logic
* secure API boundaries
* scalable MongoDB access
* consistent error handling
* minimal duplication
* easy testing
* easy future maintenance

Prefer simple code over clever code.

Do not introduce architecture, abstractions, libraries, folders, patterns, or dependencies unless they solve a real problem in this project.

---

# 1. Project Stack

Backend stack:

* Node.js
* Express 5+
* TypeScript with strict mode
* MongoDB
* Mongoose
* Zod
* Pino / pino-http
* Helmet
* CORS
* express-rate-limit
* ESLint
* Prettier

Development runtime currently uses Node.js 22.

The frontend is a separate Next.js application.

Do not move backend business logic into Next.js Route Handlers.

The Node.js application is the authoritative backend API.

---

# 2. Core Engineering Principles

Follow these principles in this order:

1. Correctness
2. Readability
3. Simplicity
4. Consistency
5. Security
6. Maintainability
7. Performance
8. Reusability

Do not optimize for fewer lines of code.

Do not optimize for cleverness.

Code should make its intent obvious to another developer reading it for the first time.

Prefer explicit code over hidden behavior.

Prefer composition over inheritance.

Prefer functions over classes unless a class genuinely needs state, lifecycle, or dependency encapsulation.

Do not use classes merely to group functions.

---

# 3. Architecture

Use feature/domain-based organization as the application grows.

Preferred structure:

```text
src/
├── app.ts
├── server.ts
│
├── config/
│   ├── db.ts
│   └── env.ts
│
├── constants/
│   └── http-status.ts
│
├── middlewares/
│   ├── error.middleware.ts
│   ├── not-found.middleware.ts
│   ├── validate.middleware.ts
│   └── auth.middleware.ts
│
├── modules/
│   ├── auth/
│   │   ├── auth.routes.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.schema.ts
│   │   └── auth.types.ts
│   │
│   ├── users/
│   │   ├── user.model.ts
│   │   ├── user.routes.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── user.schema.ts
│   │   └── user.types.ts
│   │
│   ├── books/
│   ├── authors/
│   ├── publishers/
│   ├── categories/
│   ├── cart/
│   ├── wishlist/
│   ├── orders/
│   ├── reviews/
│   └── discounts/
│
├── utils/
│   ├── api-response.ts
│   ├── app-error.ts
│   ├── async-handler.ts
│   └── logger.ts
│
└── types/
```

Existing code does not need to be mass-moved merely to satisfy this structure.

Migrate structure gradually when touching or creating features.

Do not perform large unrelated folder reorganizations without an explicit reason.

---

# 4. Request Flow

The standard request flow is:

```text
Route
  ↓
Validation
  ↓
Authentication
  ↓
Authorization
  ↓
Controller
  ↓
Service
  ↓
Mongoose Model / Data Access
  ↓
Controller Response
  ↓
Global Error Handler
```

Never skip layers merely to save a few lines when doing so mixes responsibilities.

Do not create layers that provide no value.

---

# 5. Route Responsibilities

Routes define HTTP wiring only.

Routes may:

* define method
* define path
* attach validation
* attach authentication
* attach authorization
* attach controller

Routes must not:

* contain business logic
* perform database queries
* calculate prices
* manipulate orders
* hash passwords
* generate tokens
* perform complex transformations

Good:

```ts
router.post(
  "/",
  authenticate,
  authorize("seller", "admin"),
  validate(createBookSchema),
  createBook,
);
```

Bad:

```ts
router.post("/", async (req, res) => {
  const existing = await Book.findOne(...);

  if (...) {
    ...
  }

  const book = await Book.create(...);

  ...
});
```

---

# 6. Controller Responsibilities

Controllers are HTTP adapters.

A controller should usually:

1. obtain validated input
2. obtain authenticated user context
3. call a service
4. select the HTTP status
5. return the response

Controllers must remain thin.

Example:

```ts
export const createBook = asyncHandler(async (req, res) => {
  const book = await createBookService({
    ...req.body,
    sellerId: req.user.id,
  });

  res.status(HTTP_STATUS.CREATED).json(
    apiResponse({
      data: book,
      message: "Book created successfully",
    }),
  );
});
```

Controllers must not contain substantial business rules.

Controllers must not directly implement reusable database workflows.

Controllers must not send multiple different response formats.

Do not put `try/catch` in every controller.

Express 5 forwards rejected async handler promises to error middleware automatically.

This project already has `asyncHandler`; keep using the established project pattern unless intentionally refactoring it.

Never combine `asyncHandler` plus unnecessary inner `try/catch`.

---

# 7. Service Responsibilities

Services contain application/business logic.

Services may:

* coordinate multiple models
* enforce business rules
* check resource ownership
* calculate prices
* validate business state
* coordinate transactions
* call external services
* throw `AppError`
* return domain/application data

Services must not know about Express.

Never pass these into services:

```ts
Request
Response
NextFunction
```

Bad:

```ts
createBookService(req, res)
```

Good:

```ts
createBookService({
  sellerId,
  title,
  isbn,
  price,
})
```

This allows service logic to later be reused by:

* HTTP controllers
* background jobs
* queue workers
* scheduled tasks
* CLI scripts
* tests

---

# 8. Repository Layer

Do NOT create repository classes automatically.

For normal Mongoose CRUD, services may call models directly.

Example:

```ts
const book = await BookModel.findById(bookId).lean();
```

Create a repository/data-access abstraction only when there is a concrete reason such as:

* complex repeated queries
* multiple data sources
* significant persistence-specific logic
* data access reused by several services
* an external provider needs to be abstracted
* testing requires a clear persistence boundary

Never create:

```text
BaseRepository
GenericRepository
BaseService
BaseController
```

without a real requirement.

Avoid enterprise-style abstraction for its own sake.

---

# 9. Functions vs Classes

Use plain functions by default.

Preferred:

```ts
export const createBook = async (...) => {
  ...
};

export const getBookById = async (...) => {
  ...
};
```

Use classes only when at least one of these applies:

* instance state is meaningful
* lifecycle management is required
* several operations depend on injected instance dependencies
* polymorphic behavior provides real value

Do not create classes simply because the application is becoming large.

Scalability comes primarily from clear boundaries and low coupling, not classes.

---

# 10. TypeScript Rules

`strict` mode must remain enabled.

Never disable strict TypeScript rules simply to make an error disappear.

Avoid:

```ts
any
```

Use:

```ts
unknown
```

when the type is genuinely unknown.

Narrow it safely before use.

Avoid unsafe assertions:

```ts
value as SomeType
```

unless the runtime guarantee is clearly established.

Never use:

```ts
// @ts-ignore
```

to hide a problem.

If absolutely necessary, `@ts-expect-error` must include a reason.

Prefer TypeScript inference where it is clear.

Do not manually annotate obvious primitive local variables.

Bad:

```ts
const name: string = "Book";
```

Good:

```ts
const name = "Book";
```

Explicitly type:

* function boundaries when useful
* reusable DTOs
* public service inputs
* shared structures
* complex return values
* external API responses

Prefer:

```ts
type
```

for data shapes and unions.

Use interfaces when declaration merging or object-oriented extension is genuinely useful.

Do not prefix interfaces with `I`.

Avoid:

```ts
interface IUser
```

Prefer:

```ts
type User = ...
```

or inferred Mongoose types.

---

# 11. Avoid Duplicate Types

Do not describe the same object independently in:

```text
Zod schema
TypeScript type
Mongoose interface
DTO interface
```

unless there is a genuine boundary difference.

For validated API input, prefer:

```ts
const createBookSchema = z.object({
  title: z.string().trim().min(1),
  price: z.number().positive(),
});

type CreateBookInput = z.infer<typeof createBookSchema>;
```

For Mongoose models, prefer schema-driven type inference when practical.

Only define a separate Mongoose document interface when inference cannot correctly represent the model.

---

# 12. Validation Rules

All untrusted input must be validated at system boundaries.

Validate:

* request body
* route params
* query params
* environment variables
* webhook payloads
* external API responses when important

Use Zod.

Never trust TypeScript types as runtime validation.

This is unsafe:

```ts
const body = req.body as CreateBookInput;
```

Validation must occur before business logic.

Validation schemas should perform structural validation.

Services should perform business validation.

Example:

Zod:

```text
price must be positive
title is required
email must be valid
```

Service:

```text
ISBN already exists
seller cannot modify another seller's book
coupon has expired
order cannot be cancelled after shipment
```

Do not mix these responsibilities unnecessarily.

---

# 13. Environment Variables

Environment variables must be read and validated centrally.

Use:

```text
src/config/env.ts
```

Other modules should import the validated `env` object.

Avoid scattered access:

```ts
process.env.JWT_SECRET
process.env.MONGODB_URI
process.env.PORT
```

throughout the application.

Never commit:

```text
.env
private keys
database credentials
JWT secrets
API secrets
payment secrets
SMTP passwords
```

Whenever a new environment variable is added, update:

```text
.env.example
```

Do not place actual secrets in `.env.example`.

The application should fail fast at startup when required environment variables are invalid.

---

# 14. API Response Convention

Successful responses should follow a consistent shape.

Example:

```json
{
  "success": true,
  "message": "Books fetched successfully",
  "data": {}
}
```

List endpoints may include metadata:

```json
{
  "success": true,
  "message": "Books fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 200,
    "totalPages": 10
  }
}
```

Errors should follow a predictable structure:

```json
{
  "success": false,
  "message": "Book not found"
}
```

Optional stable machine-readable error codes may be added when useful:

```json
{
  "success": false,
  "code": "BOOK_NOT_FOUND",
  "message": "Book not found"
}
```

Do not expose stack traces to production clients.

A `204 No Content` response must not contain a JSON body.

---

# 15. HTTP Status Codes

Use status codes intentionally.

Common conventions:

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests

500 Internal Server Error
```

Use:

```text
401
```

when authentication is missing or invalid.

Use:

```text
403
```

when authentication succeeded but the user lacks permission.

Use:

```text
404
```

when the requested resource does not exist.

Use:

```text
409
```

for conflicts such as duplicate unique business identifiers where appropriate.

Do not return `200` for every outcome.

---

# 16. Error Handling

Use `AppError` for expected operational errors.

Example:

```ts
throw new AppError("Book not found", HTTP_STATUS.NOT_FOUND);
```

Do not repeatedly write:

```ts
return res.status(404).json(...)
```

inside deep business logic.

Unexpected errors must reach the centralized error middleware.

The error middleware is responsible for:

* selecting safe client output
* logging unexpected errors
* hiding internal implementation details
* mapping known database errors when appropriate

Do not swallow errors.

Bad:

```ts
try {
  await something();
} catch {
  return null;
}
```

unless returning `null` is explicitly part of the function contract.

---

# 17. Logging

Use Pino.

Do not use `console.log` throughout production application code.

Use structured logging:

```ts
logger.info(
  { userId, bookId },
  "Book created",
);
```

Prefer metadata fields over interpolated log strings.

Do not log:

* passwords
* access tokens
* refresh tokens
* authorization headers
* cookies containing secrets
* payment credentials
* database credentials
* OTP values
* full sensitive request bodies

Errors should include useful context without exposing secrets.

Use request IDs/correlation IDs when available.

---

# 18. MongoDB Schema Design

Design MongoDB schemas around application access patterns.

Before adding a relationship, determine:

* how it will be queried
* how often it changes
* whether the data is read together
* how large it can grow
* how it should be indexed

Do not blindly copy relational database design.

Do not blindly embed everything.

Do not blindly reference everything.

---

# 19. Avoid Unbounded Arrays

Never allow indefinitely growing arrays inside documents.

Bad examples:

```text
book.reviews[]
user.orders[]
user.searchHistory[]
publisher.books[]
```

when these collections can grow without limit.

Prefer separate collections for large or unbounded relationships.

Example:

```text
Book
Review
```

instead of storing every review permanently inside:

```text
Book.reviews[]
```

Small bounded snapshots may be embedded when the read pattern justifies it.

---

# 20. MongoDB Index Rules

Indexes must support actual query patterns.

Do not add indexes merely because a field exists.

Consider indexing fields commonly used for:

* filtering
* sorting
* uniqueness
* lookups
* frequent equality conditions

For compound indexes, design according to actual query shape and sort requirements.

Example query:

```ts
Book.find({
  categoryId,
  isActive: true,
}).sort({
  createdAt: -1,
});
```

may justify an index designed for that access pattern.

Every additional index has write and storage cost.

Do not create duplicate or unused indexes.

When performance matters, inspect query execution using `explain()` rather than guessing.

---

# 21. Unique Fields

A unique MongoDB index is not a replacement for application error handling.

For fields such as:

```text
email
ISBN
slug
externalPaymentId
```

use unique indexes where the business rule requires uniqueness.

Still handle duplicate-key errors safely.

Do not rely only on:

```ts
findOne()
```

followed by:

```ts
create()
```

for uniqueness because concurrent requests can race.

The database constraint remains authoritative.

---

# 22. MongoDB Query Rules

Never expose unlimited collection queries.

Avoid:

```ts
Model.find({});
```

for endpoints that may eventually contain large datasets.

Use pagination.

Set a maximum page size.

Example:

```text
default limit: 20
maximum limit: 100
```

Do not let clients request arbitrary huge limits.

Select only fields needed by the response when practical.

Example:

```ts
BookModel.find(filter)
  .select("title slug price coverImage")
  .lean();
```

Use `lean()` for read-only queries when Mongoose document functionality is not required.

Do not use `lean()` when the code needs:

* `.save()`
* document validation
* document methods
* getters
* setters
* virtual behavior that is not explicitly supported

Avoid excessive `populate()` chains.

Avoid N+1 query patterns.

Do not perform database queries inside loops when a batch query can solve the same problem.

---

# 23. MongoDB Input Safety

Never pass arbitrary user-controlled objects directly into MongoDB queries.

Bad:

```ts
Book.find(req.query);
```

Bad:

```ts
User.findOne(req.body);
```

Build filters from explicit allowed fields.

Example:

```ts
const filter: FilterQuery<Book> = {};

if (categoryId) {
  filter.categoryId = categoryId;
}

if (publisherId) {
  filter.publisherId = publisherId;
}
```

Whitelist allowed sorting fields.

Never allow arbitrary MongoDB operators from request input.

---

# 24. Update Safety

Do not blindly spread raw request bodies into updates.

Bad:

```ts
User.findByIdAndUpdate(id, req.body);
```

This may unintentionally allow fields such as:

```text
role
isAdmin
password
status
balance
sellerId
```

to be modified.

Create an explicit update DTO or whitelist.

Example:

```ts
const update = {
  name: input.name,
  bio: input.bio,
};
```

Sensitive fields require dedicated operations.

---

# 25. Transactions

Do not use MongoDB transactions for every write.

Use them when multiple database operations form one invariant that must succeed or fail together.

Examples:

```text
create order + reduce inventory
payment completion + mark order paid
multi-document financial state changes
```

Avoid transactions for independent operations.

Keep transactions short.

Do not perform slow network requests while holding a database transaction open.

---

# 26. Authentication and Authorization

Frontend route protection is UX.

Backend authorization is security.

Never trust:

```text
Next.js middleware
hidden buttons
disabled buttons
frontend role state
localStorage role
```

as authorization.

Every protected backend operation must verify authentication.

Every role-sensitive backend operation must verify authorization.

Example:

```ts
router.post(
  "/books",
  authenticate,
  authorize("seller", "admin"),
  createBook,
);
```

Resource ownership must also be verified when appropriate.

A seller role alone does not automatically mean the seller owns every book.

---

# 27. Security Defaults

Use Helmet.

Use a deliberate CORS allowlist.

Do not use unrestricted CORS in production without a reason.

Limit JSON request body size.

Rate-limit sensitive endpoints such as:

```text
login
register
forgot password
OTP
password reset
payment initiation
```

Never leak whether sensitive accounts exist unless the business flow explicitly requires it.

Never expose internal exception details.

Never trust client-provided role, price, discount, ownership, payment status, or authorization values.

Important business values must be recalculated or verified on the backend.

---

# 28. Passwords and Tokens

When authentication is implemented:

Never store plain-text passwords.

Hash passwords with an established password hashing library.

Never return password hashes in API responses.

Sensitive model fields should be excluded by default where practical.

Keep access-token and refresh-token responsibilities clear.

Never put secrets or sensitive personal information inside JWT payloads.

Token expiration must be explicit.

Authentication middleware should attach a minimal authenticated user context.

Do not query the full user document repeatedly when unnecessary.

---

# 29. Orders, Prices and Discounts

Never trust price totals sent by the frontend.

The frontend may send:

```text
book IDs
quantities
coupon codes
shipping selections
```

The backend must determine authoritative:

```text
current price
discount
stock
subtotal
tax
shipping
total
```

Never let the client directly determine:

```text
finalAmount
discountAmount
paymentStatus
orderStatus
sellerId
```

For important order/payment operations, design for duplicate requests and retries.

Use unique external transaction/payment IDs where applicable.

---

# 30. Async Code

Use `async/await`.

Avoid callback-style code unless required by an API.

Always await promises that must complete.

Avoid:

```ts
items.forEach(async (item) => {
  await processItem(item);
});
```

Use:

```ts
for (const item of items) {
  await processItem(item);
}
```

when sequential execution is required.

Use:

```ts
await Promise.all(
  items.map((item) => processItem(item)),
);
```

when operations are independent and safe to run concurrently.

Do not use `Promise.all()` blindly for thousands of operations.

Bound concurrency for large workloads.

---

# 31. External Services

External API integrations belong behind a service/client abstraction.

Example:

```text
services/
  payment/
  email/
  storage/
```

or inside the owning feature when feature-specific.

Controllers must not contain low-level Axios/fetch configuration.

Define:

* timeout
* error mapping
* authentication headers
* retry policy when appropriate

Never retry non-idempotent operations blindly.

Never expose upstream provider errors directly to clients.

---

# 32. File Naming

Use consistent lowercase kebab-case filenames.

Preferred:

```text
book.controller.ts
book.service.ts
book.model.ts
book.schema.ts
book.routes.ts
book.types.ts
auth.middleware.ts
error.middleware.ts
```

Do not mix:

```text
BookController.ts
book_controller.ts
bookController.ts
book-controller.ts
```

inside the same project.

---

# 33. Naming

Functions should describe actions.

Good:

```text
createBook
getBookById
updateBookStock
findUserByEmail
calculateOrderTotal
validateCoupon
```

Avoid vague names:

```text
handleData
process
doStuff
manager
helper
common
func
```

Boolean names should read naturally:

```text
isActive
isDeleted
hasStock
canEdit
shouldNotify
```

Collection variables should be plural:

```ts
const books = ...
```

Single resources should be singular:

```ts
const book = ...
```

---

# 34. Constants and Magic Values

Avoid unexplained magic values.

Bad:

```ts
if (attempts > 5) ...
```

Better:

```ts
const MAX_LOGIN_ATTEMPTS = 5;
```

Do not create a constant merely to rename something used once when the meaning is already obvious.

Centralize constants that represent shared business rules.

---

# 35. Function Size

Keep functions focused on one responsibility.

A function becoming difficult to understand is a reason to extract meaningful logic.

Do not extract tiny functions simply to reduce line count.

Avoid functions with many levels of nested conditions.

Prefer early returns.

Bad:

```ts
if (user) {
  if (user.isActive) {
    if (user.role === "seller") {
      ...
    }
  }
}
```

Prefer:

```ts
if (!user) {
  throw new AppError("User not found", 404);
}

if (!user.isActive) {
  throw new AppError("User is inactive", 403);
}

if (user.role !== "seller") {
  throw new AppError("Forbidden", 403);
}
```

---

# 36. File Size

There is no arbitrary hard maximum, but large files should trigger review.

As guidance:

```text
< 150 lines       usually easy to reason about
150–250 lines     acceptable when cohesive
250–400 lines     review whether responsibilities should split
> 400 lines       strongly consider decomposition
```

Do not split files solely to satisfy a number.

Split when responsibilities are different.

One cohesive 220-line file is better than six meaningless 35-line files.

---

# 37. Reusability

Do not duplicate business logic.

When identical or nearly identical logic appears repeatedly, determine whether it represents a shared concept.

Good candidates:

```text
pagination parsing
slug generation
money calculation
API responses
authorization checks
date ranges
token utilities
file validation
```

Do not create a generic `utils.ts` dumping ground.

Prefer descriptive utilities:

```text
utils/
  pagination.ts
  slug.ts
  money.ts
```

If logic belongs to one domain only, keep it inside that domain.

---

# 38. Avoid Premature Abstraction

Do not introduce:

```text
dependency injection containers
generic repositories
abstract controllers
abstract services
event buses
CQRS
microservices
domain events
factories everywhere
custom ORMs
complex decorators
```

unless the project has a concrete need.

Start simple.

Refactor when duplication or coupling demonstrates the abstraction.

Never build infrastructure for hypothetical future requirements.

---

# 39. API Routes

Use RESTful resource-oriented routes.

Preferred:

```text
GET    /api/v1/books
GET    /api/v1/books/:id
POST   /api/v1/books
PATCH  /api/v1/books/:id
DELETE /api/v1/books/:id
```

Avoid action-heavy URLs:

```text
POST /api/v1/getBooks
POST /api/v1/createNewBook
POST /api/v1/deleteBook
```

Use nested routes only when the relationship improves clarity.

Do not create deeply nested URLs.

---

# 40. API Versioning

Public API routes should use:

```text
/api/v1
```

Example:

```text
/api/v1/auth
/api/v1/books
/api/v1/authors
/api/v1/publishers
/api/v1/categories
/api/v1/cart
/api/v1/wishlist
/api/v1/orders
```

Do not create `/v2` because of minor implementation changes.

A new API version should represent a meaningful incompatible contract change.

---

# 41. Pagination

Collection endpoints must be designed for pagination.

Use a consistent response contract.

At small scale, page/limit pagination is acceptable.

For very large or rapidly changing datasets, cursor pagination may be introduced when justified.

Validate pagination inputs.

Never accept negative pages or unlimited limits.

Sorting must use an allowlist.

Example allowed sorts:

```text
newest
oldest
price-asc
price-desc
rating
popular
```

Translate these internally into MongoDB sort objects.

Do not accept arbitrary MongoDB sort objects from the client.

---

# 42. Search

Do not implement expensive broad regex searches over large collections without considering indexes.

Normalize searchable fields where appropriate.

Search strategy must match expected scale.

Before optimizing, inspect the actual query pattern.

Do not add Elasticsearch, Atlas Search, or another search system until requirements justify it.

---

# 43. Mongoose Models

Models should define persistence concerns:

* fields
* required values
* indexes
* timestamps
* schema-level constraints
* selected model methods where appropriate

Business workflows should not live in model middleware unless there is a strong reason.

Be cautious with large amounts of hidden logic in:

```text
pre("save")
post("save")
pre("find")
```

Hooks make behavior less obvious.

Prefer explicit service logic for important business processes.

Use:

```ts
timestamps: true
```

where created/updated timestamps are useful.

Do not manually maintain `createdAt` and `updatedAt` if Mongoose already does it.

---

# 44. Model Serialization

Never expose internal or sensitive model fields accidentally.

Consider explicitly selecting/transforming API output.

Avoid leaking:

```text
password
refreshToken
resetToken
internal flags
__v
provider secrets
```

Do not return raw Mongoose documents blindly when the API requires a controlled DTO.

---

# 45. Soft Delete

Do not add soft-delete fields to every collection automatically.

Use soft delete only when recovery, auditing, or business requirements require it.

If soft deletion is implemented, use one consistent convention such as:

```text
isDeleted
deletedAt
```

and ensure normal queries consistently exclude deleted records.

Do not mix hard-delete and soft-delete semantics accidentally.

---

# 46. Data Transfer Objects

DTOs should represent boundaries, not duplicate every model.

Examples:

```text
CreateBookInput
UpdateBookInput
PublicBookResponse
RegisterUserInput
```

A MongoDB document is not automatically the same thing as an API response.

Avoid exposing persistence structure simply because it is convenient.

---

# 47. Imports

Keep imports organized.

Prefer:

1. Node built-ins
2. third-party packages
3. project modules
4. local sibling modules
5. type-only imports where appropriate

Use:

```ts
import type { Request, Response } from "express";
```

when the import is only needed for types.

Do not create circular dependencies.

Do not create barrel files everywhere.

A module-level public `index.ts` is acceptable when it deliberately defines the module's public API.

---

# 48. ESM / Module System

Follow the module system already configured by the project.

Do not mix CommonJS and ESM randomly.

Do not combine:

```ts
require(...)
```

and:

```ts
import ...
```

without a concrete interoperability need.

If the project uses NodeNext/ESM compilation, preserve its required import conventions.

Do not change the project's module system during unrelated work.

---

# 49. Dependencies

Before installing a dependency:

1. check whether the project already has a solution
2. check whether Node.js or an existing dependency can solve it cleanly
3. determine whether the dependency is actively maintained
4. determine whether the dependency materially reduces complexity

Do not install libraries for trivial functions.

Do not add a second library that solves the same problem without justification.

Examples:

If Zod is installed, do not casually add Joi.

If Pino is installed, do not casually add Winston.

If Mongoose is installed, do not introduce another MongoDB abstraction.

Every dependency has maintenance and security cost.

---

# 50. Security-Sensitive Dependencies

Never invent cryptographic implementations.

Use established libraries for:

* password hashing
* JWT/signatures
* encryption
* payment signatures
* OTP generation where cryptographic randomness is required

Use Node's built-in `crypto` APIs where appropriate.

Do not implement custom hashing or encryption algorithms.

---

# 51. Configuration vs Business Logic

Configuration belongs in:

```text
config/
```

Business rules belong in modules/services.

Do not place business constants in environment variables simply because they may change.

Do not hardcode environment-specific infrastructure values in services.

---

# 52. Testing Philosophy

Prefer tests that verify behavior.

Highest initial value:

```text
API / integration tests
```

Then add focused service/unit tests where business rules are complex.

Every significant bug fix should include a regression test when a test harness exists.

Use Arrange → Act → Assert structure.

Test names should explain:

```text
what is being tested
under what condition
what outcome is expected
```

Do not test private implementation details unnecessarily.

Tests should survive reasonable internal refactors.

---

# 53. What Must Be Tested

Prioritize testing:

* authentication
* authorization
* validation failures
* ownership checks
* book creation/update
* inventory changes
* discounts
* cart totals
* order totals
* checkout
* payment verification
* duplicate requests
* important error paths

Do not focus test effort primarily on trivial getters or constant objects.

---

# 54. Linting and Formatting

Generated or modified code must respect the repository ESLint and Prettier configuration.

Before considering a task complete, run the existing project checks where available:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

Do not silence lint errors simply to pass CI.

Fix the underlying issue.

Do not modify lint configuration to permit poor code unless explicitly required.

---

# 55. Error-Free Completion Rule

A feature is not complete merely because it works once.

Before completion:

```text
TypeScript must pass
ESLint must pass
build must pass
relevant tests must pass
routes must return expected status codes
invalid inputs must be tested
errors must reach the centralized handler
```

Do not leave known TypeScript errors for later.

---

# 56. Agent Workflow Before Editing

Before writing code, the agent must:

1. inspect the relevant existing feature
2. inspect nearby naming and architecture
3. inspect `package.json` before adding packages
4. inspect existing shared utilities before creating another one
5. determine whether the task requires backend, frontend, or both
6. preserve established conventions unless they are clearly harmful
7. make the smallest coherent change that solves the problem

Do not start by generating a large architecture.

Understand the existing code first.

---

# 57. Agent Workflow While Editing

While implementing:

* keep changes focused on the requested feature
* reuse existing utilities
* avoid unrelated cleanup
* avoid mass renaming
* avoid speculative refactors
* preserve public API contracts unless intentionally changing them
* keep controllers thin
* keep service functions cohesive
* validate all boundary input
* use centralized errors
* use structured logs
* avoid duplicated logic

When encountering poor existing code, improve only the surrounding code needed for the current task unless broader refactoring is required for correctness.

---

# 58. Agent Workflow After Editing

After implementation:

1. reread the changed code
2. remove dead code
3. remove unused imports
4. remove debugging logs
5. verify no secrets were introduced
6. run typecheck
7. run lint
8. run relevant tests
9. run build
10. inspect changed routes manually when appropriate

The agent must clearly report any check that could not be run.

Never claim tests passed unless they were actually executed.

---

# 59. No Fake Implementations

Do not silently replace unfinished backend functionality with fake production behavior.

Temporary mock behavior must be obvious.

Do not create fake authentication such as:

```ts
const user = {
  role: "admin",
};
```

and present it as protected routing.

Do not return fake payment success.

Do not create fake database persistence when the feature expects real persistence.

If backend functionality is not implemented yet, preserve clear boundaries for later integration.

---

# 60. Comments

Comments should explain WHY, not repeat WHAT.

Bad:

```ts
// Find book
const book = await Book.findById(id);
```

Good:

```ts
// Inventory is checked again here because cart data may be stale.
const book = await Book.findById(id);
```

Do not fill files with obvious comments.

Use JSDoc only where the contract genuinely benefits from documentation.

Readable code should explain most behavior itself.

---

# 61. TODO Rules

Do not leave vague TODOs.

Bad:

```ts
// TODO fix this
```

Better:

```ts
// TODO(auth): replace temporary session lookup once refresh-token rotation is implemented.
```

Do not leave TODOs for functionality that is required for the current task to work.

---

# 62. Bookstore Domain Boundaries

Keep the major business domains independent where practical:

```text
auth
users
books
authors
publishers
categories
cart
wishlist
reviews
orders
discounts
payments
```

Avoid modules reaching deeply into each other's internal files.

Prefer service-level interactions.

Example:

Bad:

```ts
import { internalFunction } from "../orders/private/internal-helper";
```

Better:

```ts
import { getOrderById } from "../orders/order.service";
```

Do not create circular feature dependencies.

---

# 63. Cart Design

The server must eventually be authoritative for persistent carts.

Cart entries should reference books/products rather than duplicate entire book documents.

Do not permanently copy mutable product information such as stock into cart documents as authoritative truth.

Revalidate:

```text
availability
price
discount
seller status
```

during checkout.

---

# 64. Book Data

A book should have a stable identifier.

Do not depend on titles as unique identifiers.

ISBN may be unique when the domain data guarantees it, but account for editions/formats where necessary.

Separate concepts when business requirements require them:

```text
Book
Edition
Inventory
SellerListing
```

Do not prematurely introduce these collections until requirements justify them.

---

# 65. Reviews

Do not store an unlimited review array inside the Book document.

Use a separate Review collection when reviews can grow.

Book documents may maintain derived summary fields such as:

```text
averageRating
reviewCount
```

when needed for efficient reads.

Derived values must have a clearly defined update strategy.

---

# 66. Inventory

Inventory changes must be protected against concurrent updates.

Do not implement stock reduction as:

```ts
book.stock -= quantity;
await book.save();
```

without considering concurrent purchases.

Prefer atomic database operations where possible.

Never allow stock to become negative.

---

# 67. Query Performance

Performance work must be evidence-based.

Before adding caching or complex architecture:

1. identify the slow endpoint
2. inspect database query behavior
3. inspect indexes
4. inspect fields returned
5. inspect N+1/populate behavior
6. measure again

Do not add Redis because an endpoint "might become slow."

Do not optimize hypothetical bottlenecks.

---

# 68. Caching

Do not add application caching until there is a measured or architectural need.

When caching is introduced, define:

```text
cache key
TTL
invalidations
source of truth
failure behavior
```

MongoDB remains the source of truth unless explicitly designed otherwise.

---

# 69. Background Jobs

Do not add queues for normal request-response operations without reason.

Use background jobs for work such as:

```text
emails
report generation
large image processing
slow external integrations
scheduled jobs
notifications
```

Critical business state changes should normally complete before returning success unless the architecture explicitly guarantees asynchronous processing.

---

# 70. Graceful Shutdown

Production server startup and shutdown should be deliberate.

When graceful shutdown is implemented:

* stop accepting new HTTP requests
* close the HTTP server
* close MongoDB connections
* close queue/Redis connections if present
* allow in-flight work a bounded time to finish
* exit

Do not attempt to keep running indefinitely after an unknown fatal programmer error.

---

# 71. Performance Safety

Avoid blocking the Node.js event loop.

Do not use synchronous filesystem or CPU-heavy operations in request paths when avoidable.

Large CPU-heavy work should eventually move outside the request lifecycle.

Limit:

```text
request body size
upload size
pagination size
batch size
concurrency
```

---

# 72. Code Review Questions

Before accepting code, verify:

```text
Is the code in the correct domain?
Is the controller thin?
Is business logic reusable outside HTTP?
Is input validated?
Are permissions enforced server-side?
Is database access safe?
Could this query become unbounded?
Does the query need an index?
Is there duplicated logic?
Is an abstraction unnecessary?
Are errors centralized?
Are logs structured?
Could sensitive data leak?
Are TypeScript types safe?
Could concurrency break this?
Can another developer understand this quickly?
```

---

# 73. Anti-Patterns

Do not introduce these without compelling justification:

```text
500+ line controllers
500+ line services
business logic in routes
database calls scattered through controllers
Request/Response objects passed into services
generic BaseController/BaseService
one giant utils.ts
one giant types.ts
classes with no state
`any` everywhere
unvalidated req.body
raw req.query passed to MongoDB
unbounded find()
unbounded document arrays
arbitrary client sorting
blind req.body update spreads
console.log everywhere
catch blocks that swallow errors
duplicate response formats
hardcoded secrets
manual JWT crypto
frontend-only authorization
premature Redis
premature microservices
premature repository patterns
premature event buses
```

---

# 74. Simplicity Rule

When two implementations satisfy the requirements equally well, choose the one with:

```text
fewer concepts
fewer dependencies
fewer layers
less hidden behavior
clearer naming
easier testing
```

Do not confuse sophisticated architecture with good architecture.

---

# 75. Refactoring Rule

Refactor when there is evidence:

```text
duplication
high coupling
hard-to-test logic
large unrelated responsibilities
frequent bugs
difficult navigation
performance problems
```

Do not refactor simply because another architecture looks cleaner in a diagram.

---

# 76. Compatibility Rule

When editing existing code:

Do not rewrite working code into a preferred personal style unless the task benefits from it.

Consistency with the surrounding code is usually more valuable than introducing a second "better" style.

If the existing pattern is unsafe or clearly problematic, fix it deliberately and consistently.

---

# 77. Definition of Done

A backend change is complete only when:

```text
requirements are implemented
validation exists
business rules are enforced
authorization is enforced where needed
errors follow project conventions
response shape is consistent
database access is bounded
types are safe
code is readable
duplication is avoided
lint passes
typecheck passes
build passes
relevant tests pass
no secret or debug code remains
```

---

# Final Rule

Write backend code that another developer can understand without needing the original author to explain it.

Prefer this:

```text
boring
predictable
explicit
typed
validated
tested
small
secure
```

over this:

```text
clever
abstract
magical
over-engineered
prematurely optimized
```

The goal is not to demonstrate how many patterns can be used.

The goal is to make the Online Book Store backend easy to build, debug, extend, secure, and maintain.

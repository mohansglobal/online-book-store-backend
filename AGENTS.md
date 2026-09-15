teDiscount(listing.sellingPriceInPaise * item.quantity);


## Purpose

This file defines the coding rules for the Node.js backend.

The main goal is simple:

> Write boring, predictable code that another developer can understand quickly.

Do not try to write impressive code.

Do not optimize for fewer lines.

Do not hide multiple steps inside one expression.

Default coding style: Prefer 2–5 simple readable statements over one complex statement. Give intermediate business values meaningful names. A reader should not need to mentally execute an expression to understand what it does.

For example, prefer:

const unitPrice = listing.sellingPriceInPaise;
const quantity = item.quantity;

const subtotal = unitPrice * quantity;
const discount = calculateDiscount(subtotal);
const total = subtotal - discount;

instead of:

const total =
  listing.sellingPriceInPaise * item.quantity -
  calculateDiscount(listing.sellingPriceInPaise * item.quantity);


# No Property Guessing

Do not guess which property contains the real value by chaining several possible fields.

Avoid:

```ts
const name =
  order.name ||
  order.customerName ||
  order.userName ||
  order.fullName ||
  "-";
```

Avoid:

```ts
const id =
  order._id ||
  order.orderId ||
  order.id ||
  order.slug ||
  "";
```

This hides an unclear data contract.

Know which property the API returns and use that property directly.

Prefer:

```ts
const customerName = order.customerName;
```

If the value is only needed for display, a simple display fallback is allowed:

```ts
const customerName = order.customerName || "-";
```

Or:

```tsx
<p>{order.customerName || "-"}</p>
```

For nullable values where `0`, `false`, or an empty string may be valid, prefer `??`:

```ts
const stock = order.stock ?? 0;
```

Do not write:

```ts
const stock = order.stock || 0;
```

when `0` is a meaningful value.

## API Shape Differences

If different API responses genuinely have different property names, normalize them once at the boundary.

Example:

```ts
const customerName = apiOrder.customerName;

return {
  customerName,
};
```

Then the rest of the application uses only:

```ts
order.customerName
```

Do not repeat compatibility fallbacks throughout components:

```ts
order.customerName ||
order.name ||
order.user?.name ||
order.customer?.name ||
"-"
```

If legacy compatibility is required, keep it inside one clearly named normalization function and document the precedence.

## Rule

Use:

```text
one known property
+
one simple display fallback when needed
```

Prefer:

```ts
order.name || "-"
```

over:

```ts
order.name ||
order.fullName ||
order.customerName ||
order.user?.name ||
order.profile?.name ||
"-"
```

Multiple property fallbacks usually mean the data contract needs to be fixed or normalized.




# 1. Stack

```text
Node.js 22+
Express 5+
TypeScript strict mode
MongoDB
Mongoose
Zod
Pino
```

The Next.js application is the frontend.

The Node.js API is responsible for:

```text
authentication
authorization
business rules
prices
discounts
stock
orders
payments
database operations
```

---

# 2. Most Important Code Style Rule

Prefer explicit steps.

Bad:

```ts
const total = items.reduce(
  (sum, item) => sum + item.price * item.quantity,
  0,
);
```

If the calculation is important to the business, prefer code where every important value has a name:

```ts
let total = 0;

for (const item of items) {
  const itemPrice = item.price;
  const quantity = item.quantity;
  const itemTotal = itemPrice * quantity;

  total += itemTotal;
}
```

The second version is longer.

That is okay.

It is easier to debug and easier to modify.

---

# 3. Prefer Named Variables

When an expression contains multiple pieces of information, name them.

Avoid:

```ts
await Order.create({
  user: req.user.id,
  total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
});
```

Prefer:

```ts
const userId = req.user.id;

const orderTotal = calculateOrderTotal(items);

const order = await Order.create({
  user: userId,
  total: orderTotal,
});
```

Another example:

Avoid:

```ts
const skip = (Number(req.query.page || 1) - 1) * Number(req.query.limit || 20);
```

Prefer:

```ts
const page = Number(req.query.page || 1);
const limit = Number(req.query.limit || 20);
const skip = (page - 1) * limit;
```

A developer should be able to immediately see what each value represents.

---

# 4. Do Not Create Variables for Everything

Named variables should improve understanding.

Do not make obvious code unnecessarily noisy.

This is fine:

```ts
user.isActive = true;
```

Do not write:

```ts
const activeStatus = true;

user.isActive = activeStatus;
```

Use a variable when:

```text
the value has business meaning
the expression is difficult to read
the value is reused
the value helps debugging
the next developer benefits from knowing its name
```

---

# 5. Avoid Clever One-Liners

Avoid code that performs several operations at once.

Avoid:

```ts
const user = id && (await User.findById(id)) || null;
```

Prefer:

```ts
if (!id) {
  return null;
}

const user = await User.findById(id);

return user;
```

Avoid nested ternaries:

```ts
const status = paid ? shipped ? "shipped" : "paid" : "pending";
```

Prefer:

```ts
let status = "pending";

if (paid) {
  status = "paid";
}

if (shipped) {
  status = "shipped";
}
```

---

# 6. Prefer Simple Control Flow

Use early returns.

Avoid:

```ts
if (user) {
  if (user.isActive) {
    if (user.role === "seller") {
      // logic
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

// logic
```

Try to read functions from top to bottom.

---

# 7. A Function Should Look Like Steps

Business functions should normally look like this:

```text
1. validate required state
2. load required data
3. check business rules
4. perform calculation
5. update database
6. return result
```

Example:

```ts
export const cancelOrder = async (
  orderId: string,
  userId: string,
  reason: string,
) => {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const belongsToUser = order.user.toString() === userId;

  if (!belongsToUser) {
    throw new AppError("Forbidden", 403);
  }

  const canCancel = CANCELLABLE_STATUSES.includes(order.status);

  if (!canCancel) {
    throw new AppError("Order cannot be cancelled", 400);
  }

  order.status = "cancelled";
  order.cancellationReason = reason;

  await order.save();

  return order;
};
```

Someone reading the function should understand the flow without jumping between five helper files.

---

# 8. Do Not Extract Tiny Helpers Without Reason

Avoid:

```ts
const getUserId = (user: User) => user.id;

const getOrderId = (order: Order) => order.id;

const isOrderActive = (order: Order) => order.status === "active";
```

when they are used only once and add no meaning.

Helpers should represent real concepts.

Good:

```ts
calculateOrderTotal()
reserveInventory()
verifyPaymentSignature()
canCancelOrder()
calculateDiscount()
```

---

# 9. Functions Over Classes

Use functions by default.

Prefer:

```ts
export const createOrder = async () => {};

export const cancelOrder = async () => {};

export const getOrderById = async () => {};
```

Do not create:

```ts
class OrderService {}
```

just to group functions.

Use classes only when instance state or dependency lifecycle actually requires them.

---

# 10. Keep Architecture Simple

Preferred flow:

```text
Route
  ↓
Validation / Auth
  ↓
Controller
  ↓
Service
  ↓
Mongoose Model
```

Do not add extra layers unless necessary.

Do not automatically create:

```text
repositories
base services
base controllers
factories
dependency injection containers
CQRS
event buses
microservices
```

---

# 11. Routes

Routes only connect HTTP pieces.

Good:

```ts
router.post(
  "/",
  authenticate,
  authorize("seller"),
  validate(createBookSchema),
  createBook,
);
```

Routes must not contain:

```text
database queries
price calculations
business rules
payment logic
stock updates
```

---

# 12. Controllers

Controllers should be boring.

Usually:

```text
get input
get current user
call service
return response
```

Example:

```ts
export const createBook = asyncHandler(async (req, res) => {
  const sellerId = req.user.id;
  const input = req.body;

  const book = await createBookService({
    sellerId,
    ...input,
  });

  res.status(201).json({
    success: true,
    message: "Book created successfully",
    data: book,
  });
});
```

Do not put major business logic inside controllers.

---

# 13. Services

Services contain business logic.

Services may:

```text
query models
check ownership
calculate prices
check stock
handle transactions
coordinate multiple models
call external services
throw AppError
```

Services must not receive:

```text
Request
Response
NextFunction
```

Bad:

```ts
createOrderService(req, res);
```

Good:

```ts
createOrderService({
  userId,
  shippingAddressId,
  paymentMethod,
});
```

---

# 14. TypeScript

Keep strict mode enabled.

Do not use:

```ts
any
```

unless there is an exceptional reason.

Prefer:

```ts
unknown
```

and narrow it.

Avoid unnecessary type declarations:

```ts
const name: string = "Mohan";
```

Prefer:

```ts
const name = "Mohan";
```

Type important boundaries:

```text
service inputs
API inputs
external API responses
shared domain structures
complex return values
```

---

# 15. Validation

Validate all incoming data using Zod.

Validate:

```text
body
params
query
environment variables
external payloads when important
```

Zod handles structure.

Services handle business rules.

Example:

Zod:

```text
quantity must be positive
email must be valid
title is required
```

Service:

```text
book does not exist
stock is insufficient
coupon expired
seller does not own listing
order cannot be cancelled
```

---

# 16. MongoDB Queries

Never directly use user input as a MongoDB query.

Bad:

```ts
Book.find(req.query);
```

Build the filter explicitly:

```ts
const filter: FilterQuery<Book> = {};

if (categoryId) {
  filter.category = categoryId;
}

if (publisherId) {
  filter.publisher = publisherId;
}
```

This is intentionally boring.

Keep it that way.

---

# 17. Updates

Never blindly update using the request body.

Bad:

```ts
User.findByIdAndUpdate(userId, req.body);
```

Prefer:

```ts
const update = {
  name: input.name,
  phoneNumber: input.phoneNumber,
};

const user = await User.findByIdAndUpdate(
  userId,
  update,
  { new: true },
);
```

Make editable fields visible in the code.

---

# 18. Prices and Orders

Never trust totals from the frontend.

Frontend may send:

```text
listingId
quantity
couponCode
shippingAddressId
paymentMethod
```

Backend calculates:

```text
current price
discount
subtotal
shipping
tax
total
stock availability
seller
payment status
order status
```

Important calculations should use clearly named variables.

Example:

```ts
const unitPrice = listing.sellingPriceInPaise;
const quantity = cartItem.quantity;

const subtotal = unitPrice * quantity;
const discount = calculateDiscount(subtotal, coupon);
const total = subtotal - discount;
```

Prefer this over hiding everything inside one expression.

---

# 19. Inventory

Inventory updates must be atomic.

Do not:

```ts
listing.stock -= quantity;
await listing.save();
```

for checkout.

Prefer a conditional database update:

```ts
const updatedListing = await BookListing.findOneAndUpdate(
  {
    _id: listingId,
    stock: { $gte: quantity },
  },
  {
    $inc: {
      stock: -quantity,
    },
  },
  {
    new: true,
  },
);
```

Never allow stock to become negative.

---

# 20. Transactions

Use MongoDB transactions only when multiple writes must succeed or fail together.

Examples:

```text
create order + reduce stock
payment success + update order
refund + payment state update
```

Do not use transactions for ordinary independent writes.

Keep transactions short.

Do not perform slow network requests inside a transaction.

---

# 21. Errors

Use centralized error handling.

Expected errors:

```ts
throw new AppError("Book not found", 404);
```

Do not return HTTP responses from deep service logic.

Do not write `try/catch` everywhere.

Do not swallow errors.

---

# 22. Async Code

Use `async/await`.

Avoid:

```ts
items.forEach(async (item) => {
  await processItem(item);
});
```

Sequential:

```ts
for (const item of items) {
  await processItem(item);
}
```

Independent small operations:

```ts
await Promise.all(
  items.map((item) => processItem(item)),
);
```

Do not use concurrency just because it looks faster.

---

# 23. Naming

Use names that explain the value.

Good:

```ts
const userId = req.user.id;
const listingId = input.listingId;
const quantity = input.quantity;
const availableStock = listing.stock;
const unitPrice = listing.sellingPriceInPaise;
const orderTotal = subtotal - discount;
```

Avoid:

```ts
const a = req.user.id;
const d = input.listingId;
const x = listing.stock;
const temp = subtotal - discount;
```

Functions should describe actions:

```text
createOrder
cancelOrder
findBookById
reserveInventory
calculateOrderTotal
verifyPayment
```

Avoid:

```text
handle
process
doStuff
manager
helper
func
```

---

# 24. Comments

Code should explain WHAT.

Comments should explain WHY.

Bad:

```ts
// Find the order
const order = await Order.findById(orderId);
```

Good:

```ts
// Recheck stock because cart quantities may be stale by checkout time.
const listing = await BookListing.findById(listingId);
```

Do not comment obvious code.

---

# 25. File and Function Size

Do not chase arbitrary line counts.

Split code when responsibilities are different.

Do not split:

```text
one understandable 180-line service
```

into:

```text
six tiny files
```

just to make the line count smaller.

Likewise, do not allow one function to perform five unrelated jobs.

---

# 26. Reusability

Do not duplicate real business logic.

Good reusable concepts:

```text
calculateOrderTotal
calculateDiscount
parsePagination
verifyPaymentSignature
reserveInventory
generateSlug
```

But do not create abstractions before duplication exists.

First write the straightforward implementation.

Refactor when there is an actual reason.

---

# 27. Dependencies

Before installing a package:

```text
check whether the project already solves it
check whether Node.js can solve it
check whether the package materially simplifies the code
```

Do not install packages for tiny utilities.

Do not introduce two libraries that solve the same problem.

---

# 28. Security

Never trust the frontend for:

```text
roles
permissions
prices
stock
seller ownership
discounts
payment status
order status
```

Always verify them on the backend.

Never log:

```text
passwords
JWTs
refresh tokens
cookies
OTP values
payment secrets
database credentials
```

---

# 29. Before Writing Code

Before changing a feature:

```text
read the existing code
understand the current structure
reuse existing utilities
check existing types
check existing validation
make the smallest required change
```

Do not begin by creating new architecture.

---

# 30. While Writing Code

Prefer code that looks like this:

```ts
const userId = user.id;
const listingId = input.listingId;
const quantity = input.quantity;

const listing = await BookListing.findById(listingId);

if (!listing) {
  throw new AppError("Listing not found", 404);
}

const hasEnoughStock = listing.stock >= quantity;

if (!hasEnoughStock) {
  throw new AppError("Insufficient stock", 400);
}

const unitPrice = listing.sellingPriceInPaise;
const subtotal = unitPrice * quantity;

return {
  listingId,
  quantity,
  unitPrice,
  subtotal,
};
```

Not code that compresses all of those concepts into one expression.

---

# 31. Avoid These Patterns

Avoid unless there is a real reason:

```text
clever one-liners
nested ternaries
deep nesting
huge chained expressions
single-letter variables
generic helpers
generic repositories
BaseService
BaseController
classes without state
premature abstractions
premature caching
premature Redis
premature microservices
raw req.body updates
raw req.query MongoDB queries
business logic in routes
business logic hidden in model hooks
console.log everywhere
any everywhere
```

---

# 32. Final Decision Rule

When choosing between:

```ts
const total = items.reduce(
  (sum, { price, quantity }) => sum + price * quantity,
  0,
);
```

and:

```ts
let total = 0;

for (const item of items) {
  const price = item.price;
  const quantity = item.quantity;
  const itemTotal = price * quantity;

  total += itemTotal;
}
```

prefer the second version when this is important business logic.

It is longer.

It is also easier to:

```text
read
debug
change
log
test
review
```

That is more important than saving lines.

---

# Final Rule

Write code that looks boring.

Prefer:

```text
named variables
visible steps
early returns
small responsibilities
clear conditions
explicit validation
simple loops
predictable files
straightforward database queries
```

over:

```text
one-liners
clever syntax
hidden behavior
magic abstractions
deep nesting
compressed expressions
unnecessary patterns
```

A developer should be able to open the code and understand:

```text
what came in
what was checked
what was calculated
what changed
what was returned
```

without needing the original developer to explain it.

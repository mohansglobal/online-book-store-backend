# Backend Agent Rules

## Project

Node.js 22+, Express 5+, TypeScript strict mode, MongoDB/Mongoose, Zod, Pino.

Frontend is Next.js.
Backend owns authentication, authorization, business rules, prices,
discounts, stock, orders, payments and database operations.

## Code Style

Write boring, explicit, predictable code.

- Prefer readable steps over clever one-liners.
- Use meaningful variable and function names.
- Use early returns instead of deep nesting.
- Avoid nested ternaries and large chained expressions.
- Do not create variables for obvious values.
- Do not extract tiny helpers unless they represent a real concept.
- Prefer functions over classes unless instance state is required.
- Do not introduce abstractions before they are needed.
- Do not optimize for fewer lines.

For important business calculations, name intermediate values.

## Data Contracts

Never guess properties using chains such as:

order.name || order.customerName || order.user?.name

Use the known API property directly.

A simple display fallback is allowed:

order.customerName || "-"

Use `??` when 0, false or empty string are valid values.

If APIs have different shapes, normalize them once at the boundary.

## Architecture

Preferred flow:

Route
→ validation/auth
→ controller
→ service
→ Mongoose model

Routes:
- connect HTTP concerns only
- no business logic or database queries

Controllers:
- read input/current user
- call service
- return response

Services:
- contain business logic
- may query models, calculate values, check ownership/stock and use transactions
- must not receive Express Request/Response/NextFunction

Do not introduce repositories, base services/controllers, DI containers,
CQRS, event buses or microservices unless there is a concrete need.

## TypeScript

- Keep strict mode enabled.
- Avoid `any`; prefer `unknown` and narrow it.
- Let TypeScript infer obvious local types.
- Explicitly type important boundaries and complex domain structures.

## Validation

Validate incoming body, params and query data with Zod.

Zod validates structure.
Services enforce business rules.

## MongoDB

Never pass raw user input directly into MongoDB queries.

Build filters and updates explicitly.

Never blindly use:

User.findByIdAndUpdate(id, req.body)

Expose editable fields explicitly.

## Orders / Money / Inventory

Never trust frontend values for:

- prices
- totals
- discounts
- stock
- seller ownership
- payment status
- order status
- permissions

Backend calculates authoritative values.

Use clearly named intermediate variables for money calculations.

Inventory changes during checkout must be atomic and must never allow
negative stock.

Use MongoDB transactions only when multiple writes must succeed or fail
together. Keep transactions short and avoid network calls inside them.

## Errors / Async

Use centralized error handling and `AppError` for expected errors.

Do not return HTTP responses from service logic.
Do not add try/catch everywhere or swallow errors.

Use async/await.

Do not use async callbacks with `forEach`.

Use sequential loops when order matters and `Promise.all` only for genuinely
independent operations.

## Security

Never log passwords, JWTs, refresh tokens, cookies, OTPs, payment secrets
or database credentials.

Always verify roles, permissions, ownership, prices, stock and payment
state on the backend.

## Changing Existing Code

Before editing:

1. Understand the existing implementation.
2. Inspect affected callers/callees.
3. Reuse existing utilities/types/validation.
4. Make the smallest required change.
5. Preserve unrelated behavior.

Do not create new architecture unless required.

## Testing

Test-created records must use `test_` or `[TEST]` identifiers.

Always clean test data after testing, including failed runs.
Use `try/finally` where appropriate.

A task is complete only when relevant checks have actually been run:

- TypeScript/typecheck
- lint
- relevant tests
- final git diff review

Never claim a check passed unless it was executed.
If something was not checked, say:

`Not verified: <reason>`

## Codebase Navigation

Prefer Serena for code exploration.

- Use `find_symbol` for implementations.
- Use `find_referencing_symbols` for callers/usages.
- Use `get_symbols_overview` before reading large files.
- Prefer symbol-level retrieval over whole-file reads.
- Read full files only when necessary.
- Use broad repository search only when symbol lookup is insufficient.

If `.codegraph/` exists, CodeGraph may be used for dependency/call-path
analysis before broad grep/find searches.

## Final Rule

Prefer:

- named variables
- visible steps
- early returns
- clear conditions
- explicit validation
- straightforward queries
- small responsibilities

Avoid:

- clever one-liners
- deep nesting
- hidden behavior
- magic abstractions
- premature optimization
- unnecessary dependencies
- unrelated changes
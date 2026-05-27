# invoicing-kit — Design Spec

**Date:** 2026-05-27
**Status:** Approved (brainstorming → ready for implementation plan)
**Source project:** `/Users/anthonytaveras/Documents/bills_simple/api`
**Target package:** `/Users/anthonytaveras/Documents/opensource/invoicing-kit`

## Goal

Extract the core billing logic from `bills_simple/api` into a reusable open-source package, modeled on better-auth's extensibility patterns. Consumers should be able to drop the package into a Hono app, plug it into their existing better-auth setup, and either use the default Prisma adapter or implement their own data layer.

## Locked decisions

| Decision | Choice |
|---|---|
| Scope | Core billing only: invoices, quotes, clients, products, taxes, document numbering, payments (manual only) |
| Extensibility | Per-domain typed repository interfaces + default Prisma adapter |
| Framework | Hono-only (router exported, not framework-agnostic handler) |
| Auth | Tightly coupled to better-auth + organization plugin |
| Schema delivery | CLI generator that writes `.prisma` model files into the consumer's `prisma/` folder |
| Package name & path | `invoicing-kit` at `opensource/invoicing-kit/` |
| OpenAPI | Keep `@hono/zod-openapi` |
| Email | Dropped from v0 |
| Stats | Dropped from v0 |

## Architecture

### Public API

```ts
import { createInvoicingKit, prismaAdapter } from "invoicing-kit";
import { auth } from "./auth"; // consumer's better-auth instance

const bills = createInvoicingKit({
  adapter: prismaAdapter(prisma),
  auth,
  basePath: "/api/bills",
});

app.route("/", bills.router);
```

The factory returns `{ router, services, repos }`. The router is a Hono sub-router; `services` and `repos` are exported for advanced consumers who want to call business logic from their own server code without going through HTTP.

### Three layers

1. **Repositories** — typed interfaces per model. Pure data access, no business logic. The default `prismaAdapter()` returns a `Repositories` bundle backed by the consumer's `PrismaClient`.
2. **Services** — `InvoiceService`, `QuoteService`, `ClientService`, `ProductService`, `TaxService`, `PaymentService`. Own all business logic (tax calculation, document numbering, transactional invoice creation, status transitions). Constructed with `Repositories` + pure collaborators. No Prisma imports.
3. **Routes** — `@hono/zod-openapi` route definitions per domain. Read the better-auth session, validate inputs, call services, map results to response DTOs.

### Data flow per request

```
Hono route
  → auth middleware (reads better-auth session, builds AuthContext)
  → service method
  → repository methods (Prisma by default, or user-supplied)
  → service maps row to DTO
  → route returns response
```

Transactions are owned by services and expressed as `repos.tx(async (txRepos) => {...})` so the adapter abstraction holds inside transactions too.

## Repositories layer

### Shape

```ts
export interface Repositories {
  invoices: InvoiceRepository;
  quotes: QuoteRepository;
  clients: ClientRepository;
  products: ProductRepository;
  taxes: TaxRepository;
  payments: PaymentRepository;
  documents: DocumentRepository;
  documentSequences: DocumentSequenceRepository;
  /** Runs the callback in a transaction. Repos passed to the callback share the transaction. */
  tx<T>(fn: (txRepos: Repositories) => Promise<T>): Promise<T>;
}
```

### Per-repo interface style

Each repository exposes narrow, intention-revealing methods — not generic CRUD. Examples:

```ts
export interface InvoiceRepository {
  create(data: NewInvoice): Promise<Invoice>;
  findById(id: string, organizationId: string): Promise<InvoiceWithDocument | null>;
  findByDocumentNumber(args: {
    organizationId: string;
    prefix: string | null;
    number: number;
  }): Promise<Invoice | null>;
  list(args: ListInvoicesArgs): Promise<PaginatedResult<InvoiceListItem>>;
  update(id: string, organizationId: string, patch: InvoiceUpdate): Promise<Invoice>;
  delete(id: string, organizationId: string): Promise<void>;
}

export interface DocumentSequenceRepository {
  incrementAndGet(args: {
    organizationId: string;
    documentType: "INVOICE" | "QUOTE";
  }): Promise<number>;
  ensure(args: {
    organizationId: string;
    documentType: "INVOICE" | "QUOTE";
    prefix?: string | null;
  }): Promise<void>;
}
```

### Two rules

1. **Domain types live in the package, not in Prisma's generated types.** The package exports `Invoice`, `Client`, `LineItem`, etc. as plain TS types defined alongside the repo interfaces. The Prisma adapter maps Prisma rows → domain types. This is what lets a non-Prisma adapter exist: the consumer's underlying schema can look completely different as long as the repo returns the package's shape.
2. **Every read takes `organizationId` explicitly** — no implicit tenant. The service passes it down; repos never read it from ambient context. Keeps adapters dumb.

### Trade-off

Hand-written mappers from Prisma rows to domain types are extra code. That's the cost of letting consumers swap the model layer — and it forces the clean DTO boundary that the existing codebase mostly already has via the `mappers.ts` convention.

## Services & router layer

### Services own all business logic and are HTTP-independent

```ts
export class InvoiceService {
  constructor(
    private readonly repos: Repositories,
    private readonly numbering: DocumentNumberingService,
    private readonly tax: TaxStrategy,
    private readonly calc: DocumentCalculator,
  ) {}

  async create(input: CreateInvoiceInput, ctx: AuthContext): Promise<Invoice> {
    return this.repos.tx(async (tx) => {
      const number = await this.numbering.next(
        tx,
        ctx.organizationId,
        "INVOICE",
        input.documentNumberPrefix,
      );
      const lineItems = await this.tax.applyToLines(tx, input.lineItems, ctx.organizationId);
      const totals = this.calc.totals(lineItems);
      return tx.invoices.create({
        ...input,
        ...totals,
        lineItems,
        organizationId: ctx.organizationId,
      });
    });
  }
}
```

`AuthContext` is a small typed object: `{ userId: string; organizationId: string; role?: string }`. Services never touch Hono `c` or the request.

### Routes are thin glue

Each domain has its own `@hono/zod-openapi` router that:

1. Runs the central auth middleware (calls `auth.api.getSession(...)`, throws 401 if missing, sets `c.var.authContext`).
2. Validates inputs with Zod schemas from `validation.ts`.
3. Pulls the service from a `Services` bundle constructed once in the factory closure (no per-request DI middleware).
4. Calls the service, maps to a response DTO, returns it.

### Factory composition

```ts
export function createInvoicingKit(config: InvoicingKitConfig) {
  const repos = config.adapter;
  const services = buildServices(repos);
  const router = buildRouter({ services, auth: config.auth, basePath: config.basePath });
  return { router, services, repos };
}
```

### Per-domain folder layout

Mirrors the convention from the source project's CLAUDE.md:

```
domains/<feature>/
  service.ts        # business logic
  routes.ts         # @hono/zod-openapi routes
  validation.ts     # Zod schemas + z.infer<> DTO types
  mappers.ts        # row -> response DTO
  exceptions.ts     # typed HTTPException classes
```

## Auth integration

The package imports better-auth types directly and accepts a better-auth instance in config:

```ts
import type { Auth } from "better-auth";

export interface InvoicingKitConfig {
  adapter: Repositories;
  auth: Auth;            // must have organization plugin enabled
  basePath?: string;     // default "/api/bills"
}
```

### Central auth middleware

```ts
export const authMiddleware = (auth: Auth) =>
  createMiddleware(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    if (!session.session.activeOrganizationId) {
      throw new HTTPException(400, { message: "No active organization" });
    }
    c.set("authContext", {
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId,
      role: session.user.role,
    });
    await next();
  });
```

Every domain router applies this middleware. Routes read `c.var.authContext` and pass it to services.

### What the package requires from better-auth

- `organization` plugin enabled (uses `activeOrganizationId` everywhere).
- That's it — no other plugins are assumed.

### What the package does NOT do

- Does not mount `/api/auth/*` — that stays in the host app.
- Does not configure better-auth — the host owns the instance.
- Does not require specific session storage, social providers, or admin plugin.

### Documented limitation

The User/Session/Account/Verification/Organization models in the host's `schema.prisma` must use the standard better-auth shape with their default table names. The CLI generates only the billing models; auth/org models must already exist. The Prisma adapter references them by string FK only (no joined includes across the boundary).

## CLI for schema

A separate package `@invoicing-kit/cli` ships the Prisma model files for the default adapter, mirroring `@better-auth/cli`.

### Commands

```bash
npx @invoicing-kit/cli generate                  # write into ./prisma/models/
npx @invoicing-kit/cli generate --out <dir>      # custom output dir
npx @invoicing-kit/cli generate --dry-run        # print what would be written
npx @invoicing-kit/cli generate --force          # overwrite existing files
```

### What it writes

Files into `<out>/` (default `./prisma/models/`):

- `invoicing.prisma` — `Document`, `Invoice`, `Quote`, `DocumentLineItem`, `DocumentLineItemTax`, `DocumentNumberSequence`, `Tax`, plus enums `DocumentType`, `InvoiceStatus`, `QuoteStatus`, `TaxType`.
- `client.prisma` — `Client`.
- `product.prisma` — `Product`.
- `payment.prisma` — `Payment`, `PaymentMethod`, `DocumentPaymentMethod`, plus enums `PaymentStatus`, `PaymentProvider`, `PaymentMethodType`.
- `_README.md` — short note explaining the package's models reference `organization` and `user` (from better-auth) by string FK, and consumers should keep those models in their schema.

### Constraints

- CLI does NOT touch the host's `schema.prisma`.
- Refuses to overwrite existing files unless `--force` is passed; prints a diff hint instead.
- Consumers run `prisma migrate` themselves after generation. The CLI doesn't write migration SQL — consumers use `prisma migrate diff` per their own workflow.

### Versioning

Schema templates ship inside the CLI package at `templates/v0/*.prisma`. v0 ships a single template set. When a future major version changes the schema, a new template folder is added and the CLI selects the latest by default. Multi-version selection (e.g., a `--from-version` flag for incremental upgrades) is post-v0. Forward-only — no automated migration SQL generation; consumers use `prisma migrate diff` per their own workflow.

### Why a separate CLI package

Keeps `invoicing-kit` runtime-only (no `commander` / fs deps in the core install). Matches the better-auth split.

## Package layout

### Repo structure

```
opensource/invoicing-kit/
  package.json                    # workspace root, "private": true, Bun workspaces
  tsconfig.base.json
  packages/
    invoicing-kit/                # the main npm package
      package.json                # name: "invoicing-kit"
      src/
        index.ts                  # createInvoicingKit, prismaAdapter re-exports
        config.ts                 # InvoicingKitConfig type
        types.ts                  # public domain types (Invoice, Client, ...)
        auth/
          middleware.ts           # authMiddleware, AuthContext type
        adapters/
          types.ts                # Repositories + each *Repository interface
          prisma/
            index.ts              # prismaAdapter(prisma)
            invoices.ts
            clients.ts
            products.ts
            taxes.ts
            payments.ts
            documents.ts
            sequences.ts
            quotes.ts
            mappers.ts            # row -> domain DTO
        domains/
          invoices/
            service.ts
            routes.ts
            validation.ts
            mappers.ts
            exceptions.ts
          quotes/
          clients/
          products/
          taxes/
          payments/
        lib/
          calculator.ts           # DocumentCalculator
          tax-strategy.ts         # TaxStrategy
          numbering.ts            # DocumentNumberingService
          errors.ts               # ErrorCode const
          shared-schemas.ts
        router.ts                 # buildRouter()
        services.ts               # buildServices()
      tsup.config.ts
    cli/                          # @invoicing-kit/cli
      package.json                # name: "@invoicing-kit/cli", bin: "invoicing-kit"
      src/
        index.ts                  # CLI entry (commander)
        commands/generate.ts
      templates/
        v0/
          invoicing.prisma
          client.prisma
          product.prisma
          payment.prisma
          _README.md
  examples/
    hono-prisma-basic/            # minimal working app
      src/index.ts
      prisma/schema.prisma
      package.json
  README.md
  LICENSE                         # MIT
  .changeset/                     # versioning the two packages together
```

### Public exports (`invoicing-kit` package root)

```ts
export { createInvoicingKit } from "./index";
export { prismaAdapter } from "./adapters/prisma";
export type { InvoicingKitConfig, Repositories, AuthContext } from "./config";
export type {
  InvoiceRepository,
  ClientRepository,
  ProductRepository,
  TaxRepository,
  PaymentRepository,
  DocumentRepository,
  DocumentSequenceRepository,
  QuoteRepository,
} from "./adapters/types";
export type {
  Invoice,
  Quote,
  Client,
  Product,
  Tax,
  Payment,
  LineItem,
  Document,
} from "./types";
// Domain exception classes for catch handlers
export * from "./domains/*/exceptions";
```

No deep imports — everything goes through the root. Zod schemas from `validation.ts` are NOT exported in v0; keeps the request/response shape from locking down.

### Build & runtime targets

- Build: `tsup` → ESM + CJS + `.d.ts`.
- Runtime targets: Node 18+ and Bun.
- `peerDependencies` (not regular deps): `hono`, `@hono/zod-openapi`, `zod`, `better-auth`, `@prisma/client`.
- `@prisma/client` is peer-optional — only needed if using the default Prisma adapter.

### License

MIT (matches better-auth).

## Extraction & migration plan

### Lifted mostly as-is (refactored to use `Repositories` instead of direct Prisma)

- `src/routes/invoice/` → `domains/invoices/`
- `src/routes/quote/` → `domains/quotes/`
- `src/routes/client/` → `domains/clients/`
- `src/routes/product/` → `domains/products/`
- `src/routes/payments/` → `domains/payments/`
- `src/routes/settings/` (only tax + payment-method endpoints) → split into `domains/taxes/` and `domains/payments/`
- `src/lib/document/` (base service, calculator, update builder) → `lib/calculator.ts`, `lib/numbering.ts`
- `src/lib/tax-strategy.ts` → `lib/tax-strategy.ts`
- `src/lib/query-builder/` — kept inside each Prisma repo (Prisma-specific, doesn't belong in services)
- `src/lib/shared-schemas.ts` → `lib/shared-schemas.ts`
- `prisma/models/*.prisma` minus auth/org models → CLI templates

### Dropped from v0

- All email code (`src/emails/`, `src/lib/email/`, SQS consumer)
- Stripe Connect, Stripe webhooks, Stripe payment intents
- Apple IAP, plans, usage, stats, admin routes, contacts
- `src/lib/storage/` (S3), `src/lib/queue/` (SQS)
- Sentry middleware
- The `Payment` repo and routes ship, but payment-provider-specific fields (`stripePaymentIntentId`, `stripeChargeId`, etc.) stay in the schema as nullable optional fields. Only `MANUAL` provider is supported by services in v0. Stripe glue can be added later as a plugin.

### Refactoring required (not lift-and-shift)

1. Replace every `prisma.x.y()` call in services with `repos.x.y()`. Services lose all `@/generated/prisma/client` imports.
2. Replace the per-module `dependencies.ts` middleware with the centralized factory composition.
3. Replace `c.var.organization.id` / `c.var.user` reads with `c.var.authContext`.
4. Replace inline `throw new HTTPException(...)` strings with entries in `lib/errors.ts`.
5. Hand-write Prisma row → domain DTO mappers (currently many services return Prisma row types directly). Heaviest single piece of refactoring work.
6. Strip Sentry, usage-limit middleware, and any `process.env` reads — config flows in via `InvoicingKitConfig`.

## Testing strategy

### Three layers

1. **Unit — services against an in-memory adapter.** Ship a minimal `inMemoryAdapter()` in `src/adapters/memory/`, exported as test-only under a subpath (`invoicing-kit/testing`) so consumers can use it for their own tests. Tests cover tax application, document numbering atomicity, line-item totals, status transitions, validation rules. Fast, deterministic, no DB. Majority of tests live here.

2. **Adapter conformance — same suite, both adapters.** A single test suite exercising every `Repositories` method (read-back semantics, transaction isolation, FK constraint behavior, ordering, pagination). Runs twice: against `inMemoryAdapter()` and against `prismaAdapter(prisma)` pointed at Postgres in a Docker container. Catches divergence between adapters; protects custom-adapter authors who can run the same suite as a contract test.

3. **Integration — routes end-to-end through Hono.** Per domain, ~3-5 tests POST/GET against the actual router with a stubbed better-auth session. Run against the Prisma adapter on the same Docker Postgres. Verifies routing, Zod validation, auth middleware, and the full service → repo → DB path. Not exhaustive — services covered in layer 1; this is the wiring smoke test.

### Not tested

- CLI: single snapshot test that runs `generate` into a tempdir and compares against fixtures.
- Example app: smoke-built in CI (`bun install && bun run build`), not run.

### Tooling

- Test runner: `vitest`.
- Postgres: `docker-compose.test.yml` at repo root.
- CI: unit + adapter conformance + integration in one job.

### Coverage goal

No hard percentage target. Every service method gets at least one test; every repository method is exercised by the conformance suite.

## Out of scope (explicit non-goals for v0)

- Authentication — host owns better-auth setup, package only reads sessions.
- Email/notifications — no `Mailer` interface, no templates, no SES/SQS.
- Payment provider integrations — no Stripe Connect, no Stripe webhooks, no Apple IAP. `Payment` records can be created in `MANUAL` provider mode only.
- Stats/reporting endpoints — no `/stats` routes; consumers query the schema directly.
- Admin endpoints — no admin-scoped routes.
- Usage limits / plans / billing — no usage tracking, no plan enforcement.
- Webhooks & scheduled jobs — no overdue-invoice marker, no recurring invoices, no automated reminders.
- PDF rendering — out of scope.
- Storage — no S3 helpers, no file attachments.
- Non-Prisma adapters — only Prisma ships. Interface is open, but no Drizzle/Kysely reference adapter in v0.
- Schema migrations — CLI ships model files only; consumers run `prisma migrate`.
- Multi-currency conversion — currency passes through as a string, no FX.
- i18n — English-only error messages; document `locale` field is passthrough.

Each can be added post-v0 as a plugin or version bump.

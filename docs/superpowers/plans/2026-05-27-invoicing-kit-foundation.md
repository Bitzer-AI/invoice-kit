# invoicing-kit — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data-layer foundation of the `invoicing-kit` package: workspace, public domain types, per-model repository interfaces, default Prisma adapter, in-memory test adapter, and a parametrized conformance suite that passes identically against both adapters. No HTTP routes, no services. Domains, services, and routes ship in Plan 2; CLI and example app ship in Plan 3.

**Architecture:** Bun workspace with two packages — `invoicing-kit` (core) and `@invoicing-kit/cli` (stub directory, no commands yet — only holds `.prisma` template files used by tests and by Plan 3's CLI). The core package defines plain TS domain types and per-model `*Repository` interfaces. Both `prismaAdapter(prisma)` and `inMemoryAdapter()` return the same `Repositories` shape. A single conformance suite parametrized by adapter factory runs against both.

**Tech Stack:** Bun · TypeScript 5.9 · Prisma 7 · vitest · tsup · Docker Compose (Postgres for adapter conformance against Prisma). Hono, `@hono/zod-openapi`, zod, `better-auth` are declared as peer deps but unused in this plan.

**Source:** Extraction from `/Users/anthonytaveras/Documents/bills_simple/api`. The plan references specific source files for model field details; the engineer should consult them when extracting model shapes.

**Working directory for all paths below:** `/Users/anthonytaveras/Documents/opensource/invoicing-kit/`

---

## Phase A — Workspace, types, and harness

### Task A1: Workspace root files

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `LICENSE`
- Create: `README.md`
- Modify: `.gitignore` (already exists from spec commit; extend it)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "invoicing-kit-workspace",
  "version": "0.0.0",
  "private": true,
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun run --filter '*' test",
    "typecheck": "bun run --filter '*' typecheck"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "@types/node": "^25.0.9"
  }
}
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  }
}
```

- [ ] **Step 3: Write `LICENSE` (MIT)**

Copy the standard MIT license text. Copyright holder: "Anthony Taveras". Year: 2026.

- [ ] **Step 4: Write `README.md` (stub)**

```markdown
# invoicing-kit

Reusable invoicing/billing API for Hono apps using better-auth. Modeled on better-auth's extensibility patterns: bring your own data adapter.

**Status:** v0 in development. See `docs/superpowers/specs/` for design.
```

- [ ] **Step 5: Extend `.gitignore`**

Append these lines (don't duplicate any that already exist):

```
/packages/*/dist/
/packages/*/node_modules/
/examples/*/node_modules/
/packages/invoicing-kit/src/generated/
**/.prisma/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: workspace root setup"
```

---

### Task A2: Core package skeleton

**Files:**
- Create: `packages/invoicing-kit/package.json`
- Create: `packages/invoicing-kit/tsconfig.json`
- Create: `packages/invoicing-kit/src/index.ts`

- [ ] **Step 1: Write `packages/invoicing-kit/package.json`**

```json
{
  "name": "invoicing-kit",
  "version": "0.0.0",
  "description": "Reusable invoicing API for Hono + better-auth apps",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "import": "./dist/testing.js",
      "require": "./dist/testing.cjs"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "@hono/zod-openapi": "^1.0.0",
    "@prisma/client": ">=7.0.0",
    "better-auth": ">=1.4.0",
    "hono": "^4.0.0",
    "zod": "^4.0.0"
  },
  "peerDependenciesMeta": {
    "@prisma/client": { "optional": true }
  },
  "devDependencies": {
    "@hono/zod-openapi": "^1.2.0",
    "@prisma/client": "^7.2.0",
    "@prisma/adapter-pg": "^7.2.0",
    "better-auth": "^1.4.13",
    "hono": "^4.11.4",
    "prisma": "^7.2.0",
    "tsup": "^8.0.0",
    "vitest": "^2.0.0",
    "zod": "^4.3.5"
  }
}
```

- [ ] **Step 2: Write `packages/invoicing-kit/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./src"
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Write `packages/invoicing-kit/src/index.ts` (placeholder)**

```ts
// Public API surface filled in across Plan 1 and Plan 2.
// Plan 1 exports: types, prismaAdapter, Repositories interface, error types.
// Plan 2 adds: createInvoicingKit, services.
export {};
```

- [ ] **Step 4: Install deps**

Run: `bun install`
Expected: dependencies installed without errors, `bun.lock` updated at repo root.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(core): package skeleton"
```

---

### Task A3: Build (tsup) and typecheck verification

**Files:**
- Create: `packages/invoicing-kit/tsup.config.ts`

- [ ] **Step 1: Write `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    testing: "src/testing.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
});
```

- [ ] **Step 2: Create placeholder `src/testing.ts`**

```ts
// Test-only adapter exports filled in during Phase C.
export {};
```

- [ ] **Step 3: Run build**

Run: `cd packages/invoicing-kit && bun run build`
Expected: PASS — `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/testing.js`, `dist/testing.cjs`, `dist/testing.d.ts` all created.

- [ ] **Step 4: Run typecheck**

Run: `cd packages/invoicing-kit && bun run typecheck`
Expected: PASS, no output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(core): tsup build config"
```

---

### Task A4: Vitest config + smoke test

**Files:**
- Create: `packages/invoicing-kit/vitest.config.ts`
- Create: `packages/invoicing-kit/tests/smoke.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",                    // each test file in its own process
    poolOptions: {
      forks: { singleFork: true },    // serial across files: Postgres tests share schema
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 2: Write a one-line smoke test**

```ts
// tests/smoke.test.ts
import { expect, test } from "vitest";

test("vitest is wired up", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 3: Run it**

Run: `cd packages/invoicing-kit && bun run test`
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(core): vitest setup"
```

---

### Task A5: Domain types (`src/types.ts`)

**Files:**
- Create: `packages/invoicing-kit/src/types.ts`

Source reference for field shapes: `bills_simple/api/prisma/models/{client,product,invoicing,payment}.prisma`. Use the exact field names and types listed below — they reflect the source schema with these intentional changes:
- Drop `ContactType` enum from Client (no provider/expense support in v0).
- Drop `taxId`/`taxIdType` fields from Client (v0 doesn't surface tax-id ops; can be added later).
- Use `BigintMinor` (alias `bigint`) for currency amounts stored in minor units (cents).
- Use `Decimal` as a string (alias `DecimalString`) for ratios and quantities, to preserve precision across the adapter boundary.

- [ ] **Step 1: Write `src/types.ts`**

```ts
// Numeric primitives at the package boundary.
// Currency amounts: integer cents (or smallest unit), expressed as bigint to avoid float drift.
export type BigintMinor = bigint;
// Decimals (rates, quantities): string in canonical Prisma Decimal format.
export type DecimalString = string;

export type DocumentType = "INVOICE" | "QUOTE";
export type InvoiceStatus = "draft" | "sent" | "paid" | "partially_paid";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "converted";
export type TaxType = "PERCENTAGE" | "FIXED";
export type PaymentMethodType = "STRIPE" | "MANUAL";
export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled";
export type PaymentProvider = "STRIPE" | "MANUAL";

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  price: DecimalString;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tax {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: TaxType;
  rate: DecimalString;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentNumberSequence {
  id: string;
  organizationId: string;
  documentType: DocumentType;
  prefix: string | null;
  nextNumber: number;
  updatedAt: Date;
}

export interface Document {
  id: string;
  type: DocumentType;
  organizationId: string;
  clientId: string;
  documentNumberPrefix: string | null;
  documentNumber: number;
  issueDate: Date;
  dueDate: Date | null;
  notes: string | null;
  subtotal: BigintMinor | null;
  tax: BigintMinor | null;
  total: BigintMinor | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentLineItem {
  id: string;
  documentId: string;
  productId: string;
  quantity: DecimalString;
  price: BigintMinor;
  taxAmount: BigintMinor;
  total: BigintMinor;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentLineItemTax {
  id: string;
  lineItemId: string;
  taxId: string;
  taxAmount: BigintMinor;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  documentId: string;
  status: InvoiceStatus;
  paidDate: Date | null;
  convertedFromQuoteId: string | null;
}

export interface Quote {
  id: string;
  documentId: string;
  status: QuoteStatus;
  validUntil: Date | null;
}

export interface PaymentMethod {
  id: string;
  organizationId: string;
  name: string;
  type: PaymentMethodType;
  instructions: string | null;
  metadata: unknown | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentPaymentMethod {
  id: string;
  documentId: string;
  paymentMethodId: string;
  createdAt: Date;
}

export interface Payment {
  id: string;
  invoiceId: string;
  paymentMethodId: string | null;
  amount: BigintMinor;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  stripeChargeId: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  metadata: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Re-export from `src/index.ts`**

```ts
export * from "./types";
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/invoicing-kit && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(core): domain types"
```

---

### Task A6: Repository interfaces (`src/adapters/types.ts`)

**Files:**
- Create: `packages/invoicing-kit/src/adapters/types.ts`

Each repository exposes narrow, intention-revealing methods (per spec Section 2). Every read takes `organizationId` explicitly — no implicit tenant.

- [ ] **Step 1: Write `src/adapters/types.ts`**

```ts
import type {
  Client,
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentNumberSequence,
  DocumentPaymentMethod,
  DocumentType,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  PaymentMethodType,
  PaymentProvider,
  PaymentStatus,
  Product,
  Quote,
  QuoteStatus,
  Tax,
  TaxType,
  BigintMinor,
  DecimalString,
} from "../types";

export interface PageRequest {
  page?: number;
  perPage?: number;
}

export interface Page<T> {
  data: T[];
  pageInfo: {
    page: number;
    perPage: number;
    totalCount: number;
    pageCount: number;
  };
}

// ============== Client ==============

export interface NewClient {
  organizationId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

export type ClientUpdate = Partial<Omit<NewClient, "organizationId">>;

export interface ListClientsArgs extends PageRequest {
  organizationId: string;
  query?: string;
}

export interface ClientRepository {
  create(data: NewClient): Promise<Client>;
  findById(id: string, organizationId: string): Promise<Client | null>;
  list(args: ListClientsArgs): Promise<Page<Client>>;
  update(id: string, organizationId: string, patch: ClientUpdate): Promise<Client>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Product ==============

export interface NewProduct {
  organizationId: string;
  name: string;
  description?: string | null;
  price: DecimalString;
}

export type ProductUpdate = Partial<Omit<NewProduct, "organizationId">>;

export interface ListProductsArgs extends PageRequest {
  organizationId: string;
  query?: string;
}

export interface ProductRepository {
  create(data: NewProduct): Promise<Product>;
  findById(id: string, organizationId: string): Promise<Product | null>;
  list(args: ListProductsArgs): Promise<Page<Product>>;
  update(id: string, organizationId: string, patch: ProductUpdate): Promise<Product>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Tax ==============

export interface NewTax {
  organizationId: string;
  name: string;
  description?: string | null;
  type: TaxType;
  rate: DecimalString;
  isActive?: boolean;
  isDefault?: boolean;
}

export type TaxUpdate = Partial<Omit<NewTax, "organizationId">>;

export interface ListTaxesArgs {
  organizationId: string;
  isActive?: boolean;
}

export interface TaxRepository {
  create(data: NewTax): Promise<Tax>;
  findById(id: string, organizationId: string): Promise<Tax | null>;
  findManyById(ids: string[], organizationId: string): Promise<Tax[]>;
  list(args: ListTaxesArgs): Promise<Tax[]>;
  update(id: string, organizationId: string, patch: TaxUpdate): Promise<Tax>;
  delete(id: string, organizationId: string): Promise<void>;
  /** Clears the `isDefault` flag on all rows for an org except `keepId`. */
  clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void>;
}

// ============== DocumentNumberSequence ==============

export interface DocumentSequenceRepository {
  /** Atomically increments `nextNumber` for (org, type) and returns the value prior to increment. */
  incrementAndGet(args: {
    organizationId: string;
    documentType: DocumentType;
  }): Promise<number>;
  /** Idempotent: creates the row with `nextNumber=1` if missing, no-op otherwise. */
  ensure(args: {
    organizationId: string;
    documentType: DocumentType;
    prefix?: string | null;
  }): Promise<void>;
  find(args: {
    organizationId: string;
    documentType: DocumentType;
  }): Promise<DocumentNumberSequence | null>;
}

// ============== Document ==============

export interface NewDocumentLineItem {
  productId: string;
  quantity: DecimalString;
  price: BigintMinor;
  description?: string | null;
  /** Per-line tax breakdown (post-calculation). Empty array for no tax. */
  taxes: Array<{ taxId: string; taxAmount: BigintMinor }>;
  /** Pre-computed line totals. */
  taxAmount: BigintMinor;
  total: BigintMinor;
}

export interface NewDocument {
  type: DocumentType;
  organizationId: string;
  clientId: string;
  documentNumberPrefix?: string | null;
  documentNumber: number;
  issueDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
  lineItems: NewDocumentLineItem[];
  paymentMethodIds?: string[];
}

export type DocumentUpdate = Partial<{
  clientId: string;
  documentNumberPrefix: string | null;
  documentNumber: number;
  issueDate: Date;
  dueDate: Date | null;
  notes: string | null;
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
}>;

export interface DocumentWithRelations extends Document {
  lineItems: Array<DocumentLineItem & { taxes: DocumentLineItemTax[] }>;
  paymentMethods: DocumentPaymentMethod[];
}

export interface DocumentRepository {
  /** Inserts the Document + line items + per-line taxes + payment-method links in one DB call (the adapter's responsibility). Returns the document with relations. */
  create(data: NewDocument): Promise<DocumentWithRelations>;
  findById(id: string, organizationId: string): Promise<DocumentWithRelations | null>;
  update(id: string, organizationId: string, patch: DocumentUpdate): Promise<Document>;
  /** Replaces line items + per-line taxes wholesale. */
  replaceLineItems(
    documentId: string,
    organizationId: string,
    lineItems: NewDocumentLineItem[],
  ): Promise<void>;
  /** Sets the linked payment-method ids (replaces the set). */
  setPaymentMethods(
    documentId: string,
    organizationId: string,
    paymentMethodIds: string[],
  ): Promise<void>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Invoice ==============

export interface NewInvoice {
  documentId: string;
  status: InvoiceStatus;
  paidDate?: Date | null;
  convertedFromQuoteId?: string | null;
}

export type InvoiceUpdate = Partial<{
  status: InvoiceStatus;
  paidDate: Date | null;
}>;

export interface InvoiceWithDocument extends Invoice {
  document: DocumentWithRelations;
}

export interface ListInvoicesArgs extends PageRequest {
  organizationId: string;
  status?: InvoiceStatus | InvoiceStatus[];
  clientId?: string;
  /** Inclusive date range on Document.issueDate. */
  issueDateFrom?: Date;
  issueDateTo?: Date;
}

export interface InvoiceRepository {
  create(data: NewInvoice): Promise<Invoice>;
  findById(id: string, organizationId: string): Promise<InvoiceWithDocument | null>;
  findByDocumentNumber(args: {
    organizationId: string;
    prefix: string | null;
    documentNumber: number;
  }): Promise<Invoice | null>;
  list(args: ListInvoicesArgs): Promise<Page<InvoiceWithDocument>>;
  update(id: string, organizationId: string, patch: InvoiceUpdate): Promise<Invoice>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Quote ==============

export interface NewQuote {
  documentId: string;
  status: QuoteStatus;
  validUntil?: Date | null;
}

export type QuoteUpdate = Partial<{
  status: QuoteStatus;
  validUntil: Date | null;
}>;

export interface QuoteWithDocument extends Quote {
  document: DocumentWithRelations;
}

export interface ListQuotesArgs extends PageRequest {
  organizationId: string;
  status?: QuoteStatus | QuoteStatus[];
  clientId?: string;
}

export interface QuoteRepository {
  create(data: NewQuote): Promise<Quote>;
  findById(id: string, organizationId: string): Promise<QuoteWithDocument | null>;
  findByDocumentNumber(args: {
    organizationId: string;
    prefix: string | null;
    documentNumber: number;
  }): Promise<Quote | null>;
  list(args: ListQuotesArgs): Promise<Page<QuoteWithDocument>>;
  update(id: string, organizationId: string, patch: QuoteUpdate): Promise<Quote>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== PaymentMethod ==============

export interface NewPaymentMethod {
  organizationId: string;
  name: string;
  type: PaymentMethodType;
  instructions?: string | null;
  metadata?: unknown | null;
  isActive?: boolean;
  isDefault?: boolean;
}

export type PaymentMethodUpdate = Partial<Omit<NewPaymentMethod, "organizationId">>;

export interface ListPaymentMethodsArgs {
  organizationId: string;
  isActive?: boolean;
}

export interface PaymentMethodRepository {
  create(data: NewPaymentMethod): Promise<PaymentMethod>;
  findById(id: string, organizationId: string): Promise<PaymentMethod | null>;
  list(args: ListPaymentMethodsArgs): Promise<PaymentMethod[]>;
  update(id: string, organizationId: string, patch: PaymentMethodUpdate): Promise<PaymentMethod>;
  delete(id: string, organizationId: string): Promise<void>;
  clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void>;
}

// ============== Payment ==============

export interface NewPayment {
  invoiceId: string;
  paymentMethodId?: string | null;
  amount: BigintMinor;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  stripePaymentIntentId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeChargeId?: string | null;
  paidAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  reference?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
  metadata?: unknown | null;
}

export type PaymentUpdate = Partial<Omit<NewPayment, "invoiceId">>;

export interface ListPaymentsArgs extends PageRequest {
  organizationId: string;
  invoiceId?: string;
  status?: PaymentStatus;
}

export interface PaymentRepository {
  create(data: NewPayment): Promise<Payment>;
  findById(id: string, organizationId: string): Promise<Payment | null>;
  list(args: ListPaymentsArgs): Promise<Page<Payment>>;
  update(id: string, organizationId: string, patch: PaymentUpdate): Promise<Payment>;
  delete(id: string, organizationId: string): Promise<void>;
  /** Sum of `amount` for succeeded payments on the given invoice, in the invoice's currency. */
  totalPaidForInvoice(invoiceId: string, organizationId: string): Promise<BigintMinor>;
}

// ============== Top-level bundle ==============

export interface Repositories {
  clients: ClientRepository;
  products: ProductRepository;
  taxes: TaxRepository;
  documentSequences: DocumentSequenceRepository;
  documents: DocumentRepository;
  invoices: InvoiceRepository;
  quotes: QuoteRepository;
  paymentMethods: PaymentMethodRepository;
  payments: PaymentRepository;
  /** Runs `fn` inside a transaction; the `txRepos` passed in share the transaction. Nested calls must reuse the outer transaction (no nested savepoints in v0). */
  tx<T>(fn: (txRepos: Repositories) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 2: Re-export from `src/index.ts`**

```ts
export * from "./types";
export type * from "./adapters/types";
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/invoicing-kit && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(core): repository interfaces"
```

---

### Task A7: Adapter factory shells (in-memory + Prisma)

**Files:**
- Create: `packages/invoicing-kit/src/adapters/memory/index.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/index.ts`

Both adapters get stub factories that return a `Repositories` shape where every method throws `not implemented`. Each domain task in Phase C fills these in.

- [ ] **Step 1: Write `src/adapters/memory/index.ts`**

```ts
import type { Repositories } from "../types";

function notImpl(name: string): never {
  throw new Error(`inMemoryAdapter: ${name} not implemented yet`);
}

export function inMemoryAdapter(): Repositories {
  // Filled in per-domain across Phase C. For now, every method throws.
  const repos: Repositories = {
    clients: {
      create: () => notImpl("clients.create"),
      findById: () => notImpl("clients.findById"),
      list: () => notImpl("clients.list"),
      update: () => notImpl("clients.update"),
      delete: () => notImpl("clients.delete"),
    },
    products: {
      create: () => notImpl("products.create"),
      findById: () => notImpl("products.findById"),
      list: () => notImpl("products.list"),
      update: () => notImpl("products.update"),
      delete: () => notImpl("products.delete"),
    },
    taxes: {
      create: () => notImpl("taxes.create"),
      findById: () => notImpl("taxes.findById"),
      findManyById: () => notImpl("taxes.findManyById"),
      list: () => notImpl("taxes.list"),
      update: () => notImpl("taxes.update"),
      delete: () => notImpl("taxes.delete"),
      clearDefaultExcept: () => notImpl("taxes.clearDefaultExcept"),
    },
    documentSequences: {
      incrementAndGet: () => notImpl("documentSequences.incrementAndGet"),
      ensure: () => notImpl("documentSequences.ensure"),
      find: () => notImpl("documentSequences.find"),
    },
    documents: {
      create: () => notImpl("documents.create"),
      findById: () => notImpl("documents.findById"),
      update: () => notImpl("documents.update"),
      replaceLineItems: () => notImpl("documents.replaceLineItems"),
      setPaymentMethods: () => notImpl("documents.setPaymentMethods"),
      delete: () => notImpl("documents.delete"),
    },
    invoices: {
      create: () => notImpl("invoices.create"),
      findById: () => notImpl("invoices.findById"),
      findByDocumentNumber: () => notImpl("invoices.findByDocumentNumber"),
      list: () => notImpl("invoices.list"),
      update: () => notImpl("invoices.update"),
      delete: () => notImpl("invoices.delete"),
    },
    quotes: {
      create: () => notImpl("quotes.create"),
      findById: () => notImpl("quotes.findById"),
      findByDocumentNumber: () => notImpl("quotes.findByDocumentNumber"),
      list: () => notImpl("quotes.list"),
      update: () => notImpl("quotes.update"),
      delete: () => notImpl("quotes.delete"),
    },
    paymentMethods: {
      create: () => notImpl("paymentMethods.create"),
      findById: () => notImpl("paymentMethods.findById"),
      list: () => notImpl("paymentMethods.list"),
      update: () => notImpl("paymentMethods.update"),
      delete: () => notImpl("paymentMethods.delete"),
      clearDefaultExcept: () => notImpl("paymentMethods.clearDefaultExcept"),
    },
    payments: {
      create: () => notImpl("payments.create"),
      findById: () => notImpl("payments.findById"),
      list: () => notImpl("payments.list"),
      update: () => notImpl("payments.update"),
      delete: () => notImpl("payments.delete"),
      totalPaidForInvoice: () => notImpl("payments.totalPaidForInvoice"),
    },
    tx: () => notImpl("tx"),
  };
  return repos;
}
```

- [ ] **Step 2: Write `src/adapters/prisma/index.ts`** (mirror structure)

Same shape as the in-memory shell, but the factory takes a `PrismaClient` and the error message prefix is `prismaAdapter:`. Don't write the full method bodies — same `notImpl("...")` stubs for every method.

```ts
import type { PrismaClient } from "@prisma/client";
import type { Repositories } from "../types";

function notImpl(name: string): never {
  throw new Error(`prismaAdapter: ${name} not implemented yet`);
}

export function prismaAdapter(prisma: PrismaClient): Repositories {
  void prisma; // silence unused until Phase C fills in implementations
  const repos: Repositories = {
    clients: {
      create: () => notImpl("clients.create"),
      findById: () => notImpl("clients.findById"),
      list: () => notImpl("clients.list"),
      update: () => notImpl("clients.update"),
      delete: () => notImpl("clients.delete"),
    },
    products: {
      create: () => notImpl("products.create"),
      findById: () => notImpl("products.findById"),
      list: () => notImpl("products.list"),
      update: () => notImpl("products.update"),
      delete: () => notImpl("products.delete"),
    },
    taxes: {
      create: () => notImpl("taxes.create"),
      findById: () => notImpl("taxes.findById"),
      findManyById: () => notImpl("taxes.findManyById"),
      list: () => notImpl("taxes.list"),
      update: () => notImpl("taxes.update"),
      delete: () => notImpl("taxes.delete"),
      clearDefaultExcept: () => notImpl("taxes.clearDefaultExcept"),
    },
    documentSequences: {
      incrementAndGet: () => notImpl("documentSequences.incrementAndGet"),
      ensure: () => notImpl("documentSequences.ensure"),
      find: () => notImpl("documentSequences.find"),
    },
    documents: {
      create: () => notImpl("documents.create"),
      findById: () => notImpl("documents.findById"),
      update: () => notImpl("documents.update"),
      replaceLineItems: () => notImpl("documents.replaceLineItems"),
      setPaymentMethods: () => notImpl("documents.setPaymentMethods"),
      delete: () => notImpl("documents.delete"),
    },
    invoices: {
      create: () => notImpl("invoices.create"),
      findById: () => notImpl("invoices.findById"),
      findByDocumentNumber: () => notImpl("invoices.findByDocumentNumber"),
      list: () => notImpl("invoices.list"),
      update: () => notImpl("invoices.update"),
      delete: () => notImpl("invoices.delete"),
    },
    quotes: {
      create: () => notImpl("quotes.create"),
      findById: () => notImpl("quotes.findById"),
      findByDocumentNumber: () => notImpl("quotes.findByDocumentNumber"),
      list: () => notImpl("quotes.list"),
      update: () => notImpl("quotes.update"),
      delete: () => notImpl("quotes.delete"),
    },
    paymentMethods: {
      create: () => notImpl("paymentMethods.create"),
      findById: () => notImpl("paymentMethods.findById"),
      list: () => notImpl("paymentMethods.list"),
      update: () => notImpl("paymentMethods.update"),
      delete: () => notImpl("paymentMethods.delete"),
      clearDefaultExcept: () => notImpl("paymentMethods.clearDefaultExcept"),
    },
    payments: {
      create: () => notImpl("payments.create"),
      findById: () => notImpl("payments.findById"),
      list: () => notImpl("payments.list"),
      update: () => notImpl("payments.update"),
      delete: () => notImpl("payments.delete"),
      totalPaidForInvoice: () => notImpl("payments.totalPaidForInvoice"),
    },
    tx: () => notImpl("tx"),
  };
  return repos;
}
```

- [ ] **Step 3: Update exports**

`src/index.ts`:
```ts
export * from "./types";
export type * from "./adapters/types";
export { prismaAdapter } from "./adapters/prisma";
```

`src/testing.ts`:
```ts
export { inMemoryAdapter } from "./adapters/memory";
```

- [ ] **Step 4: Build + typecheck**

Run: `cd packages/invoicing-kit && bun run build && bun run typecheck`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): adapter factory shells"
```

---

### Task A8: Conformance suite framework

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/harness.ts`
- Create: `packages/invoicing-kit/tests/conformance/factories.ts`
- Create: `packages/invoicing-kit/tests/conformance/index.test.ts`

The harness is a function that takes an adapter factory and a per-suite setup hook, and returns a parametrized `describe` block. Each domain test file imports the harness and defines its tests inside it.

- [ ] **Step 1: Write `tests/conformance/factories.ts`**

```ts
import type { Repositories } from "../../src/adapters/types";

export interface AdapterFactory {
  name: string;
  /** Returns a fresh Repositories instance for one test. */
  create(): Promise<Repositories>;
  /** Cleanup invoked after each test. Drops all data. */
  reset(repos: Repositories): Promise<void>;
}

export interface AdapterFactories {
  factories: AdapterFactory[];
}
```

- [ ] **Step 2: Write `tests/conformance/harness.ts`**

```ts
import { afterEach, beforeEach, describe } from "vitest";
import type { Repositories } from "../../src/adapters/types";
import type { AdapterFactory } from "./factories";

export interface SuiteContext {
  repos: Repositories;
}

export function describeForEachAdapter(
  name: string,
  factories: AdapterFactory[],
  body: (ctx: SuiteContext) => void,
): void {
  for (const factory of factories) {
    describe(`${name} [${factory.name}]`, () => {
      const ctx: SuiteContext = { repos: undefined as unknown as Repositories };

      beforeEach(async () => {
        ctx.repos = await factory.create();
      });

      afterEach(async () => {
        await factory.reset(ctx.repos);
      });

      body(ctx);
    });
  }
}
```

- [ ] **Step 3: Write a smoke test for the harness `tests/conformance/index.test.ts`**

```ts
// Vitest picks up every *.test.ts file in tests/conformance/ automatically.
// This file is a sanity check that the harness imports resolve.
import { describe, expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";

describe("conformance harness wiring", () => {
  test("describeForEachAdapter is callable", () => {
    expect(typeof describeForEachAdapter).toBe("function");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd packages/invoicing-kit && bun run test`
Expected: smoke + harness wiring tests pass (2 passing tests total).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(core): conformance harness scaffold"
```

---

## Phase B — Prisma schema templates & test fixture

This phase produces the canonical `.prisma` model files at `packages/cli/templates/v0/` (Plan 3's CLI will read from here) and a test fixture that composes them with auth/org models for Prisma adapter testing.

### Task B1: CLI package stub + invoicing.prisma template

**Files:**
- Create: `packages/cli/package.json` (stub only)
- Create: `packages/cli/templates/v0/invoicing.prisma`

- [ ] **Step 1: Write `packages/cli/package.json`**

```json
{
  "name": "@invoicing-kit/cli",
  "version": "0.0.0",
  "description": "Schema generator CLI for invoicing-kit",
  "type": "module",
  "files": ["dist", "templates", "README.md"],
  "scripts": {
    "typecheck": "echo 'no source in Plan 1'"
  }
}
```

- [ ] **Step 2: Write `packages/cli/templates/v0/invoicing.prisma`**

Source: `bills_simple/api/prisma/models/invoicing.prisma`. Copy verbatim, with these adjustments:
- Keep all enums (`DocumentType`, `InvoiceStatus`, `QuoteStatus`, `TaxType`).
- Keep models: `DocumentNumberSequence`, `Tax`, `Document`, `Quote`, `Invoice`, `DocumentLineItem`, `DocumentLineItemTax`.
- Remove the `payments` relation on `Invoice` (it stays — Payment ships in payment.prisma; keep the relation).
- Remove the `expenses` relation on `Invoice` (drop entirely — expenses not in v0).
- Keep relation back-references to `Organization` and to `Client` as they are; consumer's schema is expected to have those models.

Write the file with the above content exactly matching the source's field/index/map declarations. Do NOT add `datasource` or `generator` blocks — these live in the consumer's root schema.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(cli): invoicing schema template"
```

---

### Task B2: client.prisma + product.prisma + payment.prisma templates

**Files:**
- Create: `packages/cli/templates/v0/client.prisma`
- Create: `packages/cli/templates/v0/product.prisma`
- Create: `packages/cli/templates/v0/payment.prisma`

- [ ] **Step 1: Write `client.prisma`**

Source: `bills_simple/api/prisma/models/client.prisma`. Copy with these adjustments:
- Drop `enum ContactType { CLIENT, PROVIDER }`.
- Drop the `type` field from `Client`.
- Drop `taxId` and `taxIdType` fields from `Client`.
- Drop the `expensesAsProvider` relation.
- Drop the index `@@index([organizationId, type])`; replace with `@@index([organizationId])`.

The resulting model fields: `id`, `organizationId`, `name`, `email`, `phone`, `country`, `addressLine1`, `city`, `state`, `postalCode`, `createdAt`, `updatedAt`. Keep the `documents Document[]` and `organization Organization @relation(...)` relations, and `@@map("clients")`.

- [ ] **Step 2: Write `product.prisma`**

Source: `bills_simple/api/prisma/models/product.prisma`. Copy verbatim (no changes).

- [ ] **Step 3: Write `payment.prisma`**

Extract from `bills_simple/api/prisma/models/invoicing.prisma`:
- Models: `PaymentMethod`, `DocumentPaymentMethod`, `Payment`.
- Enums: `PaymentMethodType`, `PaymentStatus`, `PaymentProvider`.

Copy verbatim. Drop the `expenses Expense[]` relation from `Invoice` (already done in B1) — that relation lives in the Invoice model in B1's file, so nothing to do here.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(cli): client/product/payment schema templates"
```

---

### Task B3: Test fixture Prisma schema (auth + billing composed)

**Files:**
- Create: `packages/invoicing-kit/tests/fixtures/prisma/schema.prisma`
- Create: `packages/invoicing-kit/tests/fixtures/prisma/auth.prisma`
- Create: `packages/invoicing-kit/tests/fixtures/copy-templates.ts`
- Create: `docker-compose.test.yml` (workspace root)
- Modify: `packages/invoicing-kit/package.json` (add `db:push` script + Prisma fixture setup)

- [ ] **Step 1: Write `docker-compose.test.yml` (workspace root)**

```yaml
services:
  postgres-test:
    image: postgres:16
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: invoicing_kit_test
    ports:
      - "5544:5432"
    tmpfs:
      - /var/lib/postgresql/data
```

(Note: `tmpfs` puts the DB in RAM — fast and resets between container restarts.)

- [ ] **Step 2: Write `tests/fixtures/prisma/auth.prisma`**

Minimal better-auth + organization-plugin schema. Reference: `bills_simple/api/prisma/schema.prisma` lines 16-207. Include:
- `model User` (id, name, email, emailVerified, image, createdAt, updatedAt, plus all the auth fields the source has).
- `model Session` (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId + relation, activeOrganizationId, impersonatedBy).
- `model Account` (id, accountId, providerId, userId + relation, tokens, password, createdAt, updatedAt).
- `model Verification` (id, identifier, value, expiresAt, createdAt, updatedAt).
- `model Organization` (id, name, slug, logo, createdAt, metadata, archivedAt).
- `model Member` (organization plugin: id, organizationId + relation, userId + relation, role, createdAt).
- `model Invitation` (organization plugin: id, organizationId + relation, email, role, status, expiresAt, inviterId + relation).

Use the source schema's exact field types and constraints. The package never reads these models — they exist purely so FK constraints from the billing schema (`organizationId`, etc.) hold.

- [ ] **Step 3: Write `tests/fixtures/prisma/schema.prisma`**

```prisma
generator client {
  provider        = "prisma-client-js"
  output          = "../../../src/generated/test-prisma"
  previewFeatures = ["prismaSchemaFolder"]
}

datasource db {
  provider = "postgresql"
  url      = env("INVOICING_KIT_TEST_DATABASE_URL")
}
```

(The `prismaSchemaFolder` preview is what lets all `*.prisma` files in this directory be merged into one schema. The auth.prisma file lives here; the billing files are copied here by the script in step 4 before running `prisma db push`.)

- [ ] **Step 4: Write `tests/fixtures/copy-templates.ts`**

```ts
// Copies billing schema templates from packages/cli/templates/v0/ into
// the Prisma fixture folder so `prisma generate` and `prisma db push` see them
// alongside auth.prisma via the prismaSchemaFolder preview.
import { cpSync, readdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const fixtureDir = resolve(here, "prisma");
const templatesDir = resolve(here, "../../../cli/templates/v0");

// Wipe any previously-copied template files (keep auth.prisma and schema.prisma).
const KEEP = new Set(["schema.prisma", "auth.prisma"]);
if (existsSync(fixtureDir)) {
  for (const f of readdirSync(fixtureDir)) {
    if (f.endsWith(".prisma") && !KEEP.has(f)) {
      rmSync(join(fixtureDir, f));
    }
  }
}

for (const f of readdirSync(templatesDir)) {
  if (f.endsWith(".prisma")) {
    cpSync(join(templatesDir, f), join(fixtureDir, f));
  }
}

console.log("Copied billing templates into test fixture");
```

- [ ] **Step 5: Add scripts to `packages/invoicing-kit/package.json`**

Add under `"scripts"`:
```json
"db:copy": "bun run tests/fixtures/copy-templates.ts",
"db:push": "bun run db:copy && prisma db push --schema tests/fixtures/prisma --skip-generate && prisma generate --schema tests/fixtures/prisma",
"db:up": "docker compose -f ../../docker-compose.test.yml up -d",
"db:down": "docker compose -f ../../docker-compose.test.yml down"
```

Also add to `devDependencies` if not present:
```json
"prisma": "^7.2.0",
"@prisma/client": "^7.2.0"
```

And add to top of file (after `"scripts"` block):
```json
"prisma": {
  "schema": "tests/fixtures/prisma"
}
```

- [ ] **Step 6: Run the full setup end-to-end**

```bash
# From repo root
docker compose -f docker-compose.test.yml up -d

# From packages/invoicing-kit
export INVOICING_KIT_TEST_DATABASE_URL=postgresql://test:test@localhost:5544/invoicing_kit_test
bun run db:push
```

Expected: Prisma client generates without errors into `src/generated/test-prisma/`, schema is pushed to the test DB. All tables exist (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `clients`, `products`, `taxes`, `documents`, `invoices`, `quotes`, `document_line_items`, `document_line_item_taxes`, `document_number_sequences`, `payments`, `payment_methods`, `document_payment_methods`).

Verify with:
```bash
docker compose -f docker-compose.test.yml exec postgres-test psql -U test -d invoicing_kit_test -c "\dt"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(core): Prisma fixture + docker-compose"
```

---

### Task B4: Prisma adapter factory uses the test-generated client

**Files:**
- Modify: `packages/invoicing-kit/src/adapters/prisma/index.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/client-type.ts`

The Prisma adapter must accept the consumer's `PrismaClient` type. For our tests, that's the client generated into `src/generated/test-prisma/`. In production, consumers pass their own. Use a structural typing approach so we don't bind to a specific generated client.

- [ ] **Step 1: Write `src/adapters/prisma/client-type.ts`**

```ts
// We can't import `@prisma/client` directly because the generated client lives
// in the consumer's project, not in our package. Use a minimal structural type
// covering only the model namespaces we need.
//
// At call sites inside the adapter we'll cast through `any` at the point we use
// model-specific operations, since each consumer's generated client has a
// different concrete shape. The boundary is typed; the inside is dynamic.
//
// In production this is fine: consumers pass `new PrismaClient()` and the
// `Repositories` shape we return is fully typed.

export type AnyPrismaClient = {
  $transaction: <T>(fn: (tx: AnyPrismaClient) => Promise<T>) => Promise<T>;
} & Record<string, unknown>;
```

- [ ] **Step 2: Update `src/adapters/prisma/index.ts` to use `AnyPrismaClient`**

Replace the `import type { PrismaClient } from "@prisma/client";` line with:

```ts
import type { AnyPrismaClient } from "./client-type";
```

Change the function signature to `prismaAdapter(prisma: AnyPrismaClient): Repositories`.

- [ ] **Step 3: Build + typecheck**

Run: `cd packages/invoicing-kit && bun run typecheck && bun run build`
Expected: both PASS. The package no longer imports `@prisma/client` (which is correct — it's a peer dep).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(prisma): structural client typing"
```

---

### Task B5: Adapter factories for the conformance suite

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/adapters.ts`

This defines the two `AdapterFactory` instances used by every domain conformance test.

- [ ] **Step 1: Write `tests/conformance/adapters.ts`**

```ts
import { inMemoryAdapter } from "../../src/adapters/memory";
import { prismaAdapter } from "../../src/adapters/prisma";
import type { AdapterFactory } from "./factories";
import type { Repositories } from "../../src/adapters/types";

// Lazy: only import the generated Prisma client when the Prisma factory runs,
// so unit-test-only files don't pay for it.
async function loadPrismaClient() {
  // @ts-expect-error — file generated at test setup
  const mod = await import("../../src/generated/test-prisma/index.js");
  return mod.PrismaClient as new () => any;
}

let sharedPrisma: any;

export const inMemoryFactory: AdapterFactory = {
  name: "in-memory",
  async create(): Promise<Repositories> {
    return inMemoryAdapter();
  },
  async reset(_repos: Repositories): Promise<void> {
    // In-memory is recreated per test; nothing to clean.
  },
};

export const prismaFactory: AdapterFactory = {
  name: "prisma",
  async create(): Promise<Repositories> {
    if (!sharedPrisma) {
      const PrismaClient = await loadPrismaClient();
      sharedPrisma = new PrismaClient();
    }
    // Truncate all billing tables before each test.
    await sharedPrisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "document_line_item_taxes",
        "document_line_items",
        "document_payment_methods",
        "payments",
        "payment_methods",
        "invoices",
        "quotes",
        "documents",
        "taxes",
        "products",
        "clients",
        "document_number_sequences",
        "invitation",
        "member",
        "organization",
        "session",
        "account",
        "verification",
        "user"
      RESTART IDENTITY CASCADE
    `);
    return prismaAdapter(sharedPrisma);
  },
  async reset(_repos: Repositories): Promise<void> {
    // Per-test truncation handled in create(); nothing to do after.
  },
};

export const allFactories: AdapterFactory[] = [inMemoryFactory, prismaFactory];
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "test(core): conformance adapter factories"
```

---

## Phase C — Per-domain conformance + implementations

Each task in this phase: write a conformance test for one repository, watch it fail against both adapters, implement the in-memory repo, watch it pass against in-memory + fail against Prisma, implement the Prisma repo + mappers, watch both pass, commit. Tasks ordered by dependency.

**Pattern note:** every domain task creates a file in `tests/conformance/<domain>.test.ts` that uses `describeForEachAdapter` to run the same tests twice. Prisma adapter implementations always go through a mapper from row → domain type; the row uses Prisma's generated types, the domain type comes from `src/types.ts`.

### Task C1: Seed helpers for foreign keys

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/seed.ts`

Every test needs an Organization (FK for client/product/etc.) and a User (FK for some auth-adjacent tests). A seed helper that creates the FK precondition rows lets each test stay focused.

- [ ] **Step 1: Write `tests/conformance/seed.ts`**

```ts
import type { Repositories } from "../../src/adapters/types";
import { randomUUID } from "node:crypto";

export interface Seeded {
  organizationId: string;
  userId: string;
}

/**
 * Seeds the minimum FK rows (organization + user + membership) for a test.
 * For Prisma: inserts directly via the underlying client.
 * For in-memory: no FK enforcement; returns synthetic ids.
 */
export async function seed(repos: Repositories): Promise<Seeded> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  // Tunnel access through the adapter's prisma field if present.
  const prisma = (repos as unknown as { __prisma?: any }).__prisma;
  if (prisma) {
    await prisma.user.create({
      data: {
        id: userId,
        name: "Test User",
        email: `${userId}@test.local`,
        emailVerified: true,
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Test Org",
        slug: `org-${organizationId.slice(0, 8)}`,
        createdAt: new Date(),
      },
    });
    await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId,
        userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
  }
  return { organizationId, userId };
}
```

- [ ] **Step 2: Expose `__prisma` on the Prisma adapter for seed access**

Modify `src/adapters/prisma/index.ts`:

After the `repos` object construction, before `return repos`, add:

```ts
(repos as unknown as { __prisma: AnyPrismaClient }).__prisma = prisma;
```

This is a non-public escape hatch used only by tests. It's not exported from `src/index.ts`.

- [ ] **Step 3: Build + typecheck**

Run: `cd packages/invoicing-kit && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(core): seed helper"
```

---

### Task C2: ClientRepository (conformance + in-memory + Prisma)

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/clients.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/clients.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/clients.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/mappers.ts`
- Modify: `packages/invoicing-kit/src/adapters/memory/index.ts`
- Modify: `packages/invoicing-kit/src/adapters/prisma/index.ts`

- [ ] **Step 1: Write conformance test `tests/conformance/clients.test.ts`**

```ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("ClientRepository", allFactories, (ctx) => {
  test("create then findById returns the same client", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.clients.create({
      organizationId,
      name: "Acme Co",
      email: "billing@acme.test",
      country: "US",
      addressLine1: "1 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });
    expect(created.id).toBeTruthy();
    expect(created.organizationId).toBe(organizationId);
    expect(created.createdAt).toBeInstanceOf(Date);

    const found = await ctx.repos.clients.findById(created.id, organizationId);
    expect(found).toMatchObject({
      id: created.id,
      name: "Acme Co",
      email: "billing@acme.test",
      country: "US",
    });
  });

  test("findById returns null for missing id", async () => {
    const { organizationId } = await seed(ctx.repos);
    const found = await ctx.repos.clients.findById("missing", organizationId);
    expect(found).toBeNull();
  });

  test("findById is scoped by organizationId", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const created = await ctx.repos.clients.create({
      organizationId: a.organizationId,
      name: "Org A Client",
    });
    const wrongOrg = await ctx.repos.clients.findById(created.id, b.organizationId);
    expect(wrongOrg).toBeNull();
  });

  test("list returns paginated results filtered by org and query", async () => {
    const { organizationId } = await seed(ctx.repos);
    for (let i = 0; i < 5; i++) {
      await ctx.repos.clients.create({ organizationId, name: `Client ${i}` });
    }
    await ctx.repos.clients.create({ organizationId, name: "Different Co" });

    const page1 = await ctx.repos.clients.list({ organizationId, page: 1, perPage: 3 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pageInfo).toEqual({
      page: 1,
      perPage: 3,
      totalCount: 6,
      pageCount: 2,
    });

    const filtered = await ctx.repos.clients.list({ organizationId, query: "Client" });
    expect(filtered.data.length).toBe(5);
  });

  test("update applies a partial patch", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.clients.create({ organizationId, name: "Before" });
    const updated = await ctx.repos.clients.update(c.id, organizationId, {
      name: "After",
      email: "new@test.local",
    });
    expect(updated.name).toBe("After");
    expect(updated.email).toBe("new@test.local");
  });

  test("update is scoped by organizationId", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const c = await ctx.repos.clients.create({
      organizationId: a.organizationId,
      name: "Org A",
    });
    await expect(
      ctx.repos.clients.update(c.id, b.organizationId, { name: "Hijacked" }),
    ).rejects.toThrow();
  });

  test("delete removes the client", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.clients.create({ organizationId, name: "DeleteMe" });
    await ctx.repos.clients.delete(c.id, organizationId);
    expect(await ctx.repos.clients.findById(c.id, organizationId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failures (`not implemented`)**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/clients.test.ts`
Expected: 14 failures (7 tests × 2 adapters), all with `not implemented` messages.

- [ ] **Step 3: Implement in-memory `ClientRepository`**

Create `src/adapters/memory/clients.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Client } from "../../types";
import type {
  ClientRepository,
  ClientUpdate,
  ListClientsArgs,
  NewClient,
  Page,
} from "../types";

export function createInMemoryClientRepository(): ClientRepository {
  const rows = new Map<string, Client>();

  const repo: ClientRepository = {
    async create(data: NewClient): Promise<Client> {
      const now = new Date();
      const row: Client = {
        id: randomUUID(),
        organizationId: data.organizationId,
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        country: data.country ?? null,
        addressLine1: data.addressLine1 ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        postalCode: data.postalCode ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },
    async findById(id, organizationId) {
      const row = rows.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    async list(args: ListClientsArgs): Promise<Page<Client>> {
      const all = Array.from(rows.values())
        .filter((r) => r.organizationId === args.organizationId)
        .filter((r) =>
          args.query
            ? r.name.toLowerCase().includes(args.query.toLowerCase())
            : true,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const totalCount = all.length;
      const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
      const data = all.slice((page - 1) * perPage, page * perPage);
      return { data, pageInfo: { page, perPage, totalCount, pageCount } };
    },
    async update(id, organizationId, patch: ClientUpdate) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) throw new Error("client not found");
      const updated: Client = {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },
    async delete(id, organizationId) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) return;
      rows.delete(id);
    },
  };
  return repo;
}
```

- [ ] **Step 4: Wire in-memory repo into the adapter**

Edit `src/adapters/memory/index.ts`. Replace the `clients: { ...notImpl stubs }` block with:

```ts
import { createInMemoryClientRepository } from "./clients";
// ...
const clients = createInMemoryClientRepository();
const repos: Repositories = {
  clients,
  // ...rest of stubs unchanged
};
```

- [ ] **Step 5: Run tests**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/clients.test.ts`
Expected: 7 in-memory tests pass; 7 Prisma tests fail with `prismaAdapter: clients.* not implemented`.

- [ ] **Step 6: Add `clientRowToDomain` mapper**

Create `src/adapters/prisma/mappers.ts`:

```ts
// Row → domain DTO mappers for the Prisma adapter.
// Each mapper converts Prisma's generated row shape into the package's plain TS types.
//
// Conventions:
// - Prisma `Decimal` → `string` (via `.toString()`).
// - Prisma `BigInt` → `bigint` (already correct, just narrow).
// - `Json` → `unknown`.

import type { Client } from "../../types";

export function clientRowToDomain(row: any): Client {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    addressLine1: row.addressLine1 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    postalCode: row.postalCode ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 7: Implement Prisma `ClientRepository`**

Create `src/adapters/prisma/clients.ts`:

```ts
import type { Client } from "../../types";
import type {
  ClientRepository,
  ClientUpdate,
  ListClientsArgs,
  NewClient,
  Page,
} from "../types";
import type { AnyPrismaClient } from "./client-type";
import { clientRowToDomain } from "./mappers";

export function createPrismaClientRepository(
  prisma: AnyPrismaClient,
): ClientRepository {
  const db = prisma as any;
  return {
    async create(data: NewClient): Promise<Client> {
      const row = await db.client.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          email: data.email ?? null,
          phone: data.phone ?? null,
          country: data.country ?? null,
          addressLine1: data.addressLine1 ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postalCode: data.postalCode ?? null,
        },
      });
      return clientRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.client.findFirst({ where: { id, organizationId } });
      return row ? clientRowToDomain(row) : null;
    },
    async list(args: ListClientsArgs): Promise<Page<Client>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const where: any = { organizationId: args.organizationId };
      if (args.query) {
        where.name = { contains: args.query, mode: "insensitive" };
      }
      const [rows, totalCount] = await Promise.all([
        db.client.findMany({
          where,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
        }),
        db.client.count({ where }),
      ]);
      return {
        data: rows.map(clientRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: ClientUpdate) {
      // Prisma's `update` needs a unique `where`; `(id, organizationId)` isn't a
      // declared compound unique on this table, so use `updateMany` to apply the
      // org-scoped filter and re-fetch by id.
      const { count } = await db.client.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("client not found");
      const row = await db.client.findUnique({ where: { id } });
      return clientRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.client.deleteMany({ where: { id, organizationId } });
    },
  };
}
```

- [ ] **Step 8: Wire Prisma repo into the adapter**

Edit `src/adapters/prisma/index.ts`. Replace the `clients: { ...notImpl stubs }` block:

```ts
import { createPrismaClientRepository } from "./clients";
// ...
const clients = createPrismaClientRepository(prisma);
const repos: Repositories = {
  clients,
  // ...rest of stubs unchanged
};
```

- [ ] **Step 9: Run tests**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/clients.test.ts`
Expected: 14/14 pass (7 in-memory + 7 Prisma).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(adapters): ClientRepository for in-memory + Prisma"
```

---

### Task C3: ProductRepository

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/products.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/products.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/products.ts`
- Modify: `packages/invoicing-kit/src/adapters/prisma/mappers.ts` (add `productRowToDomain`)
- Modify: `packages/invoicing-kit/src/adapters/memory/index.ts`
- Modify: `packages/invoicing-kit/src/adapters/prisma/index.ts`

- [ ] **Step 1: Write conformance test**

```ts
// tests/conformance/products.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("ProductRepository", allFactories, (ctx) => {
  test("create stores Decimal price as string", async () => {
    const { organizationId } = await seed(ctx.repos);
    const created = await ctx.repos.products.create({
      organizationId,
      name: "Consulting hour",
      description: "Senior rate",
      price: "150.00",
    });
    expect(created.price).toBe("150.00");
    expect(typeof created.price).toBe("string");
  });

  test("findById is org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const created = await ctx.repos.products.create({
      organizationId: a.organizationId,
      name: "X",
      price: "10.00",
    });
    expect(await ctx.repos.products.findById(created.id, b.organizationId)).toBeNull();
  });

  test("list paginates", async () => {
    const { organizationId } = await seed(ctx.repos);
    for (let i = 0; i < 4; i++) {
      await ctx.repos.products.create({
        organizationId,
        name: `Product ${i}`,
        price: "1.00",
      });
    }
    const p1 = await ctx.repos.products.list({ organizationId, page: 1, perPage: 2 });
    expect(p1.data).toHaveLength(2);
    expect(p1.pageInfo.totalCount).toBe(4);
  });

  test("update patches name and price", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.products.create({
      organizationId,
      name: "Old",
      price: "5.00",
    });
    const u = await ctx.repos.products.update(c.id, organizationId, {
      name: "New",
      price: "9.99",
    });
    expect(u.name).toBe("New");
    expect(u.price).toBe("9.99");
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const c = await ctx.repos.products.create({
      organizationId,
      name: "X",
      price: "1.00",
    });
    await ctx.repos.products.delete(c.id, organizationId);
    expect(await ctx.repos.products.findById(c.id, organizationId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail with `not implemented`**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/products.test.ts`
Expected: 10 failures.

- [ ] **Step 3: Implement in-memory `ProductRepository`**

Create `src/adapters/memory/products.ts` following the same pattern as `clients.ts`. Key differences: `price: string` (no nullability), `description: string | null`. Sort `list` by `createdAt desc`. Filter by `args.query` against `name`.

- [ ] **Step 4: Wire into memory adapter** — replace `products` stubs with `createInMemoryProductRepository()`.

- [ ] **Step 5: Run tests — in-memory passes, Prisma fails**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/products.test.ts`
Expected: 5 pass, 5 fail.

- [ ] **Step 6: Add `productRowToDomain` to mappers**

In `src/adapters/prisma/mappers.ts`, add:

```ts
import type { Product } from "../../types";

export function productRowToDomain(row: any): Product {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    price: row.price.toString(), // Prisma Decimal -> string
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 7: Implement Prisma `ProductRepository`**

Create `src/adapters/prisma/products.ts` following the same pattern as `clients.ts`. Use `productRowToDomain` for all returns. Pagination + count + filter same as clients.

For `update` use the `updateMany` + re-fetch pattern from C2 Step 7. Also note: for `update`, when sending `price`, pass it as a string — Prisma 7 accepts string for `Decimal` columns.

- [ ] **Step 8: Wire into Prisma adapter** — replace `products` stubs with `createPrismaProductRepository(prisma)`.

- [ ] **Step 9: Run tests**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/products.test.ts`
Expected: 10/10 pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(adapters): ProductRepository for in-memory + Prisma"
```

---

### Task C4: TaxRepository

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/taxes.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/taxes.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/taxes.ts`
- Modify: `packages/invoicing-kit/src/adapters/prisma/mappers.ts` (add `taxRowToDomain`)
- Modify: both adapter `index.ts` files

- [ ] **Step 1: Write conformance test**

```ts
// tests/conformance/taxes.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("TaxRepository", allFactories, (ctx) => {
  test("create and findById", async () => {
    const { organizationId } = await seed(ctx.repos);
    const tax = await ctx.repos.taxes.create({
      organizationId,
      name: "VAT",
      type: "PERCENTAGE",
      rate: "0.2100",
    });
    expect(tax.type).toBe("PERCENTAGE");
    expect(tax.rate).toBe("0.2100");
    expect(tax.isActive).toBe(true);  // defaulted
    expect(tax.isDefault).toBe(false); // defaulted
  });

  test("list filters by isActive", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.taxes.create({
      organizationId,
      name: "Active",
      type: "PERCENTAGE",
      rate: "0.10",
      isActive: true,
    });
    await ctx.repos.taxes.create({
      organizationId,
      name: "Inactive",
      type: "PERCENTAGE",
      rate: "0.10",
      isActive: false,
    });
    const active = await ctx.repos.taxes.list({ organizationId, isActive: true });
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe("Active");
  });

  test("findManyById returns rows in requested order and skips wrong-org", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const t1 = await ctx.repos.taxes.create({
      organizationId: a.organizationId,
      name: "T1",
      type: "PERCENTAGE",
      rate: "0.10",
    });
    const t2 = await ctx.repos.taxes.create({
      organizationId: a.organizationId,
      name: "T2",
      type: "FIXED",
      rate: "5",
    });
    const tOther = await ctx.repos.taxes.create({
      organizationId: b.organizationId,
      name: "Other",
      type: "PERCENTAGE",
      rate: "0.20",
    });
    const found = await ctx.repos.taxes.findManyById(
      [t1.id, t2.id, tOther.id],
      a.organizationId,
    );
    expect(found.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  test("clearDefaultExcept unsets isDefault on all rows except keepId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const a = await ctx.repos.taxes.create({
      organizationId,
      name: "A",
      type: "PERCENTAGE",
      rate: "0.10",
      isDefault: true,
    });
    const b = await ctx.repos.taxes.create({
      organizationId,
      name: "B",
      type: "PERCENTAGE",
      rate: "0.10",
      isDefault: true,
    });
    await ctx.repos.taxes.clearDefaultExcept(organizationId, b.id);
    const aRow = await ctx.repos.taxes.findById(a.id, organizationId);
    const bRow = await ctx.repos.taxes.findById(b.id, organizationId);
    expect(aRow!.isDefault).toBe(false);
    expect(bRow!.isDefault).toBe(true);
  });

  test("clearDefaultExcept with keepId=null clears all", async () => {
    const { organizationId } = await seed(ctx.repos);
    const a = await ctx.repos.taxes.create({
      organizationId,
      name: "A",
      type: "PERCENTAGE",
      rate: "0.10",
      isDefault: true,
    });
    await ctx.repos.taxes.clearDefaultExcept(organizationId, null);
    const aRow = await ctx.repos.taxes.findById(a.id, organizationId);
    expect(aRow!.isDefault).toBe(false);
  });

  test("update and delete", async () => {
    const { organizationId } = await seed(ctx.repos);
    const t = await ctx.repos.taxes.create({
      organizationId,
      name: "X",
      type: "PERCENTAGE",
      rate: "0.10",
    });
    const u = await ctx.repos.taxes.update(t.id, organizationId, { name: "X2" });
    expect(u.name).toBe("X2");
    await ctx.repos.taxes.delete(t.id, organizationId);
    expect(await ctx.repos.taxes.findById(t.id, organizationId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect all failures**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/taxes.test.ts`
Expected: 12 failures.

- [ ] **Step 3: Implement in-memory `TaxRepository`**

Create `src/adapters/memory/taxes.ts` following the established pattern. Use a `Map<string, Tax>`. `create` defaults `isActive=true`, `isDefault=false`, `description=null`. `list` filters by org + optional `isActive`, sorts by `createdAt desc`. `findManyById` returns rows whose `id` is in the input set AND whose `organizationId` matches (no specific order required). `clearDefaultExcept` iterates and sets `isDefault=false` on every row whose `organizationId` matches and whose `id !== keepId`.

- [ ] **Step 4: Wire into memory adapter.**

- [ ] **Step 5: Run tests — in-memory passes, Prisma fails.**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/taxes.test.ts`
Expected: 6 pass, 6 fail.

- [ ] **Step 6: Add `taxRowToDomain` to mappers**

```ts
import type { Tax, TaxType } from "../../types";

export function taxRowToDomain(row: any): Tax {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    type: row.type as TaxType,
    rate: row.rate.toString(),
    isActive: row.isActive,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 7: Implement Prisma `TaxRepository`**

Create `src/adapters/prisma/taxes.ts`. Pattern same as clients/products. Notable methods:
- `findManyById`: `db.tax.findMany({ where: { id: { in: ids }, organizationId } })`.
- `clearDefaultExcept`: `db.tax.updateMany({ where: { organizationId, isDefault: true, ...(keepId ? { NOT: { id: keepId } } : {}) }, data: { isDefault: false } })`.
- `update` uses the `updateMany` + re-fetch pattern.

- [ ] **Step 8: Wire into Prisma adapter.**

- [ ] **Step 9: Run tests**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/taxes.test.ts`
Expected: 12/12 pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(adapters): TaxRepository for in-memory + Prisma"
```

---

### Task C5: DocumentSequenceRepository (with atomicity test)

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/sequences.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/sequences.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/sequences.ts`
- Modify: mappers + both adapter index files

This is the most subtle repo because `incrementAndGet` must be atomic — concurrent calls from two transactions must produce two different numbers without skipping or repeating.

- [ ] **Step 1: Write conformance test**

```ts
// tests/conformance/sequences.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("DocumentSequenceRepository", allFactories, (ctx) => {
  test("ensure creates row at nextNumber=1, second call no-ops", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    const seq = await ctx.repos.documentSequences.find({
      organizationId,
      documentType: "INVOICE",
    });
    expect(seq).not.toBeNull();
    expect(seq!.nextNumber).toBe(1);
  });

  test("incrementAndGet returns sequential numbers", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    const n1 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "INVOICE",
    });
    const n2 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "INVOICE",
    });
    expect(n1).toBe(1);
    expect(n2).toBe(2);
  });

  test("incrementAndGet is per-(org, type)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "QUOTE",
    });
    const i1 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "INVOICE",
    });
    const q1 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "QUOTE",
    });
    expect(i1).toBe(1);
    expect(q1).toBe(1);
  });

  test("concurrent incrementAndGet yields distinct numbers", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        ctx.repos.documentSequences.incrementAndGet({
          organizationId,
          documentType: "INVOICE",
        }),
      ),
    );
    const sorted = [...results].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
```

- [ ] **Step 2: Run tests — expect failures.**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/sequences.test.ts`
Expected: 8 failures.

- [ ] **Step 3: Implement in-memory `DocumentSequenceRepository`**

```ts
// src/adapters/memory/sequences.ts
import { randomUUID } from "node:crypto";
import type { DocumentNumberSequence, DocumentType } from "../../types";
import type { DocumentSequenceRepository } from "../types";

type Key = `${string}:${DocumentType}`;
const key = (org: string, t: DocumentType): Key => `${org}:${t}`;

export function createInMemoryDocumentSequenceRepository(): DocumentSequenceRepository {
  const rows = new Map<Key, DocumentNumberSequence>();

  return {
    async ensure({ organizationId, documentType, prefix }) {
      const k = key(organizationId, documentType);
      if (rows.has(k)) return;
      rows.set(k, {
        id: randomUUID(),
        organizationId,
        documentType,
        prefix: prefix ?? null,
        nextNumber: 1,
        updatedAt: new Date(),
      });
    },
    async incrementAndGet({ organizationId, documentType }) {
      const k = key(organizationId, documentType);
      const row = rows.get(k);
      if (!row) throw new Error("sequence not initialized; call ensure() first");
      const value = row.nextNumber;
      row.nextNumber += 1;
      row.updatedAt = new Date();
      return value;
    },
    async find({ organizationId, documentType }) {
      return rows.get(key(organizationId, documentType)) ?? null;
    },
  };
}
```

- [ ] **Step 4: Wire into memory adapter, run tests.**

Expected: 4 in-memory tests pass; 4 Prisma fail.

- [ ] **Step 5: Add `documentSequenceRowToDomain` to mappers**

```ts
import type { DocumentNumberSequence, DocumentType } from "../../types";

export function documentSequenceRowToDomain(row: any): DocumentNumberSequence {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentType: row.documentType as DocumentType,
    prefix: row.prefix ?? null,
    nextNumber: row.nextNumber,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 6: Implement Prisma `DocumentSequenceRepository` with atomic increment**

```ts
// src/adapters/prisma/sequences.ts
import type { DocumentSequenceRepository } from "../types";
import type { AnyPrismaClient } from "./client-type";
import { documentSequenceRowToDomain } from "./mappers";

export function createPrismaDocumentSequenceRepository(
  prisma: AnyPrismaClient,
): DocumentSequenceRepository {
  const db = prisma as any;
  return {
    async ensure({ organizationId, documentType, prefix }) {
      await db.documentNumberSequence.upsert({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
        create: {
          organizationId,
          documentType,
          prefix: prefix ?? null,
          nextNumber: 1,
        },
        update: {}, // no-op
      });
    },
    async incrementAndGet({ organizationId, documentType }) {
      // Atomic: update returns the row with the new value.
      // We want the PRE-increment value, so subtract 1 from what Prisma returns.
      const row = await db.documentNumberSequence.update({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
        data: { nextNumber: { increment: 1 } },
      });
      return row.nextNumber - 1;
    },
    async find({ organizationId, documentType }) {
      const row = await db.documentNumberSequence.findUnique({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
      });
      return row ? documentSequenceRowToDomain(row) : null;
    },
  };
}
```

Note: the unique compound key generator in Prisma is named `<field1>_<field2>` by default, derived from the `@@unique([organizationId, documentType])` constraint. Verify the exact name in the generated client at `src/generated/test-prisma/index.d.ts` — adjust if Prisma produced a different name.

- [ ] **Step 7: Wire into Prisma adapter, run tests.**

Expected: 8/8 pass. The concurrent test passes because `update({ data: { nextNumber: { increment: 1 } } })` is atomic at the row level.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(adapters): DocumentSequenceRepository with atomic increment"
```

---

### Task C6: DocumentRepository (line items + per-line taxes + payment method links)

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/documents.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/documents.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/documents.ts`
- Modify: mappers + both adapter index files

`DocumentRepository.create` is the most complex single operation: inserts a `Document` row, all `DocumentLineItem` rows, all `DocumentLineItemTax` rows, and any `DocumentPaymentMethod` links — atomically.

- [ ] **Step 1: Write conformance test**

```ts
// tests/conformance/documents.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function setup(ctx: { repos: any }, organizationId: string) {
  const client = await ctx.repos.clients.create({
    organizationId,
    name: "Test client",
  });
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const tax = await ctx.repos.taxes.create({
    organizationId,
    name: "VAT",
    type: "PERCENTAGE",
    rate: "0.2100",
  });
  return { client, product, tax };
}

describeForEachAdapter("DocumentRepository", allFactories, (ctx) => {
  test("create with line items and taxes", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product, tax } = await setup(ctx, organizationId);

    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      documentNumberPrefix: "INV",
      issueDate: new Date("2026-01-15"),
      dueDate: new Date("2026-02-15"),
      notes: "Net 30",
      subtotal: 10000n,
      tax: 2100n,
      total: 12100n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1.0000",
          price: 10000n,
          description: "Consulting",
          taxes: [{ taxId: tax.id, taxAmount: 2100n }],
          taxAmount: 2100n,
          total: 12100n,
        },
      ],
      paymentMethodIds: [],
    });

    expect(doc.id).toBeTruthy();
    expect(doc.documentNumber).toBe(1);
    expect(doc.lineItems).toHaveLength(1);
    expect(doc.lineItems[0]!.taxes).toHaveLength(1);
    expect(doc.lineItems[0]!.taxes[0]!.taxId).toBe(tax.id);
    expect(doc.subtotal).toBe(10000n);
    expect(doc.total).toBe(12100n);
  });

  test("findById returns the document with line items and taxes", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const created = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date("2026-01-15"),
      subtotal: 100n,
      tax: 0n,
      total: 100n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 100n,
          taxes: [],
          taxAmount: 0n,
          total: 100n,
        },
      ],
    });
    const found = await ctx.repos.documents.findById(created.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.lineItems).toHaveLength(1);
  });

  test("findById is org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { client, product } = await setup(ctx, a.organizationId);
    const created = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId: a.organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date(),
      subtotal: 0n,
      tax: 0n,
      total: 0n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 0n,
          taxes: [],
          taxAmount: 0n,
          total: 0n,
        },
      ],
    });
    expect(
      await ctx.repos.documents.findById(created.id, b.organizationId),
    ).toBeNull();
  });

  test("replaceLineItems swaps the line items wholesale", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date(),
      subtotal: 100n,
      tax: 0n,
      total: 100n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 100n,
          taxes: [],
          taxAmount: 0n,
          total: 100n,
        },
      ],
    });
    await ctx.repos.documents.replaceLineItems(doc.id, organizationId, [
      {
        productId: product.id,
        quantity: "2",
        price: 100n,
        taxes: [],
        taxAmount: 0n,
        total: 200n,
      },
    ]);
    const updated = await ctx.repos.documents.findById(doc.id, organizationId);
    expect(updated!.lineItems).toHaveLength(1);
    expect(updated!.lineItems[0]!.quantity).toBe("2");
    expect(updated!.lineItems[0]!.total).toBe(200n);
  });

  test("update patches scalar fields", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date("2026-01-15"),
      subtotal: 100n,
      tax: 0n,
      total: 100n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 100n,
          taxes: [],
          taxAmount: 0n,
          total: 100n,
        },
      ],
    });
    const updated = await ctx.repos.documents.update(doc.id, organizationId, {
      notes: "Updated note",
      total: 150n,
    });
    expect(updated.notes).toBe("Updated note");
    expect(updated.total).toBe(150n);
  });

  test("delete cascades to line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { client, product } = await setup(ctx, organizationId);
    const doc = await ctx.repos.documents.create({
      type: "INVOICE",
      organizationId,
      clientId: client.id,
      documentNumber: 1,
      issueDate: new Date(),
      subtotal: 0n,
      tax: 0n,
      total: 0n,
      lineItems: [
        {
          productId: product.id,
          quantity: "1",
          price: 0n,
          taxes: [],
          taxAmount: 0n,
          total: 0n,
        },
      ],
    });
    await ctx.repos.documents.delete(doc.id, organizationId);
    expect(await ctx.repos.documents.findById(doc.id, organizationId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failures.**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/documents.test.ts`
Expected: 12 failures.

- [ ] **Step 3: Implement in-memory `DocumentRepository`**

Create `src/adapters/memory/documents.ts`. Use three Maps: `docs: Map<string, Document>`, `lineItems: Map<string, DocumentLineItem>`, `lineItemTaxes: Map<string, DocumentLineItemTax>`, `docPaymentMethods: Map<string, DocumentPaymentMethod>`.

`create`:
1. Generate ids for the document, each line item, each line-item-tax, each payment-method link.
2. Insert all rows.
3. Return the document with `lineItems` array (each enriched with its `taxes` array).

`findById`:
1. Lookup document by id+org.
2. Filter line items by `documentId`.
3. For each line item, filter its taxes by `lineItemId`.
4. Filter payment methods by `documentId`.
5. Return composed `DocumentWithRelations`.

`replaceLineItems`:
1. Find document by id+org or throw.
2. Delete all `lineItems`/`lineItemTaxes` rows whose `lineItemId` matches existing line items.
3. Insert new ones.

`setPaymentMethods`:
1. Find document by id+org or throw.
2. Delete existing `DocumentPaymentMethod` rows for the doc.
3. Insert new ones (skip dups).

`update`: shallow merge patch into the document row.

`delete`: remove document + cascade to line items + taxes + payment-method links.

- [ ] **Step 4: Wire into memory adapter, run tests.**

Expected: 6 in-memory pass; 6 Prisma fail.

- [ ] **Step 5: Add document mappers**

```ts
import type {
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentPaymentMethod,
  DocumentType,
} from "../../types";
import type { DocumentWithRelations } from "../types";

export function documentRowToDomain(row: any): Document {
  return {
    id: row.id,
    type: row.type as DocumentType,
    organizationId: row.organizationId,
    clientId: row.clientId,
    documentNumberPrefix: row.documentNumberPrefix ?? null,
    documentNumber: row.documentNumber,
    issueDate: row.issueDate,
    dueDate: row.dueDate ?? null,
    notes: row.notes ?? null,
    subtotal: row.subtotal ?? null,
    tax: row.tax ?? null,
    total: row.total ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function documentLineItemRowToDomain(row: any): DocumentLineItem {
  return {
    id: row.id,
    documentId: row.documentId,
    productId: row.productId,
    quantity: row.quantity.toString(),
    price: row.price,
    taxAmount: row.taxAmount ?? 0n,
    total: row.total,
    description: row.description ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function documentLineItemTaxRowToDomain(row: any): DocumentLineItemTax {
  return {
    id: row.id,
    lineItemId: row.lineItemId,
    taxId: row.taxId,
    taxAmount: row.taxAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function documentPaymentMethodRowToDomain(row: any): DocumentPaymentMethod {
  return {
    id: row.id,
    documentId: row.documentId,
    paymentMethodId: row.paymentMethodId,
    createdAt: row.createdAt,
  };
}

export function documentWithRelationsRowToDomain(row: any): DocumentWithRelations {
  return {
    ...documentRowToDomain(row),
    lineItems: (row.lineItems ?? []).map((li: any) => ({
      ...documentLineItemRowToDomain(li),
      taxes: (li.taxes ?? []).map(documentLineItemTaxRowToDomain),
    })),
    paymentMethods: (row.paymentMethods ?? []).map(documentPaymentMethodRowToDomain),
  };
}
```

- [ ] **Step 6: Implement Prisma `DocumentRepository`**

Create `src/adapters/prisma/documents.ts`:

```ts
import type {
  DocumentRepository,
  DocumentUpdate,
  DocumentWithRelations,
  NewDocument,
  NewDocumentLineItem,
} from "../types";
import type { Document } from "../../types";
import type { AnyPrismaClient } from "./client-type";
import {
  documentRowToDomain,
  documentWithRelationsRowToDomain,
} from "./mappers";

const FULL_INCLUDE = {
  lineItems: { include: { taxes: true } },
  paymentMethods: true,
};

export function createPrismaDocumentRepository(
  prisma: AnyPrismaClient,
): DocumentRepository {
  const db = prisma as any;
  return {
    async create(data: NewDocument): Promise<DocumentWithRelations> {
      const row = await db.document.create({
        data: {
          type: data.type,
          organizationId: data.organizationId,
          clientId: data.clientId,
          documentNumberPrefix: data.documentNumberPrefix ?? null,
          documentNumber: data.documentNumber,
          issueDate: data.issueDate,
          dueDate: data.dueDate ?? null,
          notes: data.notes ?? null,
          subtotal: data.subtotal,
          tax: data.tax,
          total: data.total,
          lineItems: {
            create: data.lineItems.map((li: NewDocumentLineItem) => ({
              productId: li.productId,
              quantity: li.quantity,
              price: li.price,
              taxAmount: li.taxAmount,
              total: li.total,
              description: li.description ?? null,
              taxes: {
                create: li.taxes.map((t) => ({
                  taxId: t.taxId,
                  taxAmount: t.taxAmount,
                })),
              },
            })),
          },
          paymentMethods:
            data.paymentMethodIds && data.paymentMethodIds.length > 0
              ? {
                  create: data.paymentMethodIds.map((paymentMethodId) => ({
                    paymentMethodId,
                  })),
                }
              : undefined,
        },
        include: FULL_INCLUDE,
      });
      return documentWithRelationsRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.document.findFirst({
        where: { id, organizationId },
        include: FULL_INCLUDE,
      });
      return row ? documentWithRelationsRowToDomain(row) : null;
    },
    async update(id, organizationId, patch: DocumentUpdate): Promise<Document> {
      const { count } = await db.document.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("document not found");
      const row = await db.document.findUnique({ where: { id } });
      return documentRowToDomain(row);
    },
    async replaceLineItems(documentId, organizationId, lineItems) {
      await prisma.$transaction(async (tx: any) => {
        const owns = await tx.document.findFirst({
          where: { id: documentId, organizationId },
          select: { id: true },
        });
        if (!owns) throw new Error("document not found");
        await tx.documentLineItem.deleteMany({ where: { documentId } });
        for (const li of lineItems) {
          await tx.documentLineItem.create({
            data: {
              documentId,
              productId: li.productId,
              quantity: li.quantity,
              price: li.price,
              taxAmount: li.taxAmount,
              total: li.total,
              description: li.description ?? null,
              taxes: {
                create: li.taxes.map((t) => ({
                  taxId: t.taxId,
                  taxAmount: t.taxAmount,
                })),
              },
            },
          });
        }
      });
    },
    async setPaymentMethods(documentId, organizationId, paymentMethodIds) {
      await prisma.$transaction(async (tx: any) => {
        const owns = await tx.document.findFirst({
          where: { id: documentId, organizationId },
          select: { id: true },
        });
        if (!owns) throw new Error("document not found");
        await tx.documentPaymentMethod.deleteMany({ where: { documentId } });
        if (paymentMethodIds.length === 0) return;
        await tx.documentPaymentMethod.createMany({
          data: paymentMethodIds.map((paymentMethodId) => ({
            documentId,
            paymentMethodId,
          })),
          skipDuplicates: true,
        });
      });
    },
    async delete(id, organizationId) {
      await db.document.deleteMany({ where: { id, organizationId } });
    },
  };
}
```

- [ ] **Step 7: Wire into Prisma adapter, run tests.**

Expected: 12/12 pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(adapters): DocumentRepository with line items + taxes"
```

---

### Task C7: InvoiceRepository

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/invoices.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/invoices.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/invoices.ts`
- Modify: mappers + both adapter index files

`Invoice` is a thin row over `Document` — most data access goes through Document. Notable: `findByDocumentNumber` (uniqueness check pre-create), `findById` (returns invoice + document + line items), `list` (with filters).

- [ ] **Step 1: Write conformance test**

```ts
// tests/conformance/invoices.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createInvoiceFixture(
  ctx: { repos: any },
  organizationId: string,
  overrides: Partial<{
    documentNumber: number;
    documentNumberPrefix: string | null;
    status: "draft" | "sent" | "paid";
  }> = {},
) {
  const client = await ctx.repos.clients.create({
    organizationId,
    name: "Test client",
  });
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const document = await ctx.repos.documents.create({
    type: "INVOICE",
    organizationId,
    clientId: client.id,
    documentNumber: overrides.documentNumber ?? 1,
    documentNumberPrefix: overrides.documentNumberPrefix ?? null,
    issueDate: new Date("2026-01-15"),
    subtotal: 100n,
    tax: 0n,
    total: 100n,
    lineItems: [
      {
        productId: product.id,
        quantity: "1",
        price: 100n,
        taxes: [],
        taxAmount: 0n,
        total: 100n,
      },
    ],
  });
  const invoice = await ctx.repos.invoices.create({
    documentId: document.id,
    status: overrides.status ?? "draft",
  });
  return { client, product, document, invoice };
}

describeForEachAdapter("InvoiceRepository", allFactories, (ctx) => {
  test("create and findById returns invoice with document + line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const found = await ctx.repos.invoices.findById(invoice.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.document.lineItems).toHaveLength(1);
    expect(found!.status).toBe("draft");
  });

  test("findById org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, a.organizationId);
    expect(await ctx.repos.invoices.findById(invoice.id, b.organizationId)).toBeNull();
  });

  test("findByDocumentNumber matches on (org, prefix, number)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 42,
      documentNumberPrefix: "INV",
    });
    const found = await ctx.repos.invoices.findByDocumentNumber({
      organizationId,
      prefix: "INV",
      documentNumber: 42,
    });
    expect(found).not.toBeNull();
    const missing = await ctx.repos.invoices.findByDocumentNumber({
      organizationId,
      prefix: "INV",
      documentNumber: 43,
    });
    expect(missing).toBeNull();
  });

  test("list filters by status and clientId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const f1 = await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 1,
      status: "draft",
    });
    await createInvoiceFixture(ctx, organizationId, {
      documentNumber: 2,
      status: "paid",
    });
    const drafts = await ctx.repos.invoices.list({
      organizationId,
      status: "draft",
    });
    expect(drafts.data).toHaveLength(1);
    const byClient = await ctx.repos.invoices.list({
      organizationId,
      clientId: f1.client.id,
    });
    expect(byClient.data.length).toBeGreaterThanOrEqual(1);
  });

  test("list filters by issue date range", async () => {
    const { organizationId } = await seed(ctx.repos);
    // Fixture creates issueDate 2026-01-15
    await createInvoiceFixture(ctx, organizationId, { documentNumber: 1 });
    const within = await ctx.repos.invoices.list({
      organizationId,
      issueDateFrom: new Date("2026-01-01"),
      issueDateTo: new Date("2026-01-31"),
    });
    expect(within.data).toHaveLength(1);
    const outside = await ctx.repos.invoices.list({
      organizationId,
      issueDateFrom: new Date("2027-01-01"),
    });
    expect(outside.data).toHaveLength(0);
  });

  test("update patches status and paidDate", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const paid = new Date("2026-02-01");
    const updated = await ctx.repos.invoices.update(invoice.id, organizationId, {
      status: "paid",
      paidDate: paid,
    });
    expect(updated.status).toBe("paid");
    expect(updated.paidDate?.toISOString()).toBe(paid.toISOString());
  });

  test("delete removes the invoice (and via document cascade, line items)", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    await ctx.repos.invoices.delete(invoice.id, organizationId);
    expect(await ctx.repos.invoices.findById(invoice.id, organizationId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failures.**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/invoices.test.ts`
Expected: 14 failures.

- [ ] **Step 3: Implement in-memory `InvoiceRepository`**

Create `src/adapters/memory/invoices.ts`. Use `Map<string, Invoice>`. Cross-reference the in-memory documents repo for joined reads. Since memory repos don't share state by default, pass the documents repo as a constructor argument:

```ts
import type { InvoiceRepository, ListInvoicesArgs, InvoiceWithDocument, Page, DocumentRepository } from "../types";
// ...
export function createInMemoryInvoiceRepository(
  documents: DocumentRepository,
): InvoiceRepository {
  const rows = new Map<string, Invoice>();
  // ...
}
```

Then in `memory/index.ts`:

```ts
const documents = createInMemoryDocumentRepository();
const invoices = createInMemoryInvoiceRepository(documents);
```

Implement methods:
- `create(data)`: generate id, store with all fields.
- `findById(id, org)`: lookup invoice, then `documents.findById(invoice.documentId, org)`. Return null if either fails.
- `findByDocumentNumber({ org, prefix, documentNumber })`: scan invoices, for each fetch its document, match on type=INVOICE + organizationId + prefix + documentNumber.
- `list(args)`: scan invoices, fetch each document, apply filters (status, clientId, issueDate range), sort by document.createdAt desc, paginate.
- `update`: merge patch.
- `delete`: remove the invoice row only. Do NOT cascade-delete the document — in the Prisma schema the Document is the parent and `onDelete: Cascade` runs in the opposite direction (document→invoice). The conformance test only asserts that `findById` returns null after delete.

Wait — the test "delete removes the invoice (and via document cascade, line items)" suggests deleting the invoice DOES delete line items. In Prisma the `Document → Invoice` relation is `Document` parent → `Invoice` child. `onDelete: Cascade` on the Invoice's FK to Document means deleting the *document* cascades to the invoice, not the other way around.

So "deleting an invoice" should:
1. Delete the invoice row.
2. Optionally also delete the parent document (the service layer in Plan 2 may decide this; but at the repo layer, plain delete of just the invoice is sufficient).

Adjust the test expectation: after `invoices.delete(invoice.id, organizationId)`, `findById` should return null (because the invoice row is gone). The line items still exist in the document. That's fine — the test only checks `findById` returns null.

So in-memory `delete`: lookup invoice; verify org matches via the linked document; delete invoice row.

- [ ] **Step 4: Wire into memory adapter, run tests.**

Expected: 7 in-memory pass; 7 Prisma fail.

- [ ] **Step 5: Add `invoiceRowToDomain` and `invoiceWithDocumentRowToDomain` to mappers**

```ts
import type { Invoice, InvoiceStatus } from "../../types";
import type { InvoiceWithDocument } from "../types";

export function invoiceRowToDomain(row: any): Invoice {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status as InvoiceStatus,
    paidDate: row.paidDate ?? null,
    convertedFromQuoteId: row.convertedFromQuoteId ?? null,
  };
}

export function invoiceWithDocumentRowToDomain(row: any): InvoiceWithDocument {
  return {
    ...invoiceRowToDomain(row),
    document: documentWithRelationsRowToDomain(row.document),
  };
}
```

- [ ] **Step 6: Implement Prisma `InvoiceRepository`**

Create `src/adapters/prisma/invoices.ts`:

```ts
import type {
  InvoiceRepository,
  InvoiceUpdate,
  InvoiceWithDocument,
  ListInvoicesArgs,
  NewInvoice,
  Page,
} from "../types";
import type { Invoice } from "../../types";
import type { AnyPrismaClient } from "./client-type";
import {
  invoiceRowToDomain,
  invoiceWithDocumentRowToDomain,
} from "./mappers";

const FULL_INCLUDE = {
  document: {
    include: {
      lineItems: { include: { taxes: true } },
      paymentMethods: true,
    },
  },
};

export function createPrismaInvoiceRepository(
  prisma: AnyPrismaClient,
): InvoiceRepository {
  const db = prisma as any;
  return {
    async create(data: NewInvoice): Promise<Invoice> {
      const row = await db.invoice.create({
        data: {
          documentId: data.documentId,
          status: data.status,
          paidDate: data.paidDate ?? null,
          convertedFromQuoteId: data.convertedFromQuoteId ?? null,
        },
      });
      return invoiceRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.invoice.findFirst({
        where: { id, document: { organizationId } },
        include: FULL_INCLUDE,
      });
      return row ? invoiceWithDocumentRowToDomain(row) : null;
    },
    async findByDocumentNumber({ organizationId, prefix, documentNumber }) {
      const row = await db.invoice.findFirst({
        where: {
          document: {
            type: "INVOICE",
            organizationId,
            documentNumberPrefix: prefix,
            documentNumber,
          },
        },
      });
      return row ? invoiceRowToDomain(row) : null;
    },
    async list(args: ListInvoicesArgs): Promise<Page<InvoiceWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const documentWhere: any = { organizationId: args.organizationId };
      if (args.clientId) documentWhere.clientId = args.clientId;
      if (args.issueDateFrom || args.issueDateTo) {
        documentWhere.issueDate = {};
        if (args.issueDateFrom) documentWhere.issueDate.gte = args.issueDateFrom;
        if (args.issueDateTo) documentWhere.issueDate.lte = args.issueDateTo;
      }
      const where: any = { document: documentWhere };
      if (args.status) {
        where.status = Array.isArray(args.status)
          ? { in: args.status }
          : args.status;
      }
      const [rows, totalCount] = await Promise.all([
        db.invoice.findMany({
          where,
          include: FULL_INCLUDE,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { document: { createdAt: "desc" } },
        }),
        db.invoice.count({ where }),
      ]);
      return {
        data: rows.map(invoiceWithDocumentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: InvoiceUpdate): Promise<Invoice> {
      const { count } = await db.invoice.updateMany({
        where: { id, document: { organizationId } },
        data: patch,
      });
      if (count === 0) throw new Error("invoice not found");
      const row = await db.invoice.findUnique({ where: { id } });
      return invoiceRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.invoice.deleteMany({
        where: { id, document: { organizationId } },
      });
    },
  };
}
```

- [ ] **Step 7: Wire into Prisma adapter, run tests.**

Expected: 14/14 pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(adapters): InvoiceRepository"
```

---

### Task C8: QuoteRepository

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/quotes.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/quotes.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/quotes.ts`
- Modify: mappers + both adapter index files

Structurally parallel to `InvoiceRepository`. Differences: status enum is `QuoteStatus`, has `validUntil` (no `paidDate`), no issue-date range filter.

- [ ] **Step 1: Write conformance test `tests/conformance/quotes.test.ts`**

```ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createQuoteFixture(
  ctx: { repos: any },
  organizationId: string,
  overrides: Partial<{
    documentNumber: number;
    documentNumberPrefix: string | null;
    status: "draft" | "sent" | "accepted" | "rejected" | "converted";
    validUntil: Date | null;
  }> = {},
) {
  const client = await ctx.repos.clients.create({
    organizationId,
    name: "Test client",
  });
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const document = await ctx.repos.documents.create({
    type: "QUOTE",
    organizationId,
    clientId: client.id,
    documentNumber: overrides.documentNumber ?? 1,
    documentNumberPrefix: overrides.documentNumberPrefix ?? null,
    issueDate: new Date("2026-01-15"),
    subtotal: 100n,
    tax: 0n,
    total: 100n,
    lineItems: [
      {
        productId: product.id,
        quantity: "1",
        price: 100n,
        taxes: [],
        taxAmount: 0n,
        total: 100n,
      },
    ],
  });
  const quote = await ctx.repos.quotes.create({
    documentId: document.id,
    status: overrides.status ?? "draft",
    validUntil: overrides.validUntil ?? null,
  });
  return { client, product, document, quote };
}

describeForEachAdapter("QuoteRepository", allFactories, (ctx) => {
  test("create and findById returns quote with document + line items", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, organizationId);
    const found = await ctx.repos.quotes.findById(quote.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.document.lineItems).toHaveLength(1);
    expect(found!.status).toBe("draft");
  });

  test("findById org-scoped", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, a.organizationId);
    expect(await ctx.repos.quotes.findById(quote.id, b.organizationId)).toBeNull();
  });

  test("findByDocumentNumber matches on (org, prefix, number)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await createQuoteFixture(ctx, organizationId, {
      documentNumber: 7,
      documentNumberPrefix: "Q",
    });
    const found = await ctx.repos.quotes.findByDocumentNumber({
      organizationId,
      prefix: "Q",
      documentNumber: 7,
    });
    expect(found).not.toBeNull();
    const missing = await ctx.repos.quotes.findByDocumentNumber({
      organizationId,
      prefix: "Q",
      documentNumber: 8,
    });
    expect(missing).toBeNull();
  });

  test("list filters by status and clientId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const f1 = await createQuoteFixture(ctx, organizationId, {
      documentNumber: 1,
      status: "draft",
    });
    await createQuoteFixture(ctx, organizationId, {
      documentNumber: 2,
      status: "accepted",
    });
    const drafts = await ctx.repos.quotes.list({
      organizationId,
      status: "draft",
    });
    expect(drafts.data).toHaveLength(1);
    const byClient = await ctx.repos.quotes.list({
      organizationId,
      clientId: f1.client.id,
    });
    expect(byClient.data.length).toBeGreaterThanOrEqual(1);
  });

  test("update patches status and validUntil", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, organizationId);
    const valid = new Date("2026-03-01");
    const updated = await ctx.repos.quotes.update(quote.id, organizationId, {
      status: "accepted",
      validUntil: valid,
    });
    expect(updated.status).toBe("accepted");
    expect(updated.validUntil?.toISOString()).toBe(valid.toISOString());
  });

  test("delete removes the quote row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { quote } = await createQuoteFixture(ctx, organizationId);
    await ctx.repos.quotes.delete(quote.id, organizationId);
    expect(await ctx.repos.quotes.findById(quote.id, organizationId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect 12 failures (6 × 2 adapters).**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/quotes.test.ts`

- [ ] **Step 3: Implement in-memory `QuoteRepository`**

Create `src/adapters/memory/quotes.ts` with the same structure as `src/adapters/memory/invoices.ts` from Task C7 — take a `MemoryStore`/`DocumentRepository` arg, store quotes in `store.quotes`. Methods:
- `create({ documentId, status, validUntil })`: generate id, store `{ id, documentId, status, validUntil: validUntil ?? null }`.
- `findById(id, org)`: lookup quote; fetch document via injected `documents.findById(quote.documentId, org)`; return null if either missing or wrong org; return `{ ...quote, document }`.
- `findByDocumentNumber({ org, prefix, documentNumber })`: scan quotes; for each, fetch document; match where `document.type === "QUOTE"`, `organizationId === org`, `documentNumberPrefix === prefix`, `documentNumber === documentNumber`. Return the matching quote (without document) or null.
- `list({ organizationId, status, clientId, page, perPage })`: scan quotes, fetch documents, apply filters (status: single value or array; clientId), sort by document.createdAt desc, paginate, attach documents.
- `update(id, org, patch)`: find quote, verify document org matches, shallow-merge patch.
- `delete(id, org)`: find quote, verify document org matches, remove quote row.

- [ ] **Step 4: Wire into `memory/index.ts`** — add `quotes: createInMemoryQuoteRepository(store, documents)`. Run tests; in-memory should pass (6), Prisma should still fail (6).

- [ ] **Step 5: Add quote mappers to `src/adapters/prisma/mappers.ts`**

```ts
import type { Quote, QuoteStatus } from "../../types";
import type { QuoteWithDocument } from "../types";

export function quoteRowToDomain(row: any): Quote {
  return {
    id: row.id,
    documentId: row.documentId,
    status: row.status as QuoteStatus,
    validUntil: row.validUntil ?? null,
  };
}

export function quoteWithDocumentRowToDomain(row: any): QuoteWithDocument {
  return {
    ...quoteRowToDomain(row),
    document: documentWithRelationsRowToDomain(row.document),
  };
}
```

- [ ] **Step 6: Implement Prisma `QuoteRepository` at `src/adapters/prisma/quotes.ts`**

```ts
import type {
  ListQuotesArgs,
  NewQuote,
  Page,
  QuoteRepository,
  QuoteUpdate,
  QuoteWithDocument,
} from "../types";
import type { Quote } from "../../types";
import type { AnyPrismaClient } from "./client-type";
import { quoteRowToDomain, quoteWithDocumentRowToDomain } from "./mappers";

const FULL_INCLUDE = {
  document: {
    include: {
      lineItems: { include: { taxes: true } },
      paymentMethods: true,
    },
  },
};

export function createPrismaQuoteRepository(
  prisma: AnyPrismaClient,
): QuoteRepository {
  const db = prisma as any;
  return {
    async create(data: NewQuote): Promise<Quote> {
      const row = await db.quote.create({
        data: {
          documentId: data.documentId,
          status: data.status,
          validUntil: data.validUntil ?? null,
        },
      });
      return quoteRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.quote.findFirst({
        where: { id, document: { organizationId } },
        include: FULL_INCLUDE,
      });
      return row ? quoteWithDocumentRowToDomain(row) : null;
    },
    async findByDocumentNumber({ organizationId, prefix, documentNumber }) {
      const row = await db.quote.findFirst({
        where: {
          document: {
            type: "QUOTE",
            organizationId,
            documentNumberPrefix: prefix,
            documentNumber,
          },
        },
      });
      return row ? quoteRowToDomain(row) : null;
    },
    async list(args: ListQuotesArgs): Promise<Page<QuoteWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const documentWhere: any = { organizationId: args.organizationId };
      if (args.clientId) documentWhere.clientId = args.clientId;
      const where: any = { document: documentWhere };
      if (args.status) {
        where.status = Array.isArray(args.status)
          ? { in: args.status }
          : args.status;
      }
      const [rows, totalCount] = await Promise.all([
        db.quote.findMany({
          where,
          include: FULL_INCLUDE,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { document: { createdAt: "desc" } },
        }),
        db.quote.count({ where }),
      ]);
      return {
        data: rows.map(quoteWithDocumentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: QuoteUpdate) {
      const { count } = await db.quote.updateMany({
        where: { id, document: { organizationId } },
        data: patch,
      });
      if (count === 0) throw new Error("quote not found");
      const row = await db.quote.findUnique({ where: { id } });
      return quoteRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.quote.deleteMany({
        where: { id, document: { organizationId } },
      });
    },
  };
}
```

- [ ] **Step 7: Wire into `prisma/index.ts`** — `quotes: createPrismaQuoteRepository(prisma)`. Run tests.

Expected: 12/12 pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(adapters): QuoteRepository"
```

---

### Task C9: PaymentMethodRepository

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/payment-methods.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/payment-methods.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/payment-methods.ts`
- Modify: mappers + both adapter index files

`PaymentMethod` is a simple per-org row with a default flag and JSON metadata. Structurally parallel to `Tax`.

- [ ] **Step 1: Write conformance test `tests/conformance/payment-methods.test.ts`**

```ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("PaymentMethodRepository", allFactories, (ctx) => {
  test("create applies defaults", async () => {
    const { organizationId } = await seed(ctx.repos);
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Bank transfer",
      type: "MANUAL",
    });
    expect(pm.isActive).toBe(true);
    expect(pm.isDefault).toBe(false);
    expect(pm.instructions).toBeNull();
    expect(pm.metadata).toBeNull();
  });

  test("metadata round-trips arbitrary JSON", async () => {
    const { organizationId } = await seed(ctx.repos);
    const md = { stripeAccountId: "acct_123", nested: { k: 1 } };
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Stripe",
      type: "STRIPE",
      metadata: md,
    });
    const found = await ctx.repos.paymentMethods.findById(pm.id, organizationId);
    expect(found!.metadata).toEqual(md);
  });

  test("list filters by isActive", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Active",
      type: "MANUAL",
      isActive: true,
    });
    await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Inactive",
      type: "MANUAL",
      isActive: false,
    });
    const active = await ctx.repos.paymentMethods.list({
      organizationId,
      isActive: true,
    });
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe("Active");
  });

  test("update patches name and instructions", async () => {
    const { organizationId } = await seed(ctx.repos);
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "Old",
      type: "MANUAL",
    });
    const u = await ctx.repos.paymentMethods.update(pm.id, organizationId, {
      name: "New",
      instructions: "Wire to acct 123",
    });
    expect(u.name).toBe("New");
    expect(u.instructions).toBe("Wire to acct 123");
  });

  test("clearDefaultExcept unsets isDefault on all rows except keepId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const a = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "A",
      type: "MANUAL",
      isDefault: true,
    });
    const b = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "B",
      type: "MANUAL",
      isDefault: true,
    });
    await ctx.repos.paymentMethods.clearDefaultExcept(organizationId, b.id);
    const aRow = await ctx.repos.paymentMethods.findById(a.id, organizationId);
    const bRow = await ctx.repos.paymentMethods.findById(b.id, organizationId);
    expect(aRow!.isDefault).toBe(false);
    expect(bRow!.isDefault).toBe(true);
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const pm = await ctx.repos.paymentMethods.create({
      organizationId,
      name: "X",
      type: "MANUAL",
    });
    await ctx.repos.paymentMethods.delete(pm.id, organizationId);
    expect(
      await ctx.repos.paymentMethods.findById(pm.id, organizationId),
    ).toBeNull();
  });
});
```

Expected: 12 failures on first run (6 × 2 adapters).

- [ ] **Step 2: Run tests — expect failures.**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/payment-methods.test.ts`

- [ ] **Step 3: Implement in-memory `PaymentMethodRepository` at `src/adapters/memory/payment-methods.ts`**

Use `store.paymentMethods: Map<string, PaymentMethod>`. `create` defaults `isActive=true`, `isDefault=false`, `instructions=null`, `metadata=null`. `list` filters by org + optional `isActive`, sorts by `createdAt desc`. `clearDefaultExcept` iterates and sets `isDefault=false` on every row where `organizationId === arg && id !== keepId`. Implement `update`, `findById`, `delete` analogous to ClientRepository.

- [ ] **Step 4: Wire into memory adapter. Run tests — in-memory passes 6, Prisma fails 6.**

- [ ] **Step 5: Add `paymentMethodRowToDomain` to mappers**

```ts
import type { PaymentMethod, PaymentMethodType } from "../../types";

export function paymentMethodRowToDomain(row: any): PaymentMethod {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type as PaymentMethodType,
    instructions: row.instructions ?? null,
    metadata: row.metadata ?? null,
    isActive: row.isActive,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 6: Implement Prisma `PaymentMethodRepository` at `src/adapters/prisma/payment-methods.ts`**

Same structure as `taxes.ts` — `db.paymentMethod.{create,findFirst,findMany,updateMany,deleteMany}`. For `clearDefaultExcept`:

```ts
async clearDefaultExcept(organizationId, keepId) {
  await db.paymentMethod.updateMany({
    where: {
      organizationId,
      isDefault: true,
      ...(keepId ? { NOT: { id: keepId } } : {}),
    },
    data: { isDefault: false },
  });
},
```

For `update`, use the `updateMany`-then-refetch pattern.

- [ ] **Step 7: Wire into Prisma adapter, run tests.**

Expected: 12/12 pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(adapters): PaymentMethodRepository"
```

---

### Task C10: PaymentRepository

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/payments.test.ts`
- Create: `packages/invoicing-kit/src/adapters/memory/payments.ts`
- Create: `packages/invoicing-kit/src/adapters/prisma/payments.ts`
- Modify: mappers + both adapter index files

`Payment` rows attach to an `Invoice` (FK by `invoiceId`). Tests reuse the invoice fixture pattern from C7.

- [ ] **Step 1: Write conformance test `tests/conformance/payments.test.ts`**

```ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

async function createInvoiceFixture(ctx: { repos: any }, organizationId: string) {
  const client = await ctx.repos.clients.create({
    organizationId,
    name: "Test client",
  });
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Test product",
    price: "100.00",
  });
  const document = await ctx.repos.documents.create({
    type: "INVOICE",
    organizationId,
    clientId: client.id,
    documentNumber: 1,
    issueDate: new Date(),
    subtotal: 10000n,
    tax: 0n,
    total: 10000n,
    lineItems: [
      {
        productId: product.id,
        quantity: "1",
        price: 10000n,
        taxes: [],
        taxAmount: 0n,
        total: 10000n,
      },
    ],
  });
  const invoice = await ctx.repos.invoices.create({
    documentId: document.id,
    status: "sent",
  });
  return { invoice };
}

describeForEachAdapter("PaymentRepository", allFactories, (ctx) => {
  test("create and findById round-trip", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const created = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 5000n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
      paidAt: new Date("2026-02-01"),
      reference: "wire-1234",
    });
    expect(created.amount).toBe(5000n);
    const found = await ctx.repos.payments.findById(created.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.reference).toBe("wire-1234");
  });

  test("findById is org-scoped via invoice -> document chain", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, a.organizationId);
    const p = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    expect(await ctx.repos.payments.findById(p.id, b.organizationId)).toBeNull();
  });

  test("list filters by invoiceId and status", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 50n,
      currency: "usd",
      status: "failed",
      provider: "MANUAL",
      failureReason: "insufficient_funds",
    });
    const succeeded = await ctx.repos.payments.list({
      organizationId,
      invoiceId: invoice.id,
      status: "succeeded",
    });
    expect(succeeded.data).toHaveLength(1);
    expect(succeeded.data[0]!.status).toBe("succeeded");
  });

  test("update patches status, paidAt, failureReason", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const p = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "pending",
      provider: "MANUAL",
    });
    const u = await ctx.repos.payments.update(p.id, organizationId, {
      status: "succeeded",
      paidAt: new Date("2026-03-01"),
    });
    expect(u.status).toBe("succeeded");
    expect(u.paidAt).toBeInstanceOf(Date);
  });

  test("delete removes the row", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    const p = await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.delete(p.id, organizationId);
    expect(await ctx.repos.payments.findById(p.id, organizationId)).toBeNull();
  });

  test("totalPaidForInvoice sums only succeeded payments", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { invoice } = await createInvoiceFixture(ctx, organizationId);
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 100n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 200n,
      currency: "usd",
      status: "succeeded",
      provider: "MANUAL",
    });
    await ctx.repos.payments.create({
      invoiceId: invoice.id,
      amount: 1000n,
      currency: "usd",
      status: "failed",
      provider: "MANUAL",
    });
    const total = await ctx.repos.payments.totalPaidForInvoice(
      invoice.id,
      organizationId,
    );
    expect(total).toBe(300n);
  });
});
```

- [ ] **Step 2: Run tests — expect 12 failures (6 × 2).**

Run: `cd packages/invoicing-kit && bun run test tests/conformance/payments.test.ts`

- [ ] **Step 3: Implement in-memory `PaymentRepository` at `src/adapters/memory/payments.ts`**

Constructor signature: `(store: MemoryStore, invoices: InvoiceRepository)`. Use `store.payments: Map<string, Payment>`. To check org-scoping, call `invoices.findById(payment.invoiceId, organizationId)`; if null, treat as "not visible." `totalPaidForInvoice`: iterate `store.payments`, filter by `invoiceId === arg && status === "succeeded"`, sum `amount` (initialize accumulator as `0n`).

- [ ] **Step 4: Wire into `memory/index.ts`** — `payments: createInMemoryPaymentRepository(store, invoices)`. Run tests — 6 in-memory pass, 6 Prisma fail.

- [ ] **Step 5: Add `paymentRowToDomain` to mappers**

```ts
import type { Payment, PaymentProvider, PaymentStatus } from "../../types";

export function paymentRowToDomain(row: any): Payment {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    paymentMethodId: row.paymentMethodId ?? null,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentStatus,
    provider: row.provider as PaymentProvider,
    stripePaymentIntentId: row.stripePaymentIntentId ?? null,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId ?? null,
    stripeChargeId: row.stripeChargeId ?? null,
    paidAt: row.paidAt ?? null,
    failedAt: row.failedAt ?? null,
    failureReason: row.failureReason ?? null,
    reference: row.reference ?? null,
    notes: row.notes ?? null,
    recordedBy: row.recordedBy ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 6: Implement Prisma `PaymentRepository` at `src/adapters/prisma/payments.ts`**

```ts
import type {
  ListPaymentsArgs,
  NewPayment,
  Page,
  PaymentRepository,
  PaymentUpdate,
} from "../types";
import type { BigintMinor, Payment } from "../../types";
import type { AnyPrismaClient } from "./client-type";
import { paymentRowToDomain } from "./mappers";

export function createPrismaPaymentRepository(
  prisma: AnyPrismaClient,
): PaymentRepository {
  const db = prisma as any;
  return {
    async create(data: NewPayment): Promise<Payment> {
      const row = await db.payment.create({
        data: {
          invoiceId: data.invoiceId,
          paymentMethodId: data.paymentMethodId ?? null,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          provider: data.provider,
          stripePaymentIntentId: data.stripePaymentIntentId ?? null,
          stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
          stripeChargeId: data.stripeChargeId ?? null,
          paidAt: data.paidAt ?? null,
          failedAt: data.failedAt ?? null,
          failureReason: data.failureReason ?? null,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          recordedBy: data.recordedBy ?? null,
          metadata: data.metadata ?? undefined,
        },
      });
      return paymentRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.payment.findFirst({
        where: { id, invoice: { document: { organizationId } } },
      });
      return row ? paymentRowToDomain(row) : null;
    },
    async list(args: ListPaymentsArgs): Promise<Page<Payment>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const where: any = {
        invoice: { document: { organizationId: args.organizationId } },
      };
      if (args.invoiceId) where.invoiceId = args.invoiceId;
      if (args.status) where.status = args.status;
      const [rows, totalCount] = await Promise.all([
        db.payment.findMany({
          where,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
        }),
        db.payment.count({ where }),
      ]);
      return {
        data: rows.map(paymentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: PaymentUpdate): Promise<Payment> {
      const { count } = await db.payment.updateMany({
        where: { id, invoice: { document: { organizationId } } },
        data: {
          ...patch,
          metadata: patch.metadata ?? undefined,
        },
      });
      if (count === 0) throw new Error("payment not found");
      const row = await db.payment.findUnique({ where: { id } });
      return paymentRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.payment.deleteMany({
        where: { id, invoice: { document: { organizationId } } },
      });
    },
    async totalPaidForInvoice(invoiceId, organizationId): Promise<BigintMinor> {
      const result = await db.payment.aggregate({
        where: {
          invoiceId,
          status: "succeeded",
          invoice: { document: { organizationId } },
        },
        _sum: { amount: true },
      });
      return (result._sum.amount as bigint | null) ?? 0n;
    },
  };
}
```

- [ ] **Step 7: Wire into `prisma/index.ts`** — `payments: createPrismaPaymentRepository(prisma)`. Run tests.

Expected: 12/12 pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(adapters): PaymentRepository"
```

---

### Task C11: Transaction support (`tx`)

**Files:**
- Modify: `packages/invoicing-kit/src/adapters/memory/index.ts`
- Modify: `packages/invoicing-kit/src/adapters/prisma/index.ts`
- Create: `packages/invoicing-kit/tests/conformance/transactions.test.ts`

Until now `tx()` throws `not implemented`. This task makes it real for both adapters.

**Semantics (per the spec interface):**
- `tx(fn)` runs `fn` with a `Repositories` whose mutations are atomic.
- On `fn` throwing or rejecting, all writes inside roll back.
- Nested `tx` calls REUSE the outer transaction (no nested savepoints in v0). The inner `tx` is effectively a no-op pass-through.

- [ ] **Step 1: Write conformance test**

```ts
// tests/conformance/transactions.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("transactions", allFactories, (ctx) => {
  test("commits writes when fn resolves", async () => {
    const { organizationId } = await seed(ctx.repos);
    const id = await ctx.repos.tx(async (tx) => {
      const c = await tx.clients.create({ organizationId, name: "Tx commit" });
      return c.id;
    });
    expect(await ctx.repos.clients.findById(id, organizationId)).not.toBeNull();
  });

  test("rolls back writes when fn throws", async () => {
    const { organizationId } = await seed(ctx.repos);
    let createdId = "";
    await expect(
      ctx.repos.tx(async (tx) => {
        const c = await tx.clients.create({ organizationId, name: "Tx rollback" });
        createdId = c.id;
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");
    expect(await ctx.repos.clients.findById(createdId, organizationId)).toBeNull();
  });

  test("nested tx reuses outer transaction (writes from inner are visible to outer if outer commits)", async () => {
    const { organizationId } = await seed(ctx.repos);
    const id = await ctx.repos.tx(async (tx) => {
      return tx.tx(async (innerTx) => {
        const c = await innerTx.clients.create({
          organizationId,
          name: "Nested",
        });
        return c.id;
      });
    });
    expect(await ctx.repos.clients.findById(id, organizationId)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failures.**

Expected: 6 failures (all `tx not implemented`).

- [ ] **Step 3: Implement in-memory transactions via snapshot-and-rollback**

Approach: in-memory adapter wraps every repo's underlying `Map` in a transactional layer. The simplest correct implementation:

1. Refactor in-memory state into a single `MemoryStore` object: `{ clients: Map<...>, products: Map<...>, ...}` — one source of truth.
2. Each in-memory repository accepts a `MemoryStore` reference.
3. `tx(fn)` clones the store into a snapshot, builds a fresh `Repositories` instance against the snapshot, calls `fn(repos)`. On success: copy the snapshot back into the live store atomically. On failure: discard the snapshot.

Concrete refactor:

Create `src/adapters/memory/store.ts`:

```ts
import type {
  Client,
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentNumberSequence,
  DocumentPaymentMethod,
  Invoice,
  Payment,
  PaymentMethod,
  Product,
  Quote,
  Tax,
} from "../../types";

export interface MemoryStore {
  clients: Map<string, Client>;
  products: Map<string, Product>;
  taxes: Map<string, Tax>;
  documents: Map<string, Document>;
  documentLineItems: Map<string, DocumentLineItem>;
  documentLineItemTaxes: Map<string, DocumentLineItemTax>;
  documentPaymentMethods: Map<string, DocumentPaymentMethod>;
  documentSequences: Map<string, DocumentNumberSequence>;
  invoices: Map<string, Invoice>;
  quotes: Map<string, Quote>;
  paymentMethods: Map<string, PaymentMethod>;
  payments: Map<string, Payment>;
}

export function createStore(): MemoryStore {
  return {
    clients: new Map(),
    products: new Map(),
    taxes: new Map(),
    documents: new Map(),
    documentLineItems: new Map(),
    documentLineItemTaxes: new Map(),
    documentPaymentMethods: new Map(),
    documentSequences: new Map(),
    invoices: new Map(),
    quotes: new Map(),
    paymentMethods: new Map(),
    payments: new Map(),
  };
}

export function snapshot(store: MemoryStore): MemoryStore {
  return {
    clients: new Map(store.clients),
    products: new Map(store.products),
    taxes: new Map(store.taxes),
    documents: new Map(store.documents),
    documentLineItems: new Map(store.documentLineItems),
    documentLineItemTaxes: new Map(store.documentLineItemTaxes),
    documentPaymentMethods: new Map(store.documentPaymentMethods),
    documentSequences: new Map(store.documentSequences),
    invoices: new Map(store.invoices),
    quotes: new Map(store.quotes),
    paymentMethods: new Map(store.paymentMethods),
    payments: new Map(store.payments),
  };
}

export function applySnapshot(target: MemoryStore, src: MemoryStore): void {
  for (const key of Object.keys(target) as Array<keyof MemoryStore>) {
    target[key].clear();
    for (const [k, v] of src[key]) target[key].set(k, v);
  }
}
```

Then refactor each in-memory repo from `createInMemory*Repository()` to `createInMemory*Repository(store: MemoryStore)`. Each repo reads/writes `store.<entity>` directly.

`memory/index.ts`:

```ts
import { applySnapshot, createStore, snapshot } from "./store";
import { createInMemoryClientRepository } from "./clients";
// ...

export function inMemoryAdapter(): Repositories {
  const store = createStore();
  let txDepth = 0;

  function build(s: MemoryStore): Repositories {
    return {
      clients: createInMemoryClientRepository(s),
      products: createInMemoryProductRepository(s),
      taxes: createInMemoryTaxRepository(s),
      documentSequences: createInMemoryDocumentSequenceRepository(s),
      documents: createInMemoryDocumentRepository(s),
      invoices: createInMemoryInvoiceRepository(s),
      quotes: createInMemoryQuoteRepository(s),
      paymentMethods: createInMemoryPaymentMethodRepository(s),
      payments: createInMemoryPaymentRepository(s),
      tx: async (fn) => {
        if (txDepth > 0) {
          // Nested: reuse current snapshot store.
          return fn(build(s));
        }
        txDepth++;
        const snap = snapshot(s);
        try {
          const result = await fn(build(snap));
          applySnapshot(store, snap);
          return result;
        } finally {
          txDepth--;
        }
      },
    };
  }

  return build(store);
}
```

(Note: this is a single-threaded JS model so the depth counter works without locks. Nested `tx` calls reuse the snapshot the outer holds — captured via closure on `s`.)

- [ ] **Step 4: Wire and run tests against in-memory only first**

Expected: 3 in-memory pass; 3 Prisma fail.

- [ ] **Step 5: Implement Prisma transactions**

Update `prismaAdapter` to support `tx`:

```ts
export function prismaAdapter(prisma: AnyPrismaClient): Repositories {
  function buildRepos(client: AnyPrismaClient, depth: number): Repositories {
    return {
      clients: createPrismaClientRepository(client),
      products: createPrismaProductRepository(client),
      taxes: createPrismaTaxRepository(client),
      documentSequences: createPrismaDocumentSequenceRepository(client),
      documents: createPrismaDocumentRepository(client),
      invoices: createPrismaInvoiceRepository(client),
      quotes: createPrismaQuoteRepository(client),
      paymentMethods: createPrismaPaymentMethodRepository(client),
      payments: createPrismaPaymentRepository(client),
      tx: async (fn) => {
        if (depth > 0) {
          // Already inside a transaction; reuse same client.
          return fn(buildRepos(client, depth + 1));
        }
        return prisma.$transaction(async (tx: any) => {
          return fn(buildRepos(tx, 1));
        });
      },
    };
  }
  const repos = buildRepos(prisma, 0);
  (repos as any).__prisma = prisma; // test-only escape hatch
  return repos;
}
```

(Important: `DocumentRepository.replaceLineItems` and `setPaymentMethods` already use `prisma.$transaction` internally. When called from inside an outer `tx`, the outer `tx` argument should be used instead. **This is a known limitation in this Plan 1 task** — those methods will start a nested PG transaction. PostgreSQL doesn't support true nested transactions, only savepoints. To keep the Plan 1 implementation simple: rewrite those two methods to NOT start their own transaction; if a service wants atomicity across `replaceLineItems` + something else, the service calls `repos.tx(...)`. This matches the spec's "services own transactions" rule.)

Concretely:
- In `src/adapters/prisma/documents.ts`, in `replaceLineItems`, replace `await prisma.$transaction(async (tx: any) => { ... })` with the body executed directly against `db` (no nested transaction).
- Same for `setPaymentMethods`.

Re-run the documents conformance tests after this change to make sure they still pass.

- [ ] **Step 6: Run all conformance tests**

Run: `cd packages/invoicing-kit && bun run test`
Expected: full conformance suite passes (transactions + every previously-passing domain).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(adapters): transaction support"
```

---

## Phase D — Public surface, build, CI

### Task D1: Public exports — `src/index.ts` + `src/testing.ts`

**Files:**
- Modify: `packages/invoicing-kit/src/index.ts`
- Modify: `packages/invoicing-kit/src/testing.ts`

- [ ] **Step 1: Write `src/index.ts`**

```ts
// Public API of invoicing-kit (Plan 1 surface).
// Plan 2 will add `createInvoicingKit`, services, and routes.

// Domain types
export type {
  BigintMinor,
  Client,
  DecimalString,
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentNumberSequence,
  DocumentPaymentMethod,
  DocumentType,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  PaymentMethodType,
  PaymentProvider,
  PaymentStatus,
  Product,
  Quote,
  QuoteStatus,
  Tax,
  TaxType,
} from "./types";

// Repository interfaces and input/output shapes
export type {
  ClientRepository,
  ClientUpdate,
  DocumentRepository,
  DocumentSequenceRepository,
  DocumentUpdate,
  DocumentWithRelations,
  InvoiceRepository,
  InvoiceUpdate,
  InvoiceWithDocument,
  ListClientsArgs,
  ListInvoicesArgs,
  ListPaymentMethodsArgs,
  ListPaymentsArgs,
  ListProductsArgs,
  ListQuotesArgs,
  ListTaxesArgs,
  NewClient,
  NewDocument,
  NewDocumentLineItem,
  NewInvoice,
  NewPayment,
  NewPaymentMethod,
  NewProduct,
  NewQuote,
  NewTax,
  Page,
  PageRequest,
  PaymentMethodRepository,
  PaymentMethodUpdate,
  PaymentRepository,
  PaymentUpdate,
  ProductRepository,
  ProductUpdate,
  QuoteRepository,
  QuoteUpdate,
  QuoteWithDocument,
  Repositories,
  TaxRepository,
  TaxUpdate,
} from "./adapters/types";

// Default adapter
export { prismaAdapter } from "./adapters/prisma";
```

- [ ] **Step 2: Write `src/testing.ts`**

```ts
// Test-only utilities. NOT for production consumers.
// Exported under the `invoicing-kit/testing` subpath.
export { inMemoryAdapter } from "./adapters/memory";
```

- [ ] **Step 3: Verify build produces both entries**

Run: `cd packages/invoicing-kit && bun run build`
Expected: `dist/index.{js,cjs,d.ts}` and `dist/testing.{js,cjs,d.ts}` all exist.

Verify with: `ls -la packages/invoicing-kit/dist/`

- [ ] **Step 4: Quick consumer-import sanity test**

Create a temporary script at the root: `bun run -e "import { prismaAdapter } from './packages/invoicing-kit/dist/index.js'; import { inMemoryAdapter } from './packages/invoicing-kit/dist/testing.js'; console.log(typeof prismaAdapter, typeof inMemoryAdapter);"`
Expected output: `function function`

(If shell quoting is awkward, write the line to a temp file and `bun run` it.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): finalize Plan 1 public exports"
```

---

### Task D2: Cross-adapter integration check

**Files:**
- Create: `packages/invoicing-kit/tests/conformance/cross.test.ts`

A small end-to-end test exercising multiple repos through one transaction — to catch issues with the adapter wiring that the per-domain tests miss. Tests both adapters.

- [ ] **Step 1: Write `tests/conformance/cross.test.ts`**

```ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

describeForEachAdapter("cross-adapter end-to-end", allFactories, (ctx) => {
  test("create invoice atomically across multiple repos", async () => {
    const { organizationId } = await seed(ctx.repos);

    const result = await ctx.repos.tx(async (tx) => {
      const client = await tx.clients.create({
        organizationId,
        name: "End-to-end client",
      });
      const product = await tx.products.create({
        organizationId,
        name: "Service",
        price: "200.00",
      });
      await tx.documentSequences.ensure({
        organizationId,
        documentType: "INVOICE",
      });
      const number = await tx.documentSequences.incrementAndGet({
        organizationId,
        documentType: "INVOICE",
      });
      const doc = await tx.documents.create({
        type: "INVOICE",
        organizationId,
        clientId: client.id,
        documentNumber: number,
        issueDate: new Date(),
        subtotal: 20000n,
        tax: 0n,
        total: 20000n,
        lineItems: [
          {
            productId: product.id,
            quantity: "1",
            price: 20000n,
            taxes: [],
            taxAmount: 0n,
            total: 20000n,
          },
        ],
      });
      return tx.invoices.create({
        documentId: doc.id,
        status: "draft",
      });
    });

    const found = await ctx.repos.invoices.findById(result.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.document.documentNumber).toBe(1);
    expect(found!.document.lineItems).toHaveLength(1);
  });

  test("rollback unwinds all multi-repo writes", async () => {
    const { organizationId } = await seed(ctx.repos);
    let createdClientId = "";

    await expect(
      ctx.repos.tx(async (tx) => {
        const c = await tx.clients.create({
          organizationId,
          name: "Will rollback",
        });
        createdClientId = c.id;
        await tx.products.create({
          organizationId,
          name: "P",
          price: "1.00",
        });
        throw new Error("rollback all");
      }),
    ).rejects.toThrow();

    expect(
      await ctx.repos.clients.findById(createdClientId, organizationId),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/invoicing-kit && bun run test`
Expected: full suite passes. Note the in-memory and Prisma counts in the output for reference.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(core): cross-adapter end-to-end"
```

---

### Task D3: CI workflow + README polish

**Files:**
- Create: `.github/workflows/ci.yml` (workspace root)
- Modify: `README.md` (workspace root)
- Modify: `packages/invoicing-kit/README.md` (create stub)

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: invoicing_kit_test
        ports:
          - 5544:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      INVOICING_KIT_TEST_DATABASE_URL: postgresql://test:test@localhost:5544/invoicing_kit_test

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install deps
        run: bun install

      - name: Push Prisma fixture schema
        working-directory: packages/invoicing-kit
        run: bun run db:push

      - name: Typecheck
        run: bun run --filter '*' typecheck

      - name: Test
        run: bun run --filter '*' test

      - name: Build
        run: bun run --filter '*' build
```

- [ ] **Step 2: Update workspace root README**

Replace the stub with:

```markdown
# invoicing-kit

Reusable invoicing API for Hono apps using better-auth — modeled on better-auth's extensibility patterns: bring your own data adapter.

**Status:** v0 in development.

## Packages

- [`invoicing-kit`](./packages/invoicing-kit/) — core package: domain types, repository interfaces, default Prisma adapter, in-memory test adapter.
- [`@invoicing-kit/cli`](./packages/cli/) — schema generator CLI (Plan 3).

## Design docs

See [`docs/superpowers/specs/`](./docs/superpowers/specs/) for design specs and [`docs/superpowers/plans/`](./docs/superpowers/plans/) for implementation plans.

## Development

```bash
bun install
docker compose -f docker-compose.test.yml up -d
cd packages/invoicing-kit
export INVOICING_KIT_TEST_DATABASE_URL=postgresql://test:test@localhost:5544/invoicing_kit_test
bun run db:push
bun run test
```

## License

MIT
```

- [ ] **Step 3: Write `packages/invoicing-kit/README.md` (stub)**

```markdown
# invoicing-kit

Reusable invoicing API for Hono apps using better-auth.

**Status:** v0 in development. The Plan 1 milestone ships the adapter layer only — domain types, repository interfaces, default Prisma adapter, in-memory test adapter. HTTP routes ship in Plan 2.

## Install

```bash
bun add invoicing-kit
# Also needed (peer deps):
bun add @prisma/client better-auth hono @hono/zod-openapi zod
```

## Quick look — adapter layer

```ts
import { prismaAdapter } from "invoicing-kit";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repos = prismaAdapter(prisma);

const client = await repos.clients.create({
  organizationId: "org_123",
  name: "Acme",
});
```

See [the design spec](../../docs/superpowers/specs/2026-05-27-invoicing-kit-design.md) for the full architecture.

## License

MIT
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: CI workflow + README"
```

---

### Task D4: Final tag + plan completion

- [ ] **Step 1: Run the full test suite one more time**

Run: `cd packages/invoicing-kit && bun run test && bun run typecheck && bun run build`
Expected: all PASS. Note conformance suite total — record it in the commit message.

- [ ] **Step 2: Tag the foundation completion**

```bash
git tag -a plan-1-foundation -m "Foundation plan complete: adapter layer with conformance suite passing against in-memory and Prisma"
```

- [ ] **Step 3: Print summary**

Run:
```bash
git log --oneline plan-1-foundation
git diff --stat $(git rev-list --max-parents=0 HEAD)..plan-1-foundation
```

Expected: a clean list of commits from "docs: initial invoicing-kit design spec" through Phase D, with a diff stat showing all the files created in Plan 1.

---

## Done criteria for Plan 1

- [ ] All conformance tests pass against both `inMemoryAdapter()` and `prismaAdapter(prisma)`.
- [ ] `bun run build` produces both `dist/index.*` and `dist/testing.*` entries with type declarations.
- [ ] `bun run typecheck` is clean.
- [ ] CI workflow runs on PR and exercises typecheck + test + build.
- [ ] The package does not import `@prisma/client` directly; the Prisma adapter is typed structurally via `AnyPrismaClient`.
- [ ] `packages/cli/templates/v0/*.prisma` exist and produce a valid Postgres schema when pushed alongside `tests/fixtures/prisma/auth.prisma`.

**Plan 1 deliverable summary:** a working `invoicing-kit` package that exports domain types, `Repositories` interface, `prismaAdapter()`, `inMemoryAdapter()` (under `/testing`), and has a parametrized conformance suite proving both adapters satisfy the interface identically. No HTTP, no services — those come in Plan 2.

## What's next (Plan 2 preview, not in this plan)

- Public API: `createInvoicingKit({ adapter, auth, basePath })` factory returning a Hono router + services.
- Per-domain services (`InvoiceService`, `ClientService`, etc.) with business logic moved off the source repo's `BaseDocumentService` and `tax-strategy.ts`.
- Per-domain routes (`@hono/zod-openapi`) extracted from `bills_simple/api/src/routes/*`.
- better-auth session middleware producing `AuthContext`.
- Integration tests through Hono.

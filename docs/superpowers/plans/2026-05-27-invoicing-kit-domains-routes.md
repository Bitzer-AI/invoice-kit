# invoicing-kit — Domains, Services & Routes Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the HTTP surface of `invoicing-kit` on top of Plan 1's adapter layer: per-domain services with business logic, `@hono/zod-openapi` routes, better-auth session middleware, error codes, and a `createInvoicingKit({ adapter, auth, basePath })` factory. End-state: a consumer can mount `bills.router` on a Hono app and have a working invoicing API.

**Architecture:** Three-layer per domain. **Routes** (`domains/<x>/routes.ts`) read the better-auth session via central middleware, validate inputs with Zod, call a service, map the result to a response DTO. **Services** (`domains/<x>/service.ts`) own all business logic — they take `Repositories` + collaborators, never touch Hono. **Validation** (`domains/<x>/validation.ts`) defines Zod schemas and exports DTO types via `z.infer`. Shared business logic (document numbering, tax strategy, calculator) lives in `src/lib/`. The factory composes services and the router once, captures them in a closure, and returns `{ router, services, repos }`.

**Tech Stack:** Hono 4 · `@hono/zod-openapi` · Zod 4 · better-auth (organization plugin required) · vitest. Builds on Plan 1's `Repositories` interface and Prisma/in-memory adapters.

**Source:** Business logic extracted from `/Users/anthonytaveras/Documents/bills_simple/api/src/routes/*` and `/Users/anthonytaveras/Documents/bills_simple/api/src/lib/{document,tax-strategy.ts}`. The plan references specific source files for the canonical business rules.

**Working directory:** `/Users/anthonytaveras/Documents/opensource/invoicing-kit/`

**Prerequisites:** Plan 1 complete. `git tag plan-1-foundation` exists. 118 conformance tests pass.

---

## Task-level conventions

These apply to every Phase C/D task in this plan:

- **Service files** live at `packages/invoicing-kit/src/domains/<feature>/service.ts`. They export a `class XService` with constructor DI from `Repositories` + any shared lib collaborators. All public methods take `AuthContext` as the LAST parameter.
- **Route files** live at `packages/invoicing-kit/src/domains/<feature>/routes.ts`. They export a `function build<X>Router(services: Services, auth: Auth): OpenAPIHono` factory.
- **Validation** files at `packages/invoicing-kit/src/domains/<feature>/validation.ts` export Zod schemas and infer the DTO types from them.
- **Exceptions** files at `packages/invoicing-kit/src/domains/<feature>/exceptions.ts` export typed `HTTPException` subclasses that pull their messages from `src/lib/errors.ts`.
- **Mappers** files at `packages/invoicing-kit/src/domains/<feature>/mappers.ts` convert domain types (from `Repositories`) into response DTOs. Domain types use `bigint` for amounts; response DTOs serialize them as strings so JSON encodes cleanly.
- **Integration test files** live at `packages/invoicing-kit/tests/integration/<feature>.test.ts` and use the harness from Task A3.

Every task that adds routes follows this pattern:
1. Write the integration test file.
2. Run it — fail (route not registered yet).
3. Write or extend the service.
4. Write the routes file.
5. Wire the new router into `buildRouter` (in `src/router.ts`).
6. Run integration tests — pass.
7. Commit.

---

## Phase A — Foundation

### Task A1: Error code registry

**Files:**
- Create: `packages/invoicing-kit/src/lib/errors.ts`

Centralized error codes per the source repo's CLAUDE.md rule ("Error codes go in `src/lib/errors.ts` as entries on the `ErrorCode` const, not as inline string literals in `throw new HTTPException(...)`").

- [ ] **Step 1: Write `src/lib/errors.ts`**

```ts
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ErrorCode = {
  // Auth
  Unauthorized: "UNAUTHORIZED",
  NoActiveOrganization: "NO_ACTIVE_ORGANIZATION",
  Forbidden: "FORBIDDEN",

  // Validation
  ValidationFailed: "VALIDATION_FAILED",

  // Client
  ClientNotFound: "CLIENT_NOT_FOUND",

  // Product
  ProductNotFound: "PRODUCT_NOT_FOUND",

  // Tax
  TaxNotFound: "TAX_NOT_FOUND",

  // Payment Method
  PaymentMethodNotFound: "PAYMENT_METHOD_NOT_FOUND",

  // Document numbering / Invoice / Quote
  InvoiceNotFound: "INVOICE_NOT_FOUND",
  InvoiceNumberAlreadyExists: "INVOICE_NUMBER_ALREADY_EXISTS",
  QuoteNotFound: "QUOTE_NOT_FOUND",
  QuoteNumberAlreadyExists: "QUOTE_NUMBER_ALREADY_EXISTS",
  QuoteAlreadyConverted: "QUOTE_ALREADY_CONVERTED",
  InvoiceStatusTransitionInvalid: "INVOICE_STATUS_TRANSITION_INVALID",

  // Payment
  PaymentNotFound: "PAYMENT_NOT_FOUND",
  PaymentAmountExceedsInvoiceTotal: "PAYMENT_AMOUNT_EXCEEDS_INVOICE_TOTAL",
  PaymentInvoiceMismatch: "PAYMENT_INVOICE_MISMATCH",
} as const;

export type ErrorCodeKey = keyof typeof ErrorCode;
export type ErrorCodeValue = (typeof ErrorCode)[ErrorCodeKey];

interface ThrowArgs {
  code: ErrorCodeValue;
  status: ContentfulStatusCode;
  message: string;
}

export function httpError({ code, status, message }: ThrowArgs): HTTPException {
  return new HTTPException(status, { message: `${code}: ${message}` });
}
```

- [ ] **Step 2: Re-export from `src/index.ts`**

Append:
```ts
export { ErrorCode } from "./lib/errors";
export type { ErrorCodeKey, ErrorCodeValue } from "./lib/errors";
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/invoicing-kit && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(core): error code registry"
```

---

### Task A2: Auth middleware + AuthContext + InvoicingKitConfig

**Files:**
- Create: `packages/invoicing-kit/src/auth/types.ts`
- Create: `packages/invoicing-kit/src/auth/middleware.ts`
- Create: `packages/invoicing-kit/src/config.ts`

Per the spec: tightly coupled to better-auth. The middleware reads `auth.api.getSession`, validates `activeOrganizationId`, and stores an `AuthContext` on `c.var`.

- [ ] **Step 1: Write `src/auth/types.ts`**

```ts
export interface AuthContext {
  userId: string;
  organizationId: string;
  role: string | null;
}

export type AuthVariables = {
  authContext: AuthContext;
};
```

- [ ] **Step 2: Write `src/auth/middleware.ts`**

```ts
import { createMiddleware } from "hono/factory";
import { httpError, ErrorCode } from "../lib/errors";
import type { AuthVariables } from "./types";

// `Auth` is the runtime shape we need from better-auth. We rely on the consumer
// to pass a real better-auth instance; the type below is a structural minimum
// so we don't bind to better-auth's full type surface (which churns across
// versions).
export interface BetterAuthLike {
  api: {
    getSession: (args: {
      headers: Headers;
    }) => Promise<{
      user: { id: string; role?: string | null };
      session: { activeOrganizationId?: string | null };
    } | null>;
  };
}

export function authMiddleware(auth: BetterAuthLike) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      throw httpError({
        code: ErrorCode.Unauthorized,
        status: 401,
        message: "Authentication required",
      });
    }
    if (!session.session.activeOrganizationId) {
      throw httpError({
        code: ErrorCode.NoActiveOrganization,
        status: 400,
        message: "No active organization on the session",
      });
    }
    c.set("authContext", {
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId,
      role: session.user.role ?? null,
    });
    await next();
  });
}
```

- [ ] **Step 3: Write `src/config.ts`**

```ts
import type { Repositories } from "./adapters/types";
import type { BetterAuthLike } from "./auth/middleware";

export interface InvoicingKitConfig {
  /** Repository bundle. Use `prismaAdapter(prisma)` or your own implementation. */
  adapter: Repositories;
  /** better-auth instance. Must have the organization plugin enabled. */
  auth: BetterAuthLike;
  /** Mount path for the router. Default: "/api/bills". */
  basePath?: string;
}
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): middleware + config"
```

---

### Task A3: Integration test harness

**Files:**
- Create: `packages/invoicing-kit/tests/integration/harness.ts`
- Create: `packages/invoicing-kit/tests/integration/smoke.test.ts`

The integration tests run the full Hono app (router) against the Prisma adapter, with a stubbed better-auth session. This catches routing, validation, auth, and service↔adapter wiring issues.

- [ ] **Step 1: Write `tests/integration/harness.ts`**

```ts
import { Hono } from "hono";
import type { Repositories } from "../../src/adapters/types";
import { prismaAdapter } from "../../src/adapters/prisma";
import type { BetterAuthLike } from "../../src/auth/middleware";
import type { AuthContext } from "../../src/auth/types";
import { randomUUID } from "node:crypto";

interface StubSession {
  user: { id: string; role?: string | null };
  session: { activeOrganizationId?: string | null };
}

export function stubAuth(session: StubSession | null): BetterAuthLike {
  return {
    api: {
      async getSession() {
        return session;
      },
    },
  };
}

/**
 * Build a fresh Hono app with the invoicing-kit router mounted at the given
 * base path. Uses the Prisma adapter against the test fixture DB.
 *
 * The factory takes the createInvoicingKit function (avoids circular imports
 * during early Phase B tasks where createInvoicingKit isn't fully wired yet).
 */
export interface HarnessOptions {
  basePath?: string;
  session?: StubSession;
}

export async function buildHarness(
  createInvoicingKit: (config: {
    adapter: Repositories;
    auth: BetterAuthLike;
    basePath?: string;
  }) => { router: any },
  opts: HarnessOptions = {},
) {
  // Load the test-generated Prisma client.
  // @ts-expect-error generated at test setup
  const { PrismaClient } = await import("../../src/generated/test-prisma/client.ts");
  // @ts-expect-error driver adapter
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const connectionString =
    process.env.INVOICING_KIT_TEST_DATABASE_URL ??
    "postgresql://test:test@localhost:5544/invoicing_kit_test";

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const adapter = prismaAdapter(prisma);

  // Truncate per-test (same list as the conformance harness uses).
  await (prisma as any).$executeRawUnsafe(`
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

  // Seed the auth/org row used by the default session.
  const userId = opts.session?.user.id ?? randomUUID();
  const organizationId =
    opts.session?.session.activeOrganizationId ?? randomUUID();

  await (prisma as any).user.create({
    data: { id: userId, name: "Test User", email: `${userId}@test.local`, emailVerified: true },
  });
  await (prisma as any).organization.create({
    data: {
      id: organizationId,
      name: "Test Org",
      slug: `org-${organizationId.slice(0, 8)}`,
      createdAt: new Date(),
    },
  });
  await (prisma as any).member.create({
    data: { id: randomUUID(), organizationId, userId, role: "owner", createdAt: new Date() },
  });

  const session: StubSession = opts.session ?? {
    user: { id: userId },
    session: { activeOrganizationId: organizationId },
  };
  const auth = stubAuth(session);
  const kit = createInvoicingKit({
    adapter,
    auth,
    basePath: opts.basePath ?? "/api/bills",
  });

  const app = new Hono();
  app.route("/", kit.router);

  return {
    app,
    organizationId,
    userId,
    /** Helper: call `app.request(...)` with auth headers attached. */
    request: (input: string, init?: RequestInit) =>
      app.request(input, {
        ...init,
        headers: { ...(init?.headers ?? {}), "x-test-auth": userId },
      }),
  };
}
```

- [ ] **Step 2: Write `tests/integration/smoke.test.ts`**

```ts
import { test, expect } from "vitest";
import { buildHarness } from "./harness";

test("harness boots without errors when given a minimal createInvoicingKit", async () => {
  const stubFactory = () => ({ router: new (await import("hono")).Hono() });
  // Lazy-await the Hono import via IIFE
  const factory = (async () => {
    const { Hono } = await import("hono");
    return () => ({ router: new Hono() });
  })();
  const create = await factory;
  const { app } = await buildHarness(create as any);
  const res = await app.request("/health-stub-doesnt-exist");
  // No route registered; should return 404.
  expect(res.status).toBe(404);
});
```

(This smoke test is intentionally minimal — it just confirms the harness can wire up. Subsequent tasks replace its `createInvoicingKit` stub with the real factory.)

- [ ] **Step 3: Update vitest config to include integration tests**

Modify `packages/invoicing-kit/vitest.config.ts`. Change the `include` array to include both conformance and integration:

```ts
include: ["tests/**/*.test.ts"],
```

(Most likely already correct from Plan 1 — verify the include glob matches `tests/integration/*.test.ts`.)

- [ ] **Step 4: Run tests**

Run: `cd packages/invoicing-kit && bun run test`
Expected: existing 118 conformance tests pass, plus 1 new integration smoke test = 119.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(integration): harness scaffold"
```

---

## Phase B — Shared business logic

### Task B1: DocumentCalculator + DocumentNumberingService

**Files:**
- Create: `packages/invoicing-kit/src/lib/calculator.ts`
- Create: `packages/invoicing-kit/src/lib/numbering.ts`
- Create: `packages/invoicing-kit/tests/unit/calculator.test.ts`
- Create: `packages/invoicing-kit/tests/unit/numbering.test.ts`

`DocumentCalculator` computes line item totals + document totals from input line items + tax results. `DocumentNumberingService` wraps the sequence repository to atomically allocate a new document number.

Source reference for calculator math: `/Users/anthonytaveras/Documents/bills_simple/api/src/lib/document/base-document.service.ts` (look at `calculator` field references).

- [ ] **Step 1: Write `tests/unit/calculator.test.ts`**

```ts
import { test, expect, describe } from "vitest";
import { DocumentCalculator } from "../../src/lib/calculator";

describe("DocumentCalculator", () => {
  const calc = new DocumentCalculator();

  test("computes line item total: quantity × price + taxAmount", () => {
    const line = calc.lineTotal({ quantity: "2.5", price: 1000n, taxAmount: 250n });
    // 2.5 × 1000 = 2500, + 250 tax = 2750
    expect(line.total).toBe(2750n);
    expect(line.subtotal).toBe(2500n);
  });

  test("rounds line subtotal to nearest minor unit (banker's rounding NOT required — just floor for v0)", () => {
    // quantity 1.5 × price 333 = 499.5 -> truncate or round? For v0 we floor.
    const line = calc.lineTotal({ quantity: "1.5", price: 333n, taxAmount: 0n });
    expect(line.subtotal).toBe(499n);
    expect(line.total).toBe(499n);
  });

  test("computes document totals: sum of line subtotals + sum of line tax amounts", () => {
    const totals = calc.documentTotals([
      { subtotal: 1000n, taxAmount: 100n, total: 1100n },
      { subtotal: 2000n, taxAmount: 200n, total: 2200n },
    ]);
    expect(totals.subtotal).toBe(3000n);
    expect(totals.tax).toBe(300n);
    expect(totals.total).toBe(3300n);
  });

  test("documentTotals on empty line items returns zeros", () => {
    const totals = calc.documentTotals([]);
    expect(totals.subtotal).toBe(0n);
    expect(totals.tax).toBe(0n);
    expect(totals.total).toBe(0n);
  });
});
```

- [ ] **Step 2: Write `src/lib/calculator.ts`**

```ts
import type { BigintMinor, DecimalString } from "../types";

export interface LineComputeInput {
  quantity: DecimalString;
  price: BigintMinor;
  /** Sum of all per-line taxes (caller computes via TaxStrategy). */
  taxAmount: BigintMinor;
}

export interface LineComputeResult {
  /** Pre-tax line value: quantity × price, floor-rounded. */
  subtotal: BigintMinor;
  /** subtotal + taxAmount. */
  total: BigintMinor;
}

export interface DocumentTotalsInput {
  subtotal: BigintMinor;
  taxAmount: BigintMinor;
  total: BigintMinor;
}

export interface DocumentTotalsResult {
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
}

export class DocumentCalculator {
  lineTotal(input: LineComputeInput): LineComputeResult {
    // quantity is DecimalString (e.g., "1.5", "2", "0.0001"). Multiply by price (BigInt cents)
    // by scaling: quantity * 10000 (4 decimals) * price / 10000 — but we'd lose precision on
    // intermediate multiplication. Instead, parse as integer scaled by 4 decimals.
    const qStr = input.quantity;
    const [whole, fracRaw = ""] = qStr.split(".");
    const frac = (fracRaw + "0000").slice(0, 4);
    const scaledQty = BigInt((whole ?? "0") + frac); // quantity × 10^4
    const subtotal = (scaledQty * input.price) / 10000n;
    return { subtotal, total: subtotal + input.taxAmount };
  }

  documentTotals(lines: DocumentTotalsInput[]): DocumentTotalsResult {
    let subtotal = 0n;
    let tax = 0n;
    let total = 0n;
    for (const l of lines) {
      subtotal += l.subtotal;
      tax += l.taxAmount;
      total += l.total;
    }
    return { subtotal, tax, total };
  }
}
```

- [ ] **Step 3: Run calculator tests, expect pass**

Run: `cd packages/invoicing-kit && bun run test tests/unit/calculator.test.ts`
Expected: 4 tests pass.

- [ ] **Step 4: Write `tests/unit/numbering.test.ts`**

```ts
import { test, expect, describe } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { DocumentNumberingService } from "../../src/lib/numbering";

describe("DocumentNumberingService", () => {
  test("next() ensures sequence exists then returns sequential numbers", async () => {
    const repos = inMemoryAdapter();
    const numbering = new DocumentNumberingService();
    const a = await numbering.next(repos, "org-1", "INVOICE", null);
    const b = await numbering.next(repos, "org-1", "INVOICE", null);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  test("next() is per (org, type)", async () => {
    const repos = inMemoryAdapter();
    const numbering = new DocumentNumberingService();
    const inv = await numbering.next(repos, "org-1", "INVOICE", null);
    const q = await numbering.next(repos, "org-1", "QUOTE", null);
    expect(inv).toBe(1);
    expect(q).toBe(1);
  });
});
```

- [ ] **Step 5: Write `src/lib/numbering.ts`**

```ts
import type { Repositories } from "../adapters/types";
import type { DocumentType } from "../types";

export class DocumentNumberingService {
  async next(
    repos: Repositories,
    organizationId: string,
    documentType: DocumentType,
    prefix: string | null,
  ): Promise<number> {
    await repos.documentSequences.ensure({ organizationId, documentType, prefix });
    return repos.documentSequences.incrementAndGet({ organizationId, documentType });
  }
}
```

- [ ] **Step 6: Run numbering tests, expect pass**

Run: `cd packages/invoicing-kit && bun run test tests/unit/numbering.test.ts`
Expected: 2 tests pass. Test count total: 122.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(lib): DocumentCalculator + DocumentNumberingService"
```

---

### Task B2: TaxStrategy

**Files:**
- Create: `packages/invoicing-kit/src/lib/tax-strategy.ts`
- Create: `packages/invoicing-kit/tests/unit/tax-strategy.test.ts`

Computes per-line tax amounts given a line item and a set of applicable tax ids. Two tax types: `PERCENTAGE` (rate × line subtotal) and `FIXED` (rate × quantity, in minor units). Adds them up to produce the line's `taxAmount` plus a per-tax breakdown.

Source reference: `/Users/anthonytaveras/Documents/bills_simple/api/src/lib/tax-strategy.ts`.

- [ ] **Step 1: Write `tests/unit/tax-strategy.test.ts`**

```ts
import { test, expect, describe } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { TaxStrategy } from "../../src/lib/tax-strategy";

describe("TaxStrategy", () => {
  test("PERCENTAGE tax: amount = subtotal × rate (rounded down)", async () => {
    const repos = inMemoryAdapter();
    const tax = await repos.taxes.create({
      organizationId: "org-1",
      name: "VAT",
      type: "PERCENTAGE",
      rate: "0.2100", // 21%
    });
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "1",
      price: 10000n, // $100.00
      taxIds: [tax.id],
    });
    // 100.00 × 0.21 = 21.00 = 2100 cents
    expect(result.taxAmount).toBe(2100n);
    expect(result.perTax).toEqual([{ taxId: tax.id, taxAmount: 2100n }]);
  });

  test("FIXED tax: amount = rate × quantity (rate in minor units)", async () => {
    const repos = inMemoryAdapter();
    const tax = await repos.taxes.create({
      organizationId: "org-1",
      name: "Per-unit fee",
      type: "FIXED",
      rate: "50", // $0.50 in minor units = 50 cents
    });
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "3",
      price: 1000n,
      taxIds: [tax.id],
    });
    // 50 × 3 = 150
    expect(result.taxAmount).toBe(150n);
  });

  test("multiple taxes: sum of each", async () => {
    const repos = inMemoryAdapter();
    const a = await repos.taxes.create({
      organizationId: "org-1",
      name: "A",
      type: "PERCENTAGE",
      rate: "0.10",
    });
    const b = await repos.taxes.create({
      organizationId: "org-1",
      name: "B",
      type: "PERCENTAGE",
      rate: "0.05",
    });
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "1",
      price: 10000n,
      taxIds: [a.id, b.id],
    });
    // A: 1000, B: 500 -> total 1500
    expect(result.taxAmount).toBe(1500n);
    expect(result.perTax).toHaveLength(2);
  });

  test("empty taxIds: returns zero tax and empty array", async () => {
    const repos = inMemoryAdapter();
    const strategy = new TaxStrategy();
    const result = await strategy.computeForLine(repos, "org-1", {
      quantity: "1",
      price: 10000n,
      taxIds: [],
    });
    expect(result.taxAmount).toBe(0n);
    expect(result.perTax).toEqual([]);
  });
});
```

- [ ] **Step 2: Write `src/lib/tax-strategy.ts`**

```ts
import type { Repositories } from "../adapters/types";
import type { BigintMinor, DecimalString } from "../types";
import { DocumentCalculator } from "./calculator";

export interface ComputeForLineInput {
  quantity: DecimalString;
  price: BigintMinor;
  taxIds: string[];
}

export interface ComputeForLineResult {
  taxAmount: BigintMinor;
  perTax: Array<{ taxId: string; taxAmount: BigintMinor }>;
}

export class TaxStrategy {
  private readonly calc = new DocumentCalculator();

  async computeForLine(
    repos: Repositories,
    organizationId: string,
    input: ComputeForLineInput,
  ): Promise<ComputeForLineResult> {
    if (input.taxIds.length === 0) {
      return { taxAmount: 0n, perTax: [] };
    }
    const taxes = await repos.taxes.findManyById(input.taxIds, organizationId);
    // Compute the line subtotal once via the calculator (so PERCENTAGE taxes share consistent math).
    const { subtotal } = this.calc.lineTotal({
      quantity: input.quantity,
      price: input.price,
      taxAmount: 0n,
    });

    const perTax: Array<{ taxId: string; taxAmount: BigintMinor }> = [];
    let total = 0n;
    for (const tax of taxes) {
      let amt = 0n;
      if (tax.type === "PERCENTAGE") {
        // rate is DecimalString like "0.2100". Multiply subtotal by scaled rate.
        const [whole, fracRaw = ""] = tax.rate.split(".");
        const frac = (fracRaw + "0000").slice(0, 4);
        const scaledRate = BigInt((whole ?? "0") + frac); // rate × 10^4
        amt = (subtotal * scaledRate) / 10000n;
      } else {
        // FIXED: rate is a string representing minor units. Multiply by integer quantity.
        const rate = BigInt(tax.rate.split(".")[0] ?? "0");
        const [whole, fracRaw = ""] = input.quantity.split(".");
        const frac = (fracRaw + "0000").slice(0, 4);
        const scaledQty = BigInt((whole ?? "0") + frac);
        amt = (rate * scaledQty) / 10000n;
      }
      perTax.push({ taxId: tax.id, taxAmount: amt });
      total += amt;
    }
    return { taxAmount: total, perTax };
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/invoicing-kit && bun run test tests/unit/tax-strategy.test.ts`
Expected: 4 tests pass. Total: 126.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lib): TaxStrategy"
```

---

## Phase C — Leaf domain services + routes (Client, Product, Tax, PaymentMethod)

These four domains are mostly thin CRUD over the underlying repositories — they don't compose with other services. We do them first to establish the routing + integration test pattern.

### Task C1: ClientService + routes + integration tests

**Files:**
- Create: `packages/invoicing-kit/src/domains/clients/service.ts`
- Create: `packages/invoicing-kit/src/domains/clients/validation.ts`
- Create: `packages/invoicing-kit/src/domains/clients/mappers.ts`
- Create: `packages/invoicing-kit/src/domains/clients/exceptions.ts`
- Create: `packages/invoicing-kit/src/domains/clients/routes.ts`
- Create: `packages/invoicing-kit/tests/integration/clients.test.ts`
- Create: `packages/invoicing-kit/src/services.ts` (initial — adds clients only; later tasks extend)
- Create: `packages/invoicing-kit/src/router.ts` (initial — adds clients; later tasks extend)
- Create: `packages/invoicing-kit/src/index.ts` updated to export `createInvoicingKit`
- Create: `packages/invoicing-kit/src/create.ts` — the `createInvoicingKit` factory

This task lays down the pattern. Subsequent tasks (C2-D3) extend `services.ts`, `router.ts`, and add their own domain folder.

- [ ] **Step 1: Write the validation file `src/domains/clients/validation.ts`**

```ts
import { z } from "zod";

export const createClientBody = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  country: z.string().length(2).optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
});
export type CreateClientBody = z.infer<typeof createClientBody>;

export const updateClientBody = createClientBody.partial();
export type UpdateClientBody = z.infer<typeof updateClientBody>;

export const listClientsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  query: z.string().optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuery>;

export const clientResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  country: z.string().nullable(),
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClientResponse = z.infer<typeof clientResponse>;

export const clientListResponse = z.object({
  data: z.array(clientResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
export type ClientListResponse = z.infer<typeof clientListResponse>;
```

- [ ] **Step 2: Write `src/domains/clients/mappers.ts`**

```ts
import type { Client } from "../../types";
import type { ClientResponse } from "./validation";

export function clientToResponse(c: Client): ClientResponse {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    country: c.country,
    addressLine1: c.addressLine1,
    city: c.city,
    state: c.state,
    postalCode: c.postalCode,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 3: Write `src/domains/clients/exceptions.ts`**

```ts
import { httpError, ErrorCode } from "../../lib/errors";

export const ClientNotFoundException = () =>
  httpError({ code: ErrorCode.ClientNotFound, status: 404, message: "Client not found" });
```

- [ ] **Step 4: Write `src/domains/clients/service.ts`**

```ts
import type { Repositories, ListClientsArgs } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Client } from "../../types";
import type { CreateClientBody, UpdateClientBody, ListClientsQuery } from "./validation";
import { ClientNotFoundException } from "./exceptions";

export class ClientService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreateClientBody, ctx: AuthContext): Promise<Client> {
    return this.repos.clients.create({
      organizationId: ctx.organizationId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      country: body.country ?? null,
      addressLine1: body.addressLine1 ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      postalCode: body.postalCode ?? null,
    });
  }

  async list(query: ListClientsQuery, ctx: AuthContext) {
    const args: ListClientsArgs = {
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      query: query.query,
    };
    return this.repos.clients.list(args);
  }

  async findById(id: string, ctx: AuthContext): Promise<Client> {
    const client = await this.repos.clients.findById(id, ctx.organizationId);
    if (!client) throw ClientNotFoundException();
    return client;
  }

  async update(id: string, body: UpdateClientBody, ctx: AuthContext): Promise<Client> {
    // Verify existence (and throw typed 404 instead of a generic Prisma error).
    await this.findById(id, ctx);
    return this.repos.clients.update(id, ctx.organizationId, body);
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.clients.delete(id, ctx.organizationId);
  }
}
```

- [ ] **Step 5: Write `src/domains/clients/routes.ts`**

```ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authMiddleware, type BetterAuthLike } from "../../auth/middleware";
import type { ClientService } from "./service";
import {
  clientListResponse,
  clientResponse,
  createClientBody,
  listClientsQuery,
  updateClientBody,
} from "./validation";
import { clientToResponse } from "./mappers";
import type { AuthVariables } from "../../auth/types";

export function buildClientsRouter(service: ClientService, auth: BetterAuthLike) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware(auth));

  app.openapi(
    createRoute({
      method: "post",
      path: "/clients",
      tags: ["Clients"],
      request: { body: { content: { "application/json": { schema: createClientBody } } } },
      responses: {
        201: { content: { "application/json": { schema: clientResponse } }, description: "Created" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const created = await service.create(body, c.var.authContext);
      return c.json(clientToResponse(created), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/clients",
      tags: ["Clients"],
      request: { query: listClientsQuery },
      responses: {
        200: { content: { "application/json": { schema: clientListResponse } }, description: "List" },
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const page = await service.list(query, c.var.authContext);
      return c.json({
        data: page.data.map(clientToResponse),
        pageInfo: page.pageInfo,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/clients/{id}",
      tags: ["Clients"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: clientResponse } }, description: "Found" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const client = await service.findById(id, c.var.authContext);
      return c.json(clientToResponse(client));
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/clients/{id}",
      tags: ["Clients"],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: updateClientBody } } },
      },
      responses: {
        200: { content: { "application/json": { schema: clientResponse } }, description: "Updated" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await service.update(id, body, c.var.authContext);
      return c.json(clientToResponse(updated));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/clients/{id}",
      tags: ["Clients"],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        204: { description: "Deleted" },
        404: { description: "Not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      await service.delete(id, c.var.authContext);
      return c.body(null, 204);
    },
  );

  return app;
}
```

- [ ] **Step 6: Write `src/services.ts`**

```ts
import type { Repositories } from "./adapters/types";
import { ClientService } from "./domains/clients/service";

export interface Services {
  clients: ClientService;
}

export function buildServices(repos: Repositories): Services {
  return {
    clients: new ClientService(repos),
  };
}
```

(This file grows as each subsequent task adds a service. Each new domain task adds an import and a property.)

- [ ] **Step 7: Write `src/router.ts`**

```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Services } from "./services";
import type { BetterAuthLike } from "./auth/middleware";
import { buildClientsRouter } from "./domains/clients/routes";

interface BuildRouterArgs {
  services: Services;
  auth: BetterAuthLike;
  basePath: string;
}

export function buildRouter({ services, auth, basePath }: BuildRouterArgs) {
  const root = new OpenAPIHono();
  root.route(basePath, buildClientsRouter(services.clients, auth));
  return root;
}
```

(This file also grows per task — each new domain mounts its sub-router via another `root.route(basePath, ...)` call.)

- [ ] **Step 8: Write `src/create.ts`** (the factory)

```ts
import type { InvoicingKitConfig } from "./config";
import { buildServices } from "./services";
import { buildRouter } from "./router";

export function createInvoicingKit(config: InvoicingKitConfig) {
  const repos = config.adapter;
  const services = buildServices(repos);
  const router = buildRouter({
    services,
    auth: config.auth,
    basePath: config.basePath ?? "/api/bills",
  });
  return { router, services, repos };
}
```

- [ ] **Step 9: Extend `src/index.ts`** — add:

```ts
export { createInvoicingKit } from "./create";
export type { InvoicingKitConfig } from "./config";
export type { AuthContext } from "./auth/types";
```

- [ ] **Step 10: Write `tests/integration/clients.test.ts`**

```ts
import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

describe("clients integration", () => {
  test("POST /clients creates a client", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Co", email: "billing@acme.test" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Acme Co", email: "billing@acme.test" });
    expect(body.id).toBeTruthy();
  });

  test("GET /clients/{id} returns the client", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const create = await request("/api/bills/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Get me" }),
    });
    const created = await create.json();
    const res = await request(`/api/bills/clients/${created.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Get me");
  });

  test("GET /clients/{id} returns 404 for missing", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const res = await request("/api/bills/clients/missing");
    expect(res.status).toBe(404);
  });

  test("GET /clients lists with pagination", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    for (let i = 0; i < 3; i++) {
      await request("/api/bills/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `C${i}` }),
      });
    }
    const res = await request("/api/bills/clients?perPage=2&page=1");
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pageInfo.totalCount).toBe(3);
  });

  test("PATCH /clients/{id} updates fields", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const c = await (
      await request("/api/bills/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Old" }),
      })
    ).json();
    const res = await request(`/api/bills/clients/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("New");
  });

  test("DELETE /clients/{id} returns 204", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const c = await (
      await request("/api/bills/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bye" }),
      })
    ).json();
    const res = await request(`/api/bills/clients/${c.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const after = await request(`/api/bills/clients/${c.id}`);
    expect(after.status).toBe(404);
  });
});
```

- [ ] **Step 11: Run integration tests**

```
export INVOICING_KIT_TEST_DATABASE_URL=postgresql://test:test@localhost:5544/invoicing_kit_test
bun run test tests/integration/clients.test.ts
```

Expected: 6 tests pass. Total project test count: 132.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(domains): clients service + routes + integration tests"
```

---

### Task C2: ProductService + routes + integration tests

**Files:**
- Create: `packages/invoicing-kit/src/domains/products/{service,routes,validation,mappers,exceptions}.ts`
- Create: `packages/invoicing-kit/tests/integration/products.test.ts`
- Modify: `src/services.ts` (add products)
- Modify: `src/router.ts` (mount products router)

Mirror the Client pattern. Product fields: `name`, `description?`, `price` (DecimalString — validate as `z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format")`).

- [ ] **Step 1: validation.ts**

```ts
import { z } from "zod";

const priceSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal price");

export const createProductBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  price: priceSchema,
});
export type CreateProductBody = z.infer<typeof createProductBody>;

export const updateProductBody = createProductBody.partial();
export type UpdateProductBody = z.infer<typeof updateProductBody>;

export const listProductsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  query: z.string().optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

export const productResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductResponse = z.infer<typeof productResponse>;

export const productListResponse = z.object({
  data: z.array(productResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
```

- [ ] **Step 2: mappers.ts**

```ts
import type { Product } from "../../types";
import type { ProductResponse } from "./validation";

export function productToResponse(p: Product): ProductResponse {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 3: exceptions.ts**

```ts
import { httpError, ErrorCode } from "../../lib/errors";

export const ProductNotFoundException = () =>
  httpError({ code: ErrorCode.ProductNotFound, status: 404, message: "Product not found" });
```

- [ ] **Step 4: service.ts** — same pattern as ClientService with CRUD methods. Wire `findById` → throw `ProductNotFoundException()` on null. `update`/`delete` call `findById` first.

- [ ] **Step 5: routes.ts** — same pattern as ClientService routes (POST /products, GET /products, GET /products/{id}, PATCH /products/{id}, DELETE /products/{id}).

- [ ] **Step 6: Extend `src/services.ts`** to include `products: new ProductService(repos)`.

- [ ] **Step 7: Extend `src/router.ts`** with `root.route(basePath, buildProductsRouter(services.products, auth));`.

- [ ] **Step 8: Write `tests/integration/products.test.ts`** — 6 tests mirroring clients.test.ts: create with price "150.00", findById, 404, list pagination, update, delete.

- [ ] **Step 9: Run tests, commit.**

```
bun run test tests/integration/products.test.ts
```

Expected: 6 pass. Total: 138.

```bash
git commit -m "feat(domains): products service + routes + integration tests"
```

---

### Task C3: TaxService + routes + integration tests

**Files:**
- Create: `src/domains/taxes/{service,routes,validation,mappers,exceptions}.ts`
- Create: `tests/integration/taxes.test.ts`
- Modify: `src/services.ts`, `src/router.ts`

Tax has an extra concern: when a tax is created or updated with `isDefault=true`, all other taxes for the org must have their `isDefault` cleared. The service uses `repos.tx()` for atomicity.

- [ ] **Step 1: validation.ts**

```ts
import { z } from "zod";

const rateSchema = z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid decimal rate");

export const createTaxBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  rate: rateSchema,
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateTaxBody = z.infer<typeof createTaxBody>;

export const updateTaxBody = createTaxBody.partial();
export type UpdateTaxBody = z.infer<typeof updateTaxBody>;

export const listTaxesQuery = z.object({
  isActive: z.enum(["true", "false"]).optional(),
});
export type ListTaxesQuery = z.infer<typeof listTaxesQuery>;

export const taxResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  rate: z.string(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaxResponse = z.infer<typeof taxResponse>;
```

- [ ] **Step 2: service.ts** with the default-clearing logic

```ts
import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Tax } from "../../types";
import type { CreateTaxBody, UpdateTaxBody, ListTaxesQuery } from "./validation";
import { TaxNotFoundException } from "./exceptions";

export class TaxService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreateTaxBody, ctx: AuthContext): Promise<Tax> {
    return this.repos.tx(async (tx) => {
      const created = await tx.taxes.create({
        organizationId: ctx.organizationId,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        rate: body.rate,
        isActive: body.isActive,
        isDefault: body.isDefault,
      });
      if (body.isDefault) {
        await tx.taxes.clearDefaultExcept(ctx.organizationId, created.id);
      }
      return created;
    });
  }

  async list(query: ListTaxesQuery, ctx: AuthContext) {
    return this.repos.taxes.list({
      organizationId: ctx.organizationId,
      isActive: query.isActive === undefined ? undefined : query.isActive === "true",
    });
  }

  async findById(id: string, ctx: AuthContext): Promise<Tax> {
    const tax = await this.repos.taxes.findById(id, ctx.organizationId);
    if (!tax) throw TaxNotFoundException();
    return tax;
  }

  async update(id: string, body: UpdateTaxBody, ctx: AuthContext): Promise<Tax> {
    return this.repos.tx(async (tx) => {
      const existing = await tx.taxes.findById(id, ctx.organizationId);
      if (!existing) throw TaxNotFoundException();
      const updated = await tx.taxes.update(id, ctx.organizationId, body);
      if (body.isDefault === true) {
        await tx.taxes.clearDefaultExcept(ctx.organizationId, id);
      }
      return updated;
    });
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.taxes.delete(id, ctx.organizationId);
  }
}
```

- [ ] **Step 3: exceptions.ts, mappers.ts** (mirror clients pattern; mapper outputs `taxResponse` shape).

- [ ] **Step 4: routes.ts** — POST/GET/GET/{id}/PATCH/DELETE under `/taxes`. Same handler shape as clients.

- [ ] **Step 5: Wire into services.ts + router.ts.**

- [ ] **Step 6: Integration tests `tests/integration/taxes.test.ts`** — 6 tests including:
  - Create tax
  - Create tax with `isDefault=true`, verify other taxes have isDefault cleared
  - List filtered by isActive
  - Update; setting isDefault=true clears others
  - Delete
  - 404 for missing

- [ ] **Step 7: Run + commit.**

```
bun run test tests/integration/taxes.test.ts
```

Expected: 6 pass. Total: 144.

```bash
git commit -m "feat(domains): taxes service + routes + integration tests"
```

---

### Task C4: PaymentMethodService + routes + integration tests

**Files:**
- Create: `src/domains/payment-methods/{service,routes,validation,mappers,exceptions}.ts`
- Create: `tests/integration/payment-methods.test.ts`
- Modify: `src/services.ts`, `src/router.ts`

Same shape as Tax (clearDefaultExcept semantics). Differences:
- Has `instructions: string | null`, `metadata: unknown | null`
- `type` enum is `"STRIPE" | "MANUAL"`

- [ ] **Step 1: validation.ts** — same shape as taxes; replace fields per the model. `metadata: z.unknown().optional().nullable()`. PaymentMethod response includes `instructions` and `metadata`.

- [ ] **Step 2: service.ts** — same pattern as TaxService with `clearDefaultExcept` logic on `isDefault=true`. CRUD methods.

- [ ] **Step 3: exceptions.ts, mappers.ts, routes.ts** — mirror taxes.

- [ ] **Step 4: Wire into services.ts + router.ts.**

- [ ] **Step 5: Integration tests** — 5-6 tests including metadata round-trip and isDefault clearing.

- [ ] **Step 6: Run + commit.**

```
bun run test tests/integration/payment-methods.test.ts
```

Expected: ~6 pass. Total: 150.

```bash
git commit -m "feat(domains): payment-methods service + routes + integration tests"
```

---

## Phase D — Document-based domain services + routes

Invoice and Quote share the same `Document` foundation and use the calculator + numbering + tax-strategy collaborators. Payment is its own thing but touches Invoice state.

### Task D1: QuoteService + routes + integration tests

**Files:**
- Create: `src/domains/quotes/{service,routes,validation,mappers,exceptions}.ts`
- Create: `tests/integration/quotes.test.ts`
- Modify: `src/services.ts`, `src/router.ts`

Source reference for service logic: `/Users/anthonytaveras/Documents/bills_simple/api/src/routes/quote/quote.service.ts` (316 lines). Adapt: replace `prisma.X.Y()` with `repos.X.Y()`; use shared `DocumentCalculator`, `DocumentNumberingService`, `TaxStrategy`.

- [ ] **Step 1: validation.ts**

```ts
import { z } from "zod";

const lineItemSchema = z.object({
  productId: z.string(),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid quantity"),
  price: z.string().regex(/^\d+$/, "Price must be integer minor units"), // BigInt as string in body
  description: z.string().optional().nullable(),
  taxIds: z.array(z.string()).default([]),
});

export const createQuoteBody = z.object({
  clientId: z.string(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]).default("draft"),
  lineItems: z.array(lineItemSchema).min(1),
  paymentMethodIds: z.array(z.string()).default([]),
});
export type CreateQuoteBody = z.infer<typeof createQuoteBody>;

export const updateQuoteBody = z.object({
  clientId: z.string().optional(),
  documentNumberPrefix: z.string().max(20).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]).optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
  paymentMethodIds: z.array(z.string()).optional(),
});
export type UpdateQuoteBody = z.infer<typeof updateQuoteBody>;

export const listQuotesQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(), // comma-separated
  clientId: z.string().optional(),
});
export type ListQuotesQuery = z.infer<typeof listQuotesQuery>;

const lineItemResponse = z.object({
  id: z.string(),
  productId: z.string(),
  quantity: z.string(),
  price: z.string(),
  taxAmount: z.string(),
  total: z.string(),
  description: z.string().nullable(),
  taxes: z.array(z.object({ id: z.string(), taxId: z.string(), taxAmount: z.string() })),
});

export const quoteResponse = z.object({
  id: z.string(),
  documentId: z.string(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]),
  validUntil: z.string().nullable(),
  document: z.object({
    clientId: z.string(),
    documentNumberPrefix: z.string().nullable(),
    documentNumber: z.number().int(),
    issueDate: z.string(),
    dueDate: z.string().nullable(),
    notes: z.string().nullable(),
    subtotal: z.string().nullable(),
    tax: z.string().nullable(),
    total: z.string().nullable(),
    lineItems: z.array(lineItemResponse),
  }),
});
export type QuoteResponse = z.infer<typeof quoteResponse>;

export const quoteListResponse = z.object({
  data: z.array(quoteResponse),
  pageInfo: z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalCount: z.number().int(),
    pageCount: z.number().int(),
  }),
});
```

- [ ] **Step 2: mappers.ts**

```ts
import type { Quote, Document, DocumentLineItem, DocumentLineItemTax } from "../../types";
import type { QuoteWithDocument, DocumentWithRelations } from "../../adapters/types";
import type { QuoteResponse } from "./validation";

function lineItemToResponse(li: DocumentLineItem & { taxes: DocumentLineItemTax[] }) {
  return {
    id: li.id,
    productId: li.productId,
    quantity: li.quantity,
    price: li.price.toString(),
    taxAmount: li.taxAmount.toString(),
    total: li.total.toString(),
    description: li.description,
    taxes: li.taxes.map((t) => ({
      id: t.id,
      taxId: t.taxId,
      taxAmount: t.taxAmount.toString(),
    })),
  };
}

function documentToResponse(doc: DocumentWithRelations) {
  return {
    clientId: doc.clientId,
    documentNumberPrefix: doc.documentNumberPrefix,
    documentNumber: doc.documentNumber,
    issueDate: doc.issueDate.toISOString().slice(0, 10),
    dueDate: doc.dueDate ? doc.dueDate.toISOString().slice(0, 10) : null,
    notes: doc.notes,
    subtotal: doc.subtotal !== null ? doc.subtotal.toString() : null,
    tax: doc.tax !== null ? doc.tax.toString() : null,
    total: doc.total !== null ? doc.total.toString() : null,
    lineItems: doc.lineItems.map(lineItemToResponse),
  };
}

export function quoteToResponse(q: QuoteWithDocument): QuoteResponse {
  return {
    id: q.id,
    documentId: q.documentId,
    status: q.status,
    validUntil: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
    document: documentToResponse(q.document),
  };
}
```

- [ ] **Step 3: exceptions.ts**

```ts
import { httpError, ErrorCode } from "../../lib/errors";

export const QuoteNotFoundException = () =>
  httpError({ code: ErrorCode.QuoteNotFound, status: 404, message: "Quote not found" });

export const QuoteNumberAlreadyExistsException = () =>
  httpError({
    code: ErrorCode.QuoteNumberAlreadyExists,
    status: 409,
    message: "A quote with this number already exists",
  });
```

- [ ] **Step 4: service.ts** — the main orchestration. Methods: `create`, `findById`, `list`, `update`, `delete`. Pattern follows the source `quote.service.ts` but uses `repos.tx()` for transactional document+quote creation.

```ts
import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Quote } from "../../types";
import type { QuoteWithDocument } from "../../adapters/types";
import type { CreateQuoteBody, UpdateQuoteBody, ListQuotesQuery } from "./validation";
import { QuoteNotFoundException, QuoteNumberAlreadyExistsException } from "./exceptions";
import { DocumentCalculator } from "../../lib/calculator";
import { DocumentNumberingService } from "../../lib/numbering";
import { TaxStrategy } from "../../lib/tax-strategy";

export class QuoteService {
  constructor(
    private readonly repos: Repositories,
    private readonly calc = new DocumentCalculator(),
    private readonly numbering = new DocumentNumberingService(),
    private readonly tax = new TaxStrategy(),
  ) {}

  async create(body: CreateQuoteBody, ctx: AuthContext): Promise<Quote> {
    return this.repos.tx(async (tx) => {
      const number = await this.numbering.next(
        tx,
        ctx.organizationId,
        "QUOTE",
        body.documentNumberPrefix ?? null,
      );
      // Pre-check uniqueness if a prefix is provided (rare race against tx isolation, but cleaner UX).
      const existing = await tx.quotes.findByDocumentNumber({
        organizationId: ctx.organizationId,
        prefix: body.documentNumberPrefix ?? null,
        documentNumber: number,
      });
      if (existing) throw QuoteNumberAlreadyExistsException();

      // Compute line items with taxes.
      const lineItems = [];
      for (const li of body.lineItems) {
        const price = BigInt(li.price);
        const taxResult = await this.tax.computeForLine(tx, ctx.organizationId, {
          quantity: li.quantity,
          price,
          taxIds: li.taxIds,
        });
        const lineTotals = this.calc.lineTotal({
          quantity: li.quantity,
          price,
          taxAmount: taxResult.taxAmount,
        });
        lineItems.push({
          productId: li.productId,
          quantity: li.quantity,
          price,
          description: li.description ?? null,
          taxes: taxResult.perTax,
          taxAmount: taxResult.taxAmount,
          total: lineTotals.total,
        });
      }

      const docTotals = this.calc.documentTotals(
        lineItems.map((li) => ({
          subtotal: li.total - li.taxAmount,
          taxAmount: li.taxAmount,
          total: li.total,
        })),
      );

      const doc = await tx.documents.create({
        type: "QUOTE",
        organizationId: ctx.organizationId,
        clientId: body.clientId,
        documentNumberPrefix: body.documentNumberPrefix ?? null,
        documentNumber: number,
        issueDate: new Date(body.issueDate),
        notes: body.notes ?? null,
        subtotal: docTotals.subtotal,
        tax: docTotals.tax,
        total: docTotals.total,
        lineItems,
        paymentMethodIds: body.paymentMethodIds,
      });

      return tx.quotes.create({
        documentId: doc.id,
        status: body.status,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
      });
    });
  }

  async findById(id: string, ctx: AuthContext): Promise<QuoteWithDocument> {
    const q = await this.repos.quotes.findById(id, ctx.organizationId);
    if (!q) throw QuoteNotFoundException();
    return q;
  }

  async list(query: ListQuotesQuery, ctx: AuthContext) {
    return this.repos.quotes.list({
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      status: query.status ? (query.status.split(",") as any) : undefined,
      clientId: query.clientId,
    });
  }

  async update(id: string, body: UpdateQuoteBody, ctx: AuthContext): Promise<Quote> {
    return this.repos.tx(async (tx) => {
      const existing = await tx.quotes.findById(id, ctx.organizationId);
      if (!existing) throw QuoteNotFoundException();

      // Patch scalar quote fields.
      const quoteUpdate: { status?: any; validUntil?: Date | null } = {};
      if (body.status !== undefined) quoteUpdate.status = body.status;
      if (body.validUntil !== undefined)
        quoteUpdate.validUntil = body.validUntil ? new Date(body.validUntil) : null;

      let updated = existing;
      if (Object.keys(quoteUpdate).length > 0) {
        const u = await tx.quotes.update(id, ctx.organizationId, quoteUpdate);
        updated = { ...existing, ...u };
      }

      // Patch document scalar fields.
      const documentUpdate: any = {};
      if (body.clientId !== undefined) documentUpdate.clientId = body.clientId;
      if (body.documentNumberPrefix !== undefined)
        documentUpdate.documentNumberPrefix = body.documentNumberPrefix;
      if (body.issueDate !== undefined) documentUpdate.issueDate = new Date(body.issueDate);
      if (body.notes !== undefined) documentUpdate.notes = body.notes;

      // If line items changed, recompute totals and replace.
      if (body.lineItems !== undefined) {
        const lineItems = [];
        for (const li of body.lineItems) {
          const price = BigInt(li.price);
          const taxResult = await this.tax.computeForLine(tx, ctx.organizationId, {
            quantity: li.quantity,
            price,
            taxIds: li.taxIds,
          });
          const lineTotals = this.calc.lineTotal({
            quantity: li.quantity,
            price,
            taxAmount: taxResult.taxAmount,
          });
          lineItems.push({
            productId: li.productId,
            quantity: li.quantity,
            price,
            description: li.description ?? null,
            taxes: taxResult.perTax,
            taxAmount: taxResult.taxAmount,
            total: lineTotals.total,
          });
        }
        const docTotals = this.calc.documentTotals(
          lineItems.map((l) => ({
            subtotal: l.total - l.taxAmount,
            taxAmount: l.taxAmount,
            total: l.total,
          })),
        );
        documentUpdate.subtotal = docTotals.subtotal;
        documentUpdate.tax = docTotals.tax;
        documentUpdate.total = docTotals.total;
        await tx.documents.replaceLineItems(existing.documentId, ctx.organizationId, lineItems);
      }

      if (body.paymentMethodIds !== undefined) {
        await tx.documents.setPaymentMethods(
          existing.documentId,
          ctx.organizationId,
          body.paymentMethodIds,
        );
      }

      if (Object.keys(documentUpdate).length > 0) {
        await tx.documents.update(existing.documentId, ctx.organizationId, documentUpdate);
      }

      return updated;
    });
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    const q = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
      await tx.quotes.delete(q.id, ctx.organizationId);
      await tx.documents.delete(q.documentId, ctx.organizationId);
    });
  }
}
```

- [ ] **Step 5: routes.ts** — POST /quotes, GET /quotes, GET /quotes/{id}, PATCH /quotes/{id}, DELETE /quotes/{id}. Use the same pattern as ClientService routes; map via `quoteToResponse` on the joined `findById` result.

For `POST /quotes`, after `service.create(...)` returns just `Quote`, re-fetch via `service.findById(created.id, ctx)` to get the full `QuoteWithDocument` to return.

- [ ] **Step 6: Wire into services.ts + router.ts.**

- [ ] **Step 7: Integration tests `tests/integration/quotes.test.ts`** — at minimum:
  - Create quote with one line item + one tax, verify totals are correct (e.g., qty 1, price 10000, VAT 21% → tax 2100, total 12100).
  - findById returns the full joined doc.
  - List filtered by status.
  - Update status from draft to sent.
  - Update line items; verify totals recompute.
  - Delete; verify findById returns 404.
  - 6 tests minimum.

- [ ] **Step 8: Run + commit.**

```
bun run test tests/integration/quotes.test.ts
```

Expected: ~6 pass. Total: 156.

```bash
git commit -m "feat(domains): quotes service + routes + integration tests"
```

---

### Task D2: InvoiceService + routes + integration tests

**Files:**
- Create: `src/domains/invoices/{service,routes,validation,mappers,exceptions}.ts`
- Create: `tests/integration/invoices.test.ts`
- Modify: `src/services.ts`, `src/router.ts`

Source reference: `/Users/anthonytaveras/Documents/bills_simple/api/src/routes/invoice/invoice.service.ts` (326 lines).

Same shape as Quote, with these invoice-specific bits:
- `status` enum: `"draft" | "sent" | "paid" | "partially_paid"`.
- Has `paidDate` field.
- Has `convertedFromQuoteId` — set when the invoice was converted from a quote.
- Plus a special method: `convertFromQuote(quoteId, body, ctx)` — copies the quote's document fields into a new invoice, marks the quote `status: "converted"`.

- [ ] **Step 1: validation.ts** — Same shape as quote validation, with these differences:
  - `status` enum is `["draft", "sent", "paid", "partially_paid"]`.
  - Add `paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()` to both create and update.
  - Add a separate `convertFromQuoteBody` schema with just `paymentMethodIds: z.array(z.string()).optional()` (the rest is inherited from the quote).

- [ ] **Step 2: mappers.ts** — Similar to quote's mapper; add `paidDate` field.

- [ ] **Step 3: exceptions.ts**

```ts
import { httpError, ErrorCode } from "../../lib/errors";
import type { ErrorCodeValue } from "../../lib/errors";

export const InvoiceNotFoundException = () =>
  httpError({ code: ErrorCode.InvoiceNotFound, status: 404, message: "Invoice not found" });

export const InvoiceNumberAlreadyExistsException = () =>
  httpError({
    code: ErrorCode.InvoiceNumberAlreadyExists,
    status: 409,
    message: "An invoice with this number already exists",
  });

export const QuoteAlreadyConvertedException = () =>
  httpError({
    code: ErrorCode.QuoteAlreadyConverted,
    status: 409,
    message: "Quote has already been converted to an invoice",
  });
```

- [ ] **Step 4: service.ts** — Mirror QuoteService with these changes:
  - `status` field is `InvoiceStatus`; `validUntil` becomes `paidDate`.
  - On `create` with `status === "paid"` and no `paidDate`, default `paidDate` to `new Date()`.
  - Add `convertFromQuote(quoteId, body, ctx)`:
    1. Find the quote.
    2. Verify `quote.status !== "converted"` (throw `QuoteAlreadyConvertedException`).
    3. Inside a tx: get a new invoice number, create the new Document with copied line items + taxes from the quote's document, create the Invoice with `convertedFromQuoteId: quote.id`, update the quote to `status: "converted"`.
    4. Return the new invoice.

- [ ] **Step 5: routes.ts** — Add the standard 5 routes plus `POST /invoices/from-quote/{quoteId}` for conversion.

- [ ] **Step 6: Wire into services.ts + router.ts.**

- [ ] **Step 7: Integration tests `tests/integration/invoices.test.ts`** — at minimum:
  - Create invoice with one line item, verify totals.
  - findById returns joined document.
  - Update status to "paid"; auto-sets paidDate.
  - List filtered by status.
  - List filtered by issueDate range.
  - Delete.
  - Convert a quote to invoice: create quote → POST /invoices/from-quote/{id} → new invoice exists with `convertedFromQuoteId`, quote.status updated to "converted".
  - Double-convert returns 409.
  - 8 tests minimum.

- [ ] **Step 8: Run + commit.**

```
bun run test tests/integration/invoices.test.ts
```

Expected: 8 pass. Total: 164.

```bash
git commit -m "feat(domains): invoices service + routes + integration tests"
```

---

### Task D3: PaymentService + routes + integration tests

**Files:**
- Create: `src/domains/payments/{service,routes,validation,mappers,exceptions}.ts`
- Create: `tests/integration/payments.test.ts`
- Modify: `src/services.ts`, `src/router.ts`

Source reference: `/Users/anthonytaveras/Documents/bills_simple/api/src/routes/payments/payment.service.ts` (497 lines, but most is Stripe-specific — we keep only the MANUAL path for v0).

Routes:
- `POST /invoices/{invoiceId}/payments` — record a manual payment.
- `GET /invoices/{invoiceId}/payments` — list payments for an invoice.
- `GET /payments/{id}` — fetch one.
- `DELETE /payments/{id}` — void.

Business rule: when a payment is recorded with `status: "succeeded"`, the service must call `totalPaidForInvoice` and update the invoice's status accordingly:
- If `totalPaid >= invoice.document.total`: set invoice status to `"paid"` + `paidDate: new Date()`.
- Otherwise if `totalPaid > 0`: set invoice status to `"partially_paid"`.
- Otherwise leave alone.

Also validate: `amount + totalPaidForInvoice <= invoice.document.total`. If exceeds, throw `PaymentAmountExceedsInvoiceTotal`.

- [ ] **Step 1: validation.ts**

```ts
import { z } from "zod";

export const createPaymentBody = z.object({
  paymentMethodId: z.string().optional().nullable(),
  amount: z.string().regex(/^\d+$/, "Amount must be integer minor units"),
  currency: z.string().length(3),
  provider: z.literal("MANUAL"), // v0: only MANUAL
  paidAt: z.string().datetime().optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CreatePaymentBody = z.infer<typeof createPaymentBody>;

export const paymentResponse = z.object({
  id: z.string(),
  invoiceId: z.string(),
  paymentMethodId: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  status: z.enum(["pending", "processing", "succeeded", "failed", "canceled"]),
  provider: z.enum(["STRIPE", "MANUAL"]),
  paidAt: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type PaymentResponse = z.infer<typeof paymentResponse>;
```

- [ ] **Step 2: service.ts**

```ts
import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Payment } from "../../types";
import type { CreatePaymentBody } from "./validation";
import { httpError, ErrorCode } from "../../lib/errors";
import { InvoiceNotFoundException } from "../invoices/exceptions";

export class PaymentService {
  constructor(private readonly repos: Repositories) {}

  async recordManualPayment(
    invoiceId: string,
    body: CreatePaymentBody,
    ctx: AuthContext,
  ): Promise<Payment> {
    return this.repos.tx(async (tx) => {
      const invoice = await tx.invoices.findById(invoiceId, ctx.organizationId);
      if (!invoice) throw InvoiceNotFoundException();

      const invoiceTotal = invoice.document.total ?? 0n;
      const alreadyPaid = await tx.payments.totalPaidForInvoice(invoiceId, ctx.organizationId);
      const amount = BigInt(body.amount);
      if (alreadyPaid + amount > invoiceTotal) {
        throw httpError({
          code: ErrorCode.PaymentAmountExceedsInvoiceTotal,
          status: 400,
          message: "Payment amount would exceed invoice total",
        });
      }

      const payment = await tx.payments.create({
        invoiceId,
        paymentMethodId: body.paymentMethodId ?? null,
        amount,
        currency: body.currency,
        status: "succeeded",
        provider: "MANUAL",
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        recordedBy: ctx.userId,
      });

      // Update invoice status based on the new total.
      const newTotalPaid = alreadyPaid + amount;
      if (newTotalPaid >= invoiceTotal) {
        await tx.invoices.update(invoiceId, ctx.organizationId, {
          status: "paid",
          paidDate: new Date(),
        });
      } else {
        await tx.invoices.update(invoiceId, ctx.organizationId, {
          status: "partially_paid",
        });
      }

      return payment;
    });
  }

  async listForInvoice(invoiceId: string, ctx: AuthContext) {
    // Org-scope check via invoice
    const invoice = await this.repos.invoices.findById(invoiceId, ctx.organizationId);
    if (!invoice) throw InvoiceNotFoundException();
    return this.repos.payments.list({ organizationId: ctx.organizationId, invoiceId });
  }

  async findById(id: string, ctx: AuthContext): Promise<Payment> {
    const p = await this.repos.payments.findById(id, ctx.organizationId);
    if (!p) {
      throw httpError({
        code: ErrorCode.PaymentNotFound,
        status: 404,
        message: "Payment not found",
      });
    }
    return p;
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    const payment = await this.findById(id, ctx);
    await this.repos.tx(async (tx) => {
      await tx.payments.delete(id, ctx.organizationId);
      // Recompute invoice status after removing the payment.
      const remaining = await tx.payments.totalPaidForInvoice(payment.invoiceId, ctx.organizationId);
      const inv = await tx.invoices.findById(payment.invoiceId, ctx.organizationId);
      if (!inv) return;
      const invoiceTotal = inv.document.total ?? 0n;
      const newStatus =
        remaining >= invoiceTotal ? "paid" : remaining > 0n ? "partially_paid" : "sent";
      const updateData: any = { status: newStatus };
      if (newStatus !== "paid") updateData.paidDate = null;
      await tx.invoices.update(payment.invoiceId, ctx.organizationId, updateData);
    });
  }
}
```

- [ ] **Step 3: routes.ts** — 4 routes as listed above. Map payments via `paymentToResponse` helper in `mappers.ts`.

- [ ] **Step 4: Wire into services.ts + router.ts.**

- [ ] **Step 5: Integration tests `tests/integration/payments.test.ts`**:
  - Create invoice → POST /invoices/{id}/payments with amount equal to invoice total → invoice status flips to "paid".
  - Partial payment → invoice status flips to "partially_paid".
  - Second payment that completes the total → flips to "paid".
  - Overpayment is rejected (400).
  - List payments for an invoice.
  - Delete a payment → invoice status recalculates.
  - 6 tests minimum.

- [ ] **Step 6: Run + commit.**

```
bun run test tests/integration/payments.test.ts
```

Expected: 6 pass. Total: 170.

```bash
git commit -m "feat(domains): payments service + routes + integration tests"
```

---

## Phase E — Wrap-up

### Task E1: Cross-domain integration test + OpenAPI doc endpoint

**Files:**
- Create: `tests/integration/end-to-end.test.ts`
- Modify: `src/create.ts` (optional: add OpenAPI spec endpoint)

End-to-end smoke test that exercises the full invoicing flow: create client + product + tax → create quote → convert to invoice → record payment → verify invoice paid status.

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

test("full invoicing flow: client → product → quote → invoice → payment", async () => {
  const { request } = await buildHarness(createInvoicingKit);

  // 1. Create client
  const client = await (await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Client" }),
  })).json();

  // 2. Create product
  const product = await (await request("/api/bills/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Service", price: "100.00" }),
  })).json();

  // 3. Create tax
  const tax = await (await request("/api/bills/taxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "VAT", type: "PERCENTAGE", rate: "0.2100" }),
  })).json();

  // 4. Create quote
  const quote = await (await request("/api/bills/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: client.id,
      issueDate: "2026-01-15",
      lineItems: [
        { productId: product.id, quantity: "1", price: "10000", taxIds: [tax.id] },
      ],
    }),
  })).json();
  expect(quote.document.total).toBe("12100"); // 10000 + 2100 tax

  // 5. Convert quote to invoice
  const invoice = await (await request(`/api/bills/invoices/from-quote/${quote.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })).json();
  expect(invoice.document.total).toBe("12100");

  // 6. Record full payment
  const payment = await (await request(`/api/bills/invoices/${invoice.id}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: "12100",
      currency: "usd",
      provider: "MANUAL",
    }),
  })).json();
  expect(payment.amount).toBe("12100");

  // 7. Verify invoice is now paid
  const refetched = await (await request(`/api/bills/invoices/${invoice.id}`)).json();
  expect(refetched.status).toBe("paid");
  expect(refetched.paidDate).toBeTruthy();

  // 8. Verify the original quote is converted
  const refetchedQuote = await (await request(`/api/bills/quotes/${quote.id}`)).json();
  expect(refetchedQuote.status).toBe("converted");
});
```

- [ ] **Step 2: Run all tests**

```
bun run test
```

Expected: 171 tests pass (118 conformance + 1 conformance index + 1 smoke + 4 cross + 1 + 6 unit calculator/numbering/tax + ~6 per integration × 7 domains + 1 e2e).

- [ ] **Step 3: Commit**

```bash
git commit -m "test(e2e): full invoicing flow integration test"
```

---

### Task E2: Public exports + README update + Plan 2 tag

**Files:**
- Modify: `packages/invoicing-kit/src/index.ts`
- Modify: `packages/invoicing-kit/README.md`
- Modify: workspace root `README.md`

- [ ] **Step 1: Final `src/index.ts`**

Should now export:
- All types from `./types`
- All repository interfaces from `./adapters/types`
- `prismaAdapter` from `./adapters/prisma`
- `createInvoicingKit` from `./create`
- `InvoicingKitConfig` from `./config`
- `AuthContext` from `./auth/types`
- `ErrorCode`, `ErrorCodeKey`, `ErrorCodeValue` from `./lib/errors`

Verify each is re-exported with the right `export` / `export type` form (types use `export type`).

- [ ] **Step 2: Update `packages/invoicing-kit/README.md`**

Add a Quick-start section showing the consumer pattern:

```markdown
## Quick start

```ts
import { createInvoicingKit, prismaAdapter } from "invoicing-kit";
import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { auth } from "./auth"; // your better-auth instance with organization plugin

const prisma = new PrismaClient();
const bills = createInvoicingKit({
  adapter: prismaAdapter(prisma),
  auth,
  basePath: "/api/bills",
});

const app = new Hono();
app.route("/", bills.router);
app.route("/api/auth", auth.handler); // your own better-auth mount

export default app;
```

The package mounts these routes (under `basePath`):

- `POST/GET/GET/PATCH/DELETE /clients[/:id]`
- `POST/GET/GET/PATCH/DELETE /products[/:id]`
- `POST/GET/GET/PATCH/DELETE /taxes[/:id]`
- `POST/GET/GET/PATCH/DELETE /payment-methods[/:id]`
- `POST/GET/GET/PATCH/DELETE /quotes[/:id]`
- `POST/GET/GET/PATCH/DELETE /invoices[/:id]`
- `POST /invoices/from-quote/:quoteId` — convert quote → invoice
- `POST/GET /invoices/:invoiceId/payments` — record / list payments
- `GET/DELETE /payments/:id`
```

- [ ] **Step 3: Update workspace root `README.md`**

Reflect that Plan 2 is done. Update the Packages section to note `invoicing-kit` now ships a full HTTP API.

- [ ] **Step 4: Verify everything**

```
cd packages/invoicing-kit
bun run typecheck
bun run test
bun run build
```

All must pass.

- [ ] **Step 5: Commit + tag**

```bash
git add -A
git commit -m "docs: Plan 2 wrap-up + public API exports"
git tag -a plan-2-domains-routes -m "Plan 2 complete: services, routes, auth middleware, factory"
```

---

## Done criteria for Plan 2

- [ ] All 7 domains (clients, products, taxes, payment-methods, quotes, invoices, payments) have services + routes + integration tests.
- [ ] `createInvoicingKit({ adapter, auth, basePath })` returns `{ router, services, repos }`; the router is mountable on a Hono app via `app.route("/", bills.router)`.
- [ ] Auth middleware reads better-auth session, builds `AuthContext`, throws 401 / 400 with typed error codes.
- [ ] Shared `DocumentCalculator`, `DocumentNumberingService`, `TaxStrategy` correctly compute line/document totals with bigint precision.
- [ ] End-to-end flow test passes: client → product → tax → quote → invoice → payment → status updates to "paid".
- [ ] Public API exports: `createInvoicingKit`, `prismaAdapter`, all domain types, all repo interfaces, `ErrorCode`. No `__prisma` escape hatch leaks.
- [ ] All ~170 tests pass. typecheck + build clean.

**Plan 2 deliverable:** the invoicing-kit package becomes drop-in usable in a Hono app. Plan 3 adds the CLI for schema generation + example app for documentation/learning.

## What's next (Plan 3 preview)

- `@invoicing-kit/cli` runtime — `generate` command that writes `templates/v0/*.prisma` into the consumer's `prisma/models/` folder.
- `examples/hono-prisma-basic/` — minimal working app showing the full integration.
- npm publishing prep (changesets, version 0.1.0).

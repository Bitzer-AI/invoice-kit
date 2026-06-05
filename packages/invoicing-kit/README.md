# invoicing-kit

[![npm version](https://img.shields.io/npm/v/invoicing-kit.svg)](https://www.npmjs.com/package/invoicing-kit)
[![license](https://img.shields.io/npm/l/invoicing-kit.svg)](./LICENSE)

Drop-in invoicing API for [Hono](https://hono.dev) apps using [better-auth](https://better-auth.com). Mount one router and get organization-scoped clients, products, taxes, payment methods, quotes, invoices, and payments — backed by Prisma (or your own repository implementation).

## Features

- **One-line mount** — `app.route("/", kit.router)` adds the full REST surface.
- **Organization-scoped** — every resource is isolated per better-auth organization.
- **Quotes → invoices** — convert an accepted quote into an invoice in one call.
- **Payments** — record manual payments and track invoice paid / partially-paid state.
- **Catalog by reference** — link line items to your own domain objects (an experience, course, plan…) and the kit find-or-creates the backing product.
- **Money-safe** — amounts are integer minor units, rates/quantities are decimal strings; no floats cross the boundary.
- **Pluggable storage** — ships a Prisma adapter and an in-memory test adapter; bring your own by implementing the repository interfaces.
- **Typed & validated** — Zod schemas on every route, OpenAPI metadata included.

## Install

```bash
bun add invoicing-kit
# peer deps:
bun add @prisma/client better-auth hono @hono/zod-openapi zod
```

## Quick start

```ts
import { createInvoicingKit, prismaAdapter } from "invoicing-kit";
import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { auth } from "./auth"; // your better-auth instance with the organization plugin

const prisma = new PrismaClient();

const kit = createInvoicingKit({
  adapter: prismaAdapter(prisma),
  auth,
  basePath: "/api/bills", // default: "/api/bills"
});

const app = new Hono();
app.route("/", kit.router);
app.route("/api/auth", auth.handler); // your own better-auth mount

export default app;
```

### Configuration

`createInvoicingKit(config)` accepts:

| Option     | Type           | Description                                               |
| ---------- | -------------- | --------------------------------------------------------- |
| `adapter`  | `Repositories` | Storage backend. Use `prismaAdapter(prisma)` or your own. |
| `auth`     | better-auth    | Instance with the organization plugin enabled.            |
| `basePath` | `string`       | Mount path for the router. Default `"/api/bills"`.        |

It returns `{ router, services, repos }` — mount `router`, or call `services` / `repos` directly for server-side work.

## Routes

Mounted under `basePath`:

| Resource        | Routes                                                               |
| --------------- | ------------------------------------------------------------------- |
| Clients         | `POST/GET/GET/PATCH/DELETE /clients[/:id]`                           |
| Products        | `POST/GET/GET/PATCH/DELETE /products[/:id]`                          |
| Taxes           | `POST/GET/GET/PATCH/DELETE /taxes[/:id]`                             |
| Payment methods | `POST/GET/GET/PATCH/DELETE /payment-methods[/:id]`                   |
| Quotes          | `POST/GET/GET/PATCH/DELETE /quotes[/:id]`                            |
| Invoices        | `POST/GET/GET/PATCH/DELETE /invoices[/:id]`                          |
| Convert         | `POST /invoices/from-quote/:quoteId`                                 |
| Payments        | `POST/GET /invoices/:invoiceId/payments`, `GET/DELETE /payments/:id` |

## Money units

Values cross the API boundary as strings to avoid floating-point drift:

- **Amounts** (`price`, `amount`, invoice totals) — integer **minor units** (cents), e.g. `"5000"` for $50.00.
- **Rates / quantities** — canonical decimal strings, e.g. `"1.5"`, `"18"`.

Your application converts to/from display units at its own edge.

## Payment methods & providers

A payment method's `type` and a payment's `provider` are free-form strings — `"STRIPE"`, `"MANUAL"`, and `"AZUL"` are the conventional values, but any gateway string is accepted, so you can support regional providers without a library change. Constrain the set in your own app if you need to.

## Linking products to your domain objects

A line item normally references an existing product by `productId`. It can instead reference one of your own domain objects (an experience, course, plan, …) via `source`, and the kit find-or-creates the backing product for you — keyed on `(organization, sourceType, sourceId)`:

```jsonc
// reference a product directly
{ "productId": "…", "quantity": "1", "price": "5000", "taxIds": [] }

// reference your own object; product is created on first use
{ "source": { "type": "experience", "id": "42", "name": "Sunset Tour" },
  "quantity": "2", "price": "5000", "taxIds": [] }
```

Provide exactly one of `productId` / `source`. The product is created once (price defaults from the line item's minor units) and reused on later sales; the line item still carries its own `price` / `description`, so it remains the immutable snapshot of the sale. `Product` exposes the same `sourceType` / `sourceId` on create and read for catalog lookups.

## Testing

The `invoicing-kit/testing` entry point exports an in-memory adapter so you can exercise the full router without a database:

```ts
import { createInvoicingKit } from "invoicing-kit";
import { inMemoryAdapter } from "invoicing-kit/testing";

const kit = createInvoicingKit({ adapter: inMemoryAdapter(), auth, basePath: "/api/bills" });
```

## License

MIT © [Bitzer AI](https://github.com/Bitzer-AI)

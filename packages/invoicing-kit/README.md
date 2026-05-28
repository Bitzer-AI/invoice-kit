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

## License

MIT

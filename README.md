# invoicing-kit

Reusable invoicing API for Hono apps using better-auth — modeled on better-auth's extensibility patterns: bring your own data adapter.

**Status:** v0.1.0 — all three plans complete (foundation, domains/routes, CLI).

## Packages

- [`invoicing-kit`](./packages/invoicing-kit/) — core package: domain types, repository interfaces, default Prisma adapter, in-memory test adapter, full HTTP API with 7 domains (clients, products, taxes, payment-methods, quotes, invoices, payments), `createInvoicingKit` factory, and auth middleware.
- [`@invoicing-kit/cli`](./packages/cli/) — schema generator CLI. Writes the default adapter's Prisma model files into your project.

## Quick start

```bash
# 1. Install
npm install invoicing-kit
npm install --save-dev @invoicing-kit/cli

# 2. Generate the Prisma models into your project
npx invoicing-kit generate

# 3. Wire the models into your schema.prisma, then push them
npx prisma db push
```

```ts
import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { createInvoicingKit, prismaAdapter } from "invoicing-kit";
import { auth } from "./auth"; // your better-auth instance (with organization plugin)

const prisma = new PrismaClient();
const kit = createInvoicingKit({
  adapter: prismaAdapter(prisma),
  auth,
  basePath: "/api/bills",
});

const app = new Hono();
app.route("/", kit.router);

export default app;
```

## Tax rates

Tax `rate` is a **decimal string**, and its meaning depends on `type`:

- `PERCENTAGE` — a **fraction**: `"0.1800"` = 18%. Passing `"18"` means **1800%**. The API rejects a `PERCENTAGE` rate `>= 1` as a likely mistake.
- `FIXED` — **minor units**: `"50"` = 50 cents per unit.

## Design docs

See [`docs/superpowers/specs/`](./docs/superpowers/specs/) for design specs and [`docs/superpowers/plans/`](./docs/superpowers/plans/) for implementation plans.

## Releasing

See [`RELEASING.md`](./RELEASING.md) for the release process. TL;DR: bump versions in both `packages/*/package.json`, push, then create a GitHub Release with tag `vX.Y.Z` — the `Publish` workflow handles the rest.

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

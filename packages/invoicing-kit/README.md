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

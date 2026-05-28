# invoicing-kit

Reusable invoicing API for Hono apps using better-auth — modeled on better-auth's extensibility patterns: bring your own data adapter.

**Status:** v0 in development.

## Packages

- [`invoicing-kit`](./packages/invoicing-kit/) — core package: domain types, repository interfaces, default Prisma adapter, in-memory test adapter. **Plan 2 complete:** ships full HTTP API with 7 domains (clients, products, taxes, payment-methods, quotes, invoices, payments), `createInvoicingKit` factory, and auth middleware.
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

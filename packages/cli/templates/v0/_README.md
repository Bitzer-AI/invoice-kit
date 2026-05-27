# invoicing-kit Prisma schema templates (v0)

These `.prisma` files define the database models the default Prisma adapter expects.

When consumers run `npx @invoicing-kit/cli generate`, these files are
written into their project's `prisma/models/` folder. They reference the
**better-auth `User` and `Organization` models by string FK** — the consumer's
root `schema.prisma` must declare those models with the standard better-auth
shape, otherwise `prisma migrate` will fail validation.

See the [design spec](../../../docs/superpowers/specs/2026-05-27-invoicing-kit-design.md)
for the full architecture.

# @invoicing-kit/cli

Schema generator for [invoicing-kit](../invoicing-kit)'s default Prisma adapter.

## Install

```bash
npm install --save-dev @invoicing-kit/cli
# or
bun add --dev @invoicing-kit/cli
```

## Usage

Generate the Prisma model files into your project:

```bash
npx invoicing-kit generate
```

This writes four `.prisma` files into `./prisma/models/`:

- `client.prisma`
- `invoicing.prisma`
- `payment.prisma`
- `product.prisma`

Then push the schema with your normal Prisma workflow:

```bash
npx prisma migrate dev
# or, in early dev:
npx prisma db push
```

### Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--out <dir>` | `prisma/models` | Output directory, resolved against the current working directory. |
| `--dry-run` | `false` | Print what would be written without touching the filesystem. |
| `--force` | `false` | Overwrite existing files. Without it, existing files are skipped. |

### Examples

```bash
# Preview before writing
npx invoicing-kit generate --dry-run

# Custom output directory
npx invoicing-kit generate --out db/prisma/invoicing

# Re-sync after upgrading the package
npx invoicing-kit generate --force
```

## Constraints

- The CLI never edits your root `schema.prisma`. You wire the generated models into it via Prisma's [multi-file schema support](https://www.prisma.io/docs/orm/prisma-schema/overview/location#multi-file-prisma-schema).
- The generated models reference better-auth's `User` and `Organization` models by FK. Your `schema.prisma` must declare those with the standard better-auth shape, or `prisma migrate` will fail validation.
- No migration SQL is generated. Use `prisma migrate diff` per your own workflow.

## License

MIT

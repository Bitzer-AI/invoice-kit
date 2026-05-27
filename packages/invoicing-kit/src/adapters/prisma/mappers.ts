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

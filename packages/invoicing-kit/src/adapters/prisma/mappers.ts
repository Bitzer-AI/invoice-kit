// Row → domain DTO mappers for the Prisma adapter.
// Each mapper converts Prisma's generated row shape into the package's plain TS types.
//
// Conventions:
// - Prisma `Decimal` → `string` (via `.toString()`).
// - Prisma `BigInt` → `bigint` (already correct, just narrow).
// - `Json` → `unknown`.

import type { Client, Product, Tax, TaxType } from "../../types";

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

export function productRowToDomain(row: any): Product {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    price: row.price.toFixed(2), // Prisma Decimal -> string, preserve 2dp from Decimal(10,2) column
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function taxRowToDomain(row: any): Tax {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    type: row.type as TaxType,
    rate: row.rate.toFixed(4), // Decimal(10,4); preserve trailing zeros
    isActive: row.isActive,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

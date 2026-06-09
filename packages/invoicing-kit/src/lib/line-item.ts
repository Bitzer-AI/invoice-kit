// Shared line-item input schema + product resolution for invoices and quotes.
//
// A line item references a product in one of two ways:
//   1. `productId` — an existing product, the original behavior.
//   2. `source`    — a host-app domain object (e.g. an experience). The product
//      is found-or-created on the fly, keyed on (org, sourceType, sourceId), so
//      callers never have to pre-create a product for each sellable object.
//
// The line item still carries its own `price`/`description`, so it remains the
// immutable snapshot of the sale — the resolved product is only a catalog anchor.

import { z } from "zod";
import type { Repositories } from "../adapters/types";

export const lineItemSourceSchema = z.object({
  /** Opaque app-defined kind, e.g. "experience". */
  type: z.string().min(1).max(255),
  /** Id of the source object, as a string. */
  id: z.string().min(1).max(255),
  /** Product name to use when the product is created for the first time. */
  name: z.string().min(1).max(255),
});
export type LineItemSourceInput = z.infer<typeof lineItemSourceSchema>;

export const lineItemSchema = z
  .object({
    productId: z.string().optional(),
    source: lineItemSourceSchema.optional(),
    quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid quantity"),
    price: z.string().regex(/^\d+$/, "Price must be integer minor units"), // BigInt as string in body
    description: z.string().optional().nullable(),
    /** Opaque per-line app metadata (e.g. booking intent). Persisted as JSON. */
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
    taxIds: z.array(z.string()).default([]),
  })
  .refine((lineItem) => (lineItem.productId == null) !== (lineItem.source == null), {
    message: "Provide exactly one of productId or source",
  });
export type LineItemInput = z.infer<typeof lineItemSchema>;

/** Converts integer minor units (e.g. cents) to a Decimal(10,2) string: 5000n -> "50.00". */
export function minorUnitsToDecimalString(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const s = `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

/**
 * Resolves a line item to a concrete productId, find-or-creating a source-linked
 * product when `source` is supplied. Must be called with the transaction-scoped
 * repositories so the product and document are created atomically.
 */
export async function resolveLineItemProductId(
  repos: Repositories,
  organizationId: string,
  li: Pick<LineItemInput, "productId" | "source" | "price" | "description">,
): Promise<string> {
  if (li.productId) return li.productId;
  // `source` is guaranteed present by the schema's exactly-one refinement.
  const { type, id, name } = li.source!;
  const existing = await repos.products.findBySource(organizationId, type, id);
  if (existing) return existing.id;
  const created = await repos.products.create({
    organizationId,
    name,
    description: null,
    price: minorUnitsToDecimalString(BigInt(li.price)),
    sourceType: type,
    sourceId: id,
  });
  return created.id;
}

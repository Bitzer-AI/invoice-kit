import type { DocumentWithRelations, NewDocumentLineItem, Repositories } from "../adapters/types";
import type { DecimalString, DocumentSide, MoneyPolicy } from "../types";
import { normalizeCurrency } from "./currency";
import { resolveLineItemProduct, type LineItemInput } from "./line-item";
import { calculateDocument, type AmountTotals, type TaxDefinition } from "./money";

export type DocumentLineInput = Pick<
  LineItemInput,
  "productId" | "source" | "quantity" | "price" | "description" | "metadata" | "taxIds"
>;

/** A line already stored on a document: its product was resolved and validated when the line was written. */
export interface StoredLineInput extends Omit<DocumentLineInput, "productId" | "source"> {
  productId: string;
  stored: true;
}

export type BuildLineInput = DocumentLineInput | StoredLineInput;

const isStoredLine = (lineItem: BuildLineInput): lineItem is StoredLineInput => "stored" in lineItem;

export interface BuiltDocumentLines {
  lineItems: NewDocumentLineItem[];
  totals: AmountTotals;
  base: AmountTotals | null;
}

const unique = (values: readonly string[]) => [...new Set(values)];

/** Each line's tax definitions, loaded in one query; a line's repeated ids count once, unknown ids are skipped. */
export async function loadLineTaxes(
  repos: Repositories,
  organizationId: string,
  lineTaxIds: readonly (readonly string[])[],
): Promise<TaxDefinition[][]> {
  const taxIds = unique(lineTaxIds.flat());
  const taxes = taxIds.length > 0 ? await repos.taxes.findManyById(taxIds, organizationId) : [];
  const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
  return lineTaxIds.map((ids) =>
    unique(ids).flatMap((id) => {
      const tax = taxById.get(id);
      return tax ? [{ id: tax.id, type: tax.type, rate: tax.rate }] : [];
    }),
  );
}

/**
 * Resolves each request line's product (a stored line keeps its product as-is),
 * loads the taxes and computes every amount with `calculateDocument` under
 * `policy` (and `exchangeRate` when given). The only place document services
 * turn lines into stored lines.
 */
export async function buildDocumentLines(args: {
  repos: Repositories;
  organizationId: string;
  currency: string;
  side: DocumentSide;
  lineItems: readonly BuildLineInput[];
  policy: MoneyPolicy;
  exchangeRate: DecimalString | null;
}): Promise<BuiltDocumentLines> {
  const currency = normalizeCurrency(args.currency);
  const productIds: string[] = [];
  for (const lineItem of args.lineItems) {
    productIds.push(
      isStoredLine(lineItem)
        ? lineItem.productId
        : (await resolveLineItemProduct(args.repos, args.organizationId, lineItem, currency, args.side)).id,
    );
  }

  const lineTaxes = await loadLineTaxes(
    args.repos,
    args.organizationId,
    args.lineItems.map((lineItem) => lineItem.taxIds),
  );
  const calculation = calculateDocument({
    policy: args.policy,
    exchangeRate: args.exchangeRate,
    lines: args.lineItems.map((lineItem, index) => ({
      quantity: lineItem.quantity,
      price: BigInt(lineItem.price),
      taxes: lineTaxes[index]!,
    })),
  });

  const lineItems: NewDocumentLineItem[] = args.lineItems.map((lineItem, index) => {
    const line = calculation.lines[index]!;
    return {
      productId: productIds[index]!,
      quantity: lineItem.quantity,
      price: BigInt(lineItem.price),
      currency,
      description: lineItem.description ?? null,
      metadata: lineItem.metadata ?? null,
      taxes: line.taxes.map((tax) => ({ taxId: tax.taxId, taxAmount: tax.taxAmount, baseTaxAmount: tax.baseTaxAmount })),
      taxAmount: line.taxAmount,
      total: line.total,
      baseSubtotal: line.baseSubtotal,
    };
  });

  return {
    lineItems,
    totals: { subtotal: calculation.subtotal, tax: calculation.tax, total: calculation.total },
    base: calculation.base,
  };
}

/** Stored lines back as builder inputs, for recomputing a document without a new line list. */
export function lineInputsOf(document: DocumentWithRelations): StoredLineInput[] {
  return document.lineItems.map((lineItem) => ({
    stored: true,
    productId: lineItem.productId,
    quantity: lineItem.quantity,
    price: lineItem.price.toString(),
    description: lineItem.description,
    metadata: lineItem.metadata,
    taxIds: lineItem.taxes.map((tax) => tax.taxId),
  }));
}

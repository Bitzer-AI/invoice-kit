import type { BigintMinor, DecimalString } from "../types";

export interface LineComputeInput {
  quantity: DecimalString;
  price: BigintMinor;
  /** Sum of all per-line taxes (caller computes via TaxStrategy). */
  taxAmount: BigintMinor;
}

export interface LineComputeResult {
  /** Pre-tax line value: quantity × price, floor-rounded. */
  subtotal: BigintMinor;
  /** subtotal + taxAmount. */
  total: BigintMinor;
}

export interface DocumentTotalsInput {
  subtotal: BigintMinor;
  taxAmount: BigintMinor;
  total: BigintMinor;
}

export interface DocumentTotalsResult {
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
}

export class DocumentCalculator {
  lineTotal(input: LineComputeInput): LineComputeResult {
    const qStr = input.quantity;
    const [whole, fracRaw = ""] = qStr.split(".");
    const frac = (fracRaw + "0000").slice(0, 4);
    const scaledQty = BigInt((whole ?? "0") + frac); // quantity × 10^4
    const subtotal = (scaledQty * input.price) / 10000n;
    return { subtotal, total: subtotal + input.taxAmount };
  }

  documentTotals(lines: DocumentTotalsInput[]): DocumentTotalsResult {
    let subtotal = 0n;
    let tax = 0n;
    let total = 0n;
    for (const l of lines) {
      subtotal += l.subtotal;
      tax += l.taxAmount;
      total += l.total;
    }
    return { subtotal, tax, total };
  }
}

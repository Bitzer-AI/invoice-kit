import type { Repositories } from "../adapters/types";
import type { BigintMinor, DecimalString } from "../types";
import { TaxType } from "../types";
import { DocumentCalculator } from "./calculator";

export interface ComputeForLineInput {
  quantity: DecimalString;
  price: BigintMinor;
  taxIds: string[];
}

export interface ComputeForLineResult {
  taxAmount: BigintMinor;
  perTax: Array<{ taxId: string; taxAmount: BigintMinor }>;
}

export class TaxStrategy {
  private readonly calc = new DocumentCalculator();

  async computeForLine(
    repos: Repositories,
    organizationId: string,
    input: ComputeForLineInput,
  ): Promise<ComputeForLineResult> {
    if (input.taxIds.length === 0) {
      return { taxAmount: 0n, perTax: [] };
    }

    const taxes = await repos.taxes.findManyById(input.taxIds, organizationId);

    const { subtotal } = this.calc.lineTotal({
      quantity: input.quantity,
      price: input.price,
      taxAmount: 0n,
    });

    const perTax: Array<{ taxId: string; taxAmount: BigintMinor }> = [];
    let total = 0n;

    for (const tax of taxes) {
      let amt = 0n;

      if (tax.type === TaxType.Percentage) {
        // rate is a decimal string like "0.2100" (21%)
        // Parse it by removing the decimal point and treating it as a fraction
        const [whole, fracRaw = ""] = tax.rate.split(".");
        const frac = (fracRaw + "0000").slice(0, 4);
        const scaledRate = BigInt((whole ?? "0") + frac); // rate × 10^4
        // amt = subtotal × rate = (subtotal × scaledRate) / 10000
        amt = (subtotal * scaledRate) / 10000n;
      } else {
        // FIXED: rate is a string representing minor units (e.g., "50" = 50 cents)
        // Multiply by integer quantity (parsed from the quantity string)
        const rateMinor = BigInt(tax.rate.split(".")[0] ?? "0");
        const [whole, fracRaw = ""] = input.quantity.split(".");
        const frac = (fracRaw + "0000").slice(0, 4);
        const scaledQty = BigInt((whole ?? "0") + frac); // quantity × 10^4
        // amt = rate × quantity = (rateMinor × scaledQty) / 10000
        amt = (rateMinor * scaledQty) / 10000n;
      }

      perTax.push({ taxId: tax.id, taxAmount: amt });
      total += amt;
    }

    return { taxAmount: total, perTax };
  }
}

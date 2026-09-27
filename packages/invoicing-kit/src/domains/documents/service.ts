import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import { ExchangeRateSource } from "../../types";
import { DEFAULT_CURRENCY, normalizeCurrency } from "../../lib/currency";
import { loadLineTaxes } from "../../lib/document-lines";
import { manualRateBaseCurrency, providerBaseCurrency, resolveProviderRate } from "../../lib/exchange";
import { calculateDocument, canonicalDecimal } from "../../lib/money";
import type { MoneySettings } from "../../lib/money/settings";
import type { CalculateDocumentBody, CalculateDocumentResponse } from "./validation";

type PreviewExchange = { baseCurrency: string; rate: string; rateDate: string | null; source: ExchangeRateSource };

/** Stateless preview of a document's amounts under the organization's policy. Never writes; a missing rate means no base amounts. */
export class DocumentCalculationService {
  constructor(private readonly repos: Repositories, private readonly money: MoneySettings) {}

  private async previewExchange(body: CalculateDocumentBody, organizationId: string, currency: string): Promise<PreviewExchange | null> {
    // Mirrors the write path's precedence (resolveIssueExchange; a preview has no
    // referenced rate): manual first — and a
    // manual rate on a same-currency (or provider-less) document is rejected the same
    // way manualRateBaseCurrency rejects it for invoices, not silently downgraded to identity.
    if (body.exchangeRate) {
      const baseCurrency = await manualRateBaseCurrency(this.money, organizationId, currency);
      return { baseCurrency, rate: canonicalDecimal(body.exchangeRate), rateDate: body.issueDate ?? null, source: ExchangeRateSource.Manual };
    }
    const provider = this.money.exchangeRates;
    if (!provider) return null;
    const baseCurrency = await providerBaseCurrency(provider, organizationId);
    if (baseCurrency === currency) return { baseCurrency, rate: "1", rateDate: body.issueDate ?? null, source: ExchangeRateSource.Identity };
    if (!body.issueDate) return null;
    const rate = await resolveProviderRate(provider, { organizationId, from: currency, to: baseCurrency, date: new Date(body.issueDate) });
    return rate === null ? null : { baseCurrency, rate, rateDate: body.issueDate, source: ExchangeRateSource.Provider };
  }

  async calculate(body: CalculateDocumentBody, ctx: AuthContext): Promise<CalculateDocumentResponse> {
    const currency = normalizeCurrency(body.currency ?? DEFAULT_CURRENCY);
    const policy = await this.money.policyFor(ctx.organizationId);
    const exchange = await this.previewExchange(body, ctx.organizationId, currency);
    const lineTaxes = await loadLineTaxes(this.repos, ctx.organizationId, body.lineItems.map((line) => line.taxIds));
    const result = calculateDocument({
      policy,
      exchangeRate: exchange?.rate ?? null,
      lines: body.lineItems.map((line, index) => ({
        quantity: line.quantity,
        price: BigInt(line.price),
        taxes: lineTaxes[index]!,
      })),
    });
    const minor = (value: bigint | null) => (value === null ? null : value.toString());
    return {
      currency,
      subtotal: result.subtotal.toString(),
      tax: result.tax.toString(),
      total: result.total.toString(),
      lines: result.lines.map((line) => ({
        subtotal: line.subtotal.toString(),
        taxAmount: line.taxAmount.toString(),
        total: line.total.toString(),
        baseSubtotal: minor(line.baseSubtotal),
      })),
      taxTotals: result.taxTotals.map((total) => ({ taxId: total.taxId, amount: total.amount.toString(), baseAmount: minor(total.baseAmount) })),
      exchange,
      base: result.base
        ? { subtotal: result.base.subtotal.toString(), tax: result.base.tax.toString(), total: result.base.total.toString() }
        : null,
    };
  }
}

import { z } from "zod";
import type { ExchangeRateProvider } from "../config";
import type { DecimalString, Document } from "../types";
import { ExchangeRateSource } from "../types";
import { currencyCodeSchema, normalizeCurrency } from "./currency";
import { ErrorCode, httpError } from "./errors";
import { EXCHANGE_RATE_SCALE, canonicalDecimal, parseScaled } from "./money/decimal";
import type { MoneySettings } from "./money/settings";

/** Request-body exchange rate: positive, up to 10 integer digits and 8 decimals, stored canonical. */
export const exchangeRateSchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,8})?$/, "Up to 10 integer digits and 8 decimals")
  .refine((value) => {
    try {
      return parseScaled(value, EXCHANGE_RATE_SCALE) > 0n;
    } catch {
      return false;
    }
  }, "Must be greater than 0")
  .transform(canonicalDecimal);

export interface DocumentExchange {
  baseCurrency: string;
  rate: DecimalString;
  rateDate: Date;
  source: ExchangeRateSource;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const ExchangeRateRequiredException = (currency: string, date: Date) =>
  httpError({
    code: ErrorCode.ExchangeRateRequired,
    status: 422,
    message: `No exchange rate for ${currency} on ${isoDate(date)}; enter one or keep the document as a draft`,
  });

export const ExchangeRateNotApplicableException = (currency: string) =>
  httpError({
    code: ErrorCode.ExchangeRateNotApplicable,
    status: 422,
    message: `A ${currency} document takes no exchange rate (it is the base currency, or no exchange-rate provider is configured)`,
  });

export const ExchangeRateFrozenException = () =>
  httpError({
    code: ErrorCode.ExchangeRateFrozen,
    status: 422,
    message: "The exchange rate is frozen once a document is issued",
  });

export const DocumentCurrencyMismatchException = (currency: string, referencedCurrency: string) =>
  httpError({
    code: ErrorCode.DocumentCurrencyMismatch,
    status: 422,
    message: `A note must use its referenced document's currency (${referencedCurrency}), not ${currency}`,
  });

/** The provider's base currency, trimmed and lowercased. Anything but a 3-letter code is a provider contract violation. */
export async function providerBaseCurrency(provider: ExchangeRateProvider, organizationId: string): Promise<string> {
  const returned: unknown = await provider.baseCurrency({ organizationId });
  const parsed = currencyCodeSchema.safeParse(typeof returned === "string" ? returned.trim() : returned);
  if (!parsed.success) {
    throw new Error(`invoicing-kit: exchangeRates.baseCurrency returned an invalid currency code: ${JSON.stringify(returned)}`);
  }
  return parsed.data;
}

function scaledRate(value: string): bigint | null {
  try {
    return parseScaled(value, EXCHANGE_RATE_SCALE);
  } catch {
    return null;
  }
}

/**
 * The provider's rate for `from` → `to` on `date`, canonical. Null when it knows
 * none (null, or a rate ≤ 0). A malformed rate, or one with more than 8 decimals,
 * is a provider contract violation and throws a RangeError.
 */
export async function resolveProviderRate(
  provider: ExchangeRateProvider,
  query: { organizationId: string; from: string; to: string; date: Date },
): Promise<DecimalString | null> {
  const resolved: unknown = await provider.resolve(query);
  if (resolved === null) return null;
  const scaled = typeof resolved === "string" ? scaledRate(resolved) : null;
  if (typeof resolved !== "string" || scaled === null) {
    throw new RangeError(
      `invoicing-kit: exchangeRates.resolve returned an invalid rate for ${query.from}→${query.to} on ${isoDate(query.date)}: ${JSON.stringify(resolved)} (expected a decimal string with at most 8 decimals, or null)`,
    );
  }
  return scaled > 0n ? canonicalDecimal(resolved) : null;
}

/** The base currency a manual rate converts into. Throws NOT_APPLICABLE without a provider or for base-currency documents. */
export async function manualRateBaseCurrency(
  money: MoneySettings,
  organizationId: string,
  currency: string,
): Promise<string> {
  const normalized = normalizeCurrency(currency);
  if (!money.exchangeRates) throw ExchangeRateNotApplicableException(normalized);
  const baseCurrency = await providerBaseCurrency(money.exchangeRates, organizationId);
  if (baseCurrency === normalized) throw ExchangeRateNotApplicableException(normalized);
  return baseCurrency;
}

/** The frozen exchange stored on a document, or null. */
export function exchangeOf(document: Document): DocumentExchange | null {
  if (
    document.exchangeRate === null ||
    document.baseCurrency === null ||
    document.exchangeRateDate === null ||
    document.exchangeRateSource === null
  ) {
    return null;
  }
  return {
    baseCurrency: document.baseCurrency,
    rate: document.exchangeRate,
    rateDate: document.exchangeRateDate,
    source: document.exchangeRateSource,
  };
}

/**
 * The exchange a document is issued at. Precedence: referenced (a note inherits
 * its reference's frozen rate), manual, identity, provider. Null when the kit has
 * no provider (feature off).
 */
export async function resolveIssueExchange(args: {
  money: MoneySettings;
  organizationId: string;
  currency: string;
  issueDate: Date;
  manualRate: DecimalString | null;
  referenced: DocumentExchange | null;
}): Promise<DocumentExchange | null> {
  const provider = args.money.exchangeRates;
  if (!provider) return null;
  if (args.referenced !== null) return { ...args.referenced, source: ExchangeRateSource.Referenced };
  const currency = normalizeCurrency(args.currency);
  const baseCurrency = await providerBaseCurrency(provider, args.organizationId);
  if (args.manualRate !== null) {
    return { baseCurrency, rate: canonicalDecimal(args.manualRate), rateDate: args.issueDate, source: ExchangeRateSource.Manual };
  }
  if (currency === baseCurrency) {
    return { baseCurrency, rate: "1", rateDate: args.issueDate, source: ExchangeRateSource.Identity };
  }
  const rate = await resolveProviderRate(provider, {
    organizationId: args.organizationId,
    from: currency,
    to: baseCurrency,
    date: args.issueDate,
  });
  if (rate === null) throw ExchangeRateRequiredException(currency, args.issueDate);
  return { baseCurrency, rate, rateDate: args.issueDate, source: ExchangeRateSource.Provider };
}

import type { DecimalString } from "../../types";
import { currencyMinorUnitDigits } from "../../lib/currency";
import { atScale, fitsScale } from "../../lib/money/decimal";
import { ProductPricePrecisionInvalidException } from "./exceptions";

export const CATALOG_PRICE_PRECISION = 19;
export const CATALOG_PRICE_SCALE = 4;

export function catalogPriceInCurrency(price: DecimalString, currency: string): DecimalString {
  const digits = currencyMinorUnitDigits(currency);
  if (!fitsScale(price, digits)) throw ProductPricePrecisionInvalidException(currency, digits);
  return atScale(price, digits);
}

export function catalogCostInCurrency(cost: DecimalString | null, currency: string): DecimalString | null {
  return cost === null ? null : catalogPriceInCurrency(cost, currency);
}

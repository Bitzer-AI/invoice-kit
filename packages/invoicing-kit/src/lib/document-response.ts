import { z } from "zod";
import type { Document, DocumentLineItem, DocumentLineItemTax } from "../types";
import { BaseTaxMethod, ExchangeRateSource, RoundingMode, TaxLevel } from "../types";

const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const minor = (value: bigint | null) => (value !== null ? value.toString() : null);

export const documentMoneyResponseFields = {
  moneyPolicy: z
    .object({
      rounding: z.nativeEnum(RoundingMode),
      taxLevel: z.nativeEnum(TaxLevel),
      baseTaxMethod: z.nativeEnum(BaseTaxMethod),
    })
    .nullable(),
  baseCurrency: z.string().nullable(),
  exchangeRate: z.string().nullable(),
  exchangeRateDate: z.string().nullable(),
  exchangeRateSource: z.nativeEnum(ExchangeRateSource).nullable(),
  baseSubtotal: z.string().nullable(),
  baseTax: z.string().nullable(),
  baseTotal: z.string().nullable(),
};

export function documentMoneyToResponse(document: Document) {
  return {
    moneyPolicy: document.moneyPolicy,
    baseCurrency: document.baseCurrency,
    exchangeRate: document.exchangeRate,
    exchangeRateDate: isoDate(document.exchangeRateDate),
    exchangeRateSource: document.exchangeRateSource,
    baseSubtotal: minor(document.baseSubtotal),
    baseTax: minor(document.baseTax),
    baseTotal: minor(document.baseTotal),
  };
}

export const lineItemBaseResponseFields = { baseSubtotal: z.string().nullable() };
export const lineItemTaxBaseResponseFields = { baseTaxAmount: z.string().nullable() };

export function lineItemBaseToResponse(lineItem: Pick<DocumentLineItem, "baseSubtotal">) {
  return { baseSubtotal: minor(lineItem.baseSubtotal) };
}

export function lineItemTaxBaseToResponse(tax: Pick<DocumentLineItemTax, "baseTaxAmount">) {
  return { baseTaxAmount: minor(tax.baseTaxAmount) };
}

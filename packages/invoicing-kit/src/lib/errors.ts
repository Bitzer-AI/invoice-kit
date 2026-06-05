import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ErrorCode = {
  // Auth
  Unauthorized: "UNAUTHORIZED",
  NoActiveOrganization: "NO_ACTIVE_ORGANIZATION",
  Forbidden: "FORBIDDEN",

  // Validation
  ValidationFailed: "VALIDATION_FAILED",

  // Client
  ClientNotFound: "CLIENT_NOT_FOUND",

  // Product
  ProductNotFound: "PRODUCT_NOT_FOUND",

  // Tax
  TaxNotFound: "TAX_NOT_FOUND",

  // Payment Method
  PaymentMethodNotFound: "PAYMENT_METHOD_NOT_FOUND",

  // Document numbering / Invoice / Quote
  InvoiceNotFound: "INVOICE_NOT_FOUND",
  InvoiceNumberAlreadyExists: "INVOICE_NUMBER_ALREADY_EXISTS",
  QuoteNotFound: "QUOTE_NOT_FOUND",
  QuoteNumberAlreadyExists: "QUOTE_NUMBER_ALREADY_EXISTS",
  QuoteAlreadyConverted: "QUOTE_ALREADY_CONVERTED",
  InvoiceStatusTransitionInvalid: "INVOICE_STATUS_TRANSITION_INVALID",
  NextNumberTooLow: "NEXT_NUMBER_TOO_LOW",

  // Payment
  PaymentNotFound: "PAYMENT_NOT_FOUND",
  PaymentAmountExceedsInvoiceTotal: "PAYMENT_AMOUNT_EXCEEDS_INVOICE_TOTAL",
  PaymentInvoiceMismatch: "PAYMENT_INVOICE_MISMATCH",
} as const;

export type ErrorCodeKey = keyof typeof ErrorCode;
export type ErrorCodeValue = (typeof ErrorCode)[ErrorCodeKey];

interface ThrowArgs {
  code: ErrorCodeValue;
  status: ContentfulStatusCode;
  message: string;
}

export function httpError({ code, status, message }: ThrowArgs): HTTPException {
  return new HTTPException(status, { message: `${code}: ${message}` });
}

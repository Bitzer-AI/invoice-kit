import { httpError, ErrorCode } from "../../lib/errors";

export const PaymentNotFoundException = () =>
  httpError({ code: ErrorCode.PaymentNotFound, status: 404, message: "Payment not found" });

export const PaymentAmountExceedsInvoiceTotalException = () =>
  httpError({
    code: ErrorCode.PaymentAmountExceedsInvoiceTotal,
    status: 400,
    message: "Payment amount would exceed invoice total",
  });

export const PaymentCurrencyMismatchException = () =>
  httpError({
    code: ErrorCode.PaymentCurrencyMismatch,
    status: 422,
    message: "Payment currency must match the invoice currency",
  });

export const PaymentInvoiceNotIssuedException = () =>
  httpError({
    code: ErrorCode.PaymentInvoiceNotIssued,
    status: 409,
    message: "Only sent or partially paid invoices can receive payments",
  });

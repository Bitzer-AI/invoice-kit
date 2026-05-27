import { httpError, ErrorCode } from "../../lib/errors";

export const PaymentNotFoundException = () =>
  httpError({ code: ErrorCode.PaymentNotFound, status: 404, message: "Payment not found" });

export const PaymentAmountExceedsInvoiceTotalException = () =>
  httpError({
    code: ErrorCode.PaymentAmountExceedsInvoiceTotal,
    status: 400,
    message: "Payment amount would exceed invoice total",
  });

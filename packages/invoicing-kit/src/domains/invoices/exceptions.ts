import { httpError, ErrorCode } from "../../lib/errors";

export const InvoiceNotFoundException = () =>
  httpError({ code: ErrorCode.InvoiceNotFound, status: 404, message: "Invoice not found" });

export const InvoiceNumberAlreadyExistsException = () =>
  httpError({
    code: ErrorCode.InvoiceNumberAlreadyExists,
    status: 409,
    message: "An invoice with this number already exists",
  });

export const QuoteAlreadyConvertedException = () =>
  httpError({
    code: ErrorCode.QuoteAlreadyConverted,
    status: 409,
    message: "Quote has already been converted to an invoice",
  });

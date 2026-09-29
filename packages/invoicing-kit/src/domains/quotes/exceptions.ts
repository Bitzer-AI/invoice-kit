import { httpError, ErrorCode } from "../../lib/errors";

export const QuoteNotFoundException = () =>
  httpError({ code: ErrorCode.QuoteNotFound, status: 404, message: "Quote not found" });

export const QuoteAlreadyConvertedException = () =>
  httpError({
    code: ErrorCode.QuoteAlreadyConverted,
    status: 409,
    message: "Converted quotes cannot be modified",
  });

export const QuoteNotAcceptedException = () =>
  httpError({
    code: ErrorCode.QuoteNotAccepted,
    status: 409,
    message: "Only accepted quotes can be converted to invoices",
  });

export const QuoteStatusConflictException = () =>
  httpError({
    code: ErrorCode.QuoteStatusConflict,
    status: 409,
    message: "Quote changed while the operation was in progress",
  });

export const QuoteNumberAlreadyExistsException = () =>
  httpError({
    code: ErrorCode.QuoteNumberAlreadyExists,
    status: 409,
    message: "A quote with this number already exists",
  });

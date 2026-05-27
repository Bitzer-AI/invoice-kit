import { httpError, ErrorCode } from "../../lib/errors";

export const QuoteNotFoundException = () =>
  httpError({ code: ErrorCode.QuoteNotFound, status: 404, message: "Quote not found" });

export const QuoteNumberAlreadyExistsException = () =>
  httpError({
    code: ErrorCode.QuoteNumberAlreadyExists,
    status: 409,
    message: "A quote with this number already exists",
  });

import { httpError, ErrorCode } from "../../lib/errors";

export const PaymentMethodNotFoundException = () =>
  httpError({
    code: ErrorCode.PaymentMethodNotFound,
    status: 404,
    message: "Payment method not found",
  });

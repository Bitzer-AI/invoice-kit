import { httpError, ErrorCode } from "../../lib/errors";

export const VendorBillPaymentNotFoundException = () =>
  httpError({ code: ErrorCode.VendorBillPaymentNotFound, status: 404, message: "Vendor bill payment not found" });

export const VendorBillPaymentExceedsTotalException = () =>
  httpError({
    code: ErrorCode.VendorBillPaymentExceedsTotal,
    status: 400,
    message: "Vendor bill payment would exceed the bill total",
  });

import { httpError, ErrorCode } from "../../lib/errors";

export const VendorNotFoundException = () =>
  httpError({ code: ErrorCode.VendorNotFound, status: 404, message: "Vendor not found" });

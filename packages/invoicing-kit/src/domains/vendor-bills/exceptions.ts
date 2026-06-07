import { httpError, ErrorCode } from "../../lib/errors";

export const VendorBillNotFoundException = () =>
  httpError({ code: ErrorCode.VendorBillNotFound, status: 404, message: "Vendor bill not found" });

export const DocumentPartyInvalidException = (message: string) =>
  httpError({ code: ErrorCode.DocumentPartyInvalid, status: 400, message });

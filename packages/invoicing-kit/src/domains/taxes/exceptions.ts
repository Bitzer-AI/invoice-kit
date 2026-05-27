import { httpError, ErrorCode } from "../../lib/errors";

export const TaxNotFoundException = () =>
  httpError({ code: ErrorCode.TaxNotFound, status: 404, message: "Tax not found" });

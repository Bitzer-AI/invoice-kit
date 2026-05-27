import { httpError, ErrorCode } from "../../lib/errors";

export const ClientNotFoundException = () =>
  httpError({ code: ErrorCode.ClientNotFound, status: 404, message: "Client not found" });

import { httpError, ErrorCode } from "../../lib/errors";

export const ProductNotFoundException = () =>
  httpError({ code: ErrorCode.ProductNotFound, status: 404, message: "Product not found" });

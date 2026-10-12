import { httpError, ErrorCode } from "../../lib/errors";

export const ProductNotFoundException = () =>
  httpError({ code: ErrorCode.ProductNotFound, status: 404, message: "Product not found" });

export const ProductPricePrecisionInvalidException = (currency: string, digits: number) =>
  httpError({
    code: ErrorCode.ProductPricePrecisionInvalid,
    status: 422,
    message: `A price or cost in ${currency} has at most ${digits} decimals`,
  });

import { httpError, ErrorCode } from "../../lib/errors";

export const NextNumberTooLowException = (max: number) =>
  httpError({
    code: ErrorCode.NextNumberTooLow,
    status: 400,
    message: `nextNumber must be greater than the last issued number (${max}).`,
  });

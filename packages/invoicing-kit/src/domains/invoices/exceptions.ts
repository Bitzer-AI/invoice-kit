import { HTTPException } from "hono/http-exception";
import { httpError, ErrorCode } from "../../lib/errors";

export const InvoiceNotFoundException = () =>
  httpError({ code: ErrorCode.InvoiceNotFound, status: 404, message: "Invoice not found" });

export const InvoiceNumberAlreadyExistsException = () =>
  httpError({
    code: ErrorCode.InvoiceNumberAlreadyExists,
    status: 409,
    message: "An invoice with this number already exists",
  });

export class InvoiceNotDraftError extends HTTPException {
  readonly code = ErrorCode.InvoiceStatusTransitionInvalid;

  constructor() {
    super(409, { message: `${ErrorCode.InvoiceStatusTransitionInvalid}: Only draft invoices can be edited or deleted` });
  }
}

export class InvoiceIssueConflictError extends HTTPException {
  readonly code = ErrorCode.InvoiceStatusTransitionInvalid;

  constructor() {
    super(409, { message: `${ErrorCode.InvoiceStatusTransitionInvalid}: Invoice issuance was already claimed` });
  }
}

export class InvoiceDraftConflictError extends HTTPException {
  readonly code = ErrorCode.InvoiceStatusTransitionInvalid;

  constructor() {
    super(409, { message: `${ErrorCode.InvoiceStatusTransitionInvalid}: Draft invoice changed while editing` });
  }
}

export class InvoiceCannotBeVoidedError extends HTTPException {
  readonly code = ErrorCode.InvoiceStatusTransitionInvalid;

  constructor() {
    super(409, {
      message: `${ErrorCode.InvoiceStatusTransitionInvalid}: Only sent invoices can be voided`,
    });
  }
}

export class InvoiceHasPaymentsError extends HTTPException {
  readonly code = ErrorCode.InvoiceHasPayments;

  constructor() {
    super(409, { message: `${ErrorCode.InvoiceHasPayments}: Reverse invoice payments before voiding` });
  }
}

export class InvoiceHasCreditNoteError extends HTTPException {
  readonly code = ErrorCode.InvoiceHasCreditNote;

  constructor() {
    super(409, { message: `${ErrorCode.InvoiceHasCreditNote}: Invoice already has a credit note` });
  }
}

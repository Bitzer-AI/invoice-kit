import { HTTPException } from "hono/http-exception";
import { httpError, ErrorCode } from "../../lib/errors";
import { DocumentPartyInvalidException } from "../vendor-bills/exceptions";

export { DocumentPartyInvalidException };

export const NoteNotFoundException = () =>
  httpError({ code: ErrorCode.NoteNotFound, status: 404, message: "Note not found" });

export class NoteNotDraftError extends HTTPException {
  readonly code = ErrorCode.NoteNotDraft;

  constructor() {
    super(409, { message: `${ErrorCode.NoteNotDraft}: Only draft notes can be edited or deleted` });
  }
}

export class NotePartyMismatchError extends HTTPException {
  readonly code = ErrorCode.NotePartyMismatch;

  constructor() {
    super(409, { message: `${ErrorCode.NotePartyMismatch}: The note party must match the referenced document` });
  }
}

export class NoteCurrencyMismatchError extends HTTPException {
  readonly code = ErrorCode.NoteCurrencyMismatch;

  constructor() {
    super(409, { message: `${ErrorCode.NoteCurrencyMismatch}: The note currency must match the referenced document` });
  }
}

export class NoteReferencedInvoiceNotIssuedError extends HTTPException {
  readonly code = ErrorCode.NoteReferencedInvoiceNotIssued;

  constructor() {
    super(409, {
      message: `${ErrorCode.NoteReferencedInvoiceNotIssued}: A note requires an active issued invoice`,
    });
  }
}

export const NoteReferencedDocumentNotFoundException = () =>
  httpError({
    code: ErrorCode.NoteReferencedDocumentNotFound,
    status: 404,
    message: "Referenced document not found",
  });

export const NoteReferencesNoteException = () =>
  httpError({
    code: ErrorCode.NoteReferencesNote,
    status: 400,
    message: "A note cannot reference another note",
  });

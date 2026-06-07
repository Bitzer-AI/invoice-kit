import { httpError, ErrorCode } from "../../lib/errors";
import { DocumentPartyInvalidException } from "../vendor-bills/exceptions";

export { DocumentPartyInvalidException };

export const NoteNotFoundException = () =>
  httpError({ code: ErrorCode.NoteNotFound, status: 404, message: "Note not found" });

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

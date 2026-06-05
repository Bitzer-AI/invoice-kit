import type { DocumentNumberSequence } from "../../types";
import type { SequenceResponse } from "./validation";

export function toSequenceView(row: DocumentNumberSequence): SequenceResponse {
  return {
    documentType: row.documentType,
    prefix: row.prefix,
    nextNumber: row.nextNumber,
    padWidth: row.padWidth,
  };
}

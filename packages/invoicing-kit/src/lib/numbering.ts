import type { Repositories } from "../adapters/types";
import type { AssignedDocumentNumber, DocumentType } from "../types";
import { BillingDocumentInvariantError } from "./errors";

export const DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH = 8;

export function requireDocumentNumber(number: number | null): number {
  if (number === null) {
    throw new BillingDocumentInvariantError("A numbered billing document has no document number");
  }
  return number;
}

export function requireDocumentNumberPadWidth(padWidth: number | null): number {
  if (padWidth === null) {
    throw new BillingDocumentInvariantError("A numbered billing document has no number pad width");
  }
  return padWidth;
}

export class DocumentNumberingService {
  async next(
    repos: Repositories,
    organizationId: string,
    documentType: DocumentType,
    prefix: string | null,
  ): Promise<AssignedDocumentNumber> {
    await repos.documentSequences.ensure({ organizationId, documentType, prefix });
    return repos.documentSequences.incrementAndGet({ organizationId, documentType, prefix });
  }

  async padWidthFor(
    repos: Repositories,
    organizationId: string,
    documentType: DocumentType,
    prefix: string | null,
  ): Promise<number> {
    const series = await repos.documentSequences.find({ organizationId, documentType, prefix });
    return series?.padWidth ?? DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH;
  }
}

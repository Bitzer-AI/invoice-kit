import type { Repositories } from "../adapters/types";
import type { DocumentType } from "../types";

export class DocumentNumberingService {
  async next(
    repos: Repositories,
    organizationId: string,
    documentType: DocumentType,
    prefix: string | null,
  ): Promise<number> {
    await repos.documentSequences.ensure({ organizationId, documentType, prefix });
    return repos.documentSequences.incrementAndGet({ organizationId, documentType });
  }
}

/** Honors an explicit body prefix (null/string); falls back to the configured sequence prefix only when omitted. */
export async function resolveDocumentPrefix(
  repos: Repositories,
  organizationId: string,
  documentType: DocumentType,
  bodyPrefix: string | null | undefined,
): Promise<string | null> {
  if (bodyPrefix !== undefined) return bodyPrefix;
  const row = await repos.documentSequences.find({ organizationId, documentType });
  return row?.prefix ?? null;
}

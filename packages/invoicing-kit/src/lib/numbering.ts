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
    return repos.documentSequences.incrementAndGet({ organizationId, documentType, prefix });
  }
}

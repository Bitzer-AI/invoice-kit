import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { DocumentType } from "../../types";
import type { SequenceResponse, UpsertSequenceBody } from "./validation";
import { toSequenceView } from "./mappers";
import { NextNumberTooLowException } from "./exceptions";

export class NumberingService {
  constructor(private readonly repos: Repositories) {}

  async get(documentType: DocumentType, ctx: AuthContext): Promise<SequenceResponse> {
    const row = await this.repos.documentSequences.find({
      organizationId: ctx.organizationId,
      documentType,
    });
    if (row) return toSequenceView(row);
    const max = await this.repos.documentSequences.maxIssuedNumber({
      organizationId: ctx.organizationId,
      documentType,
    });
    return { documentType, prefix: null, nextNumber: (max ?? 0) + 1, padWidth: null };
  }

  async upsert(body: UpsertSequenceBody, ctx: AuthContext): Promise<SequenceResponse> {
    return this.repos.tx(async (tx) => {
      const max = await tx.documentSequences.maxIssuedNumber({
        organizationId: ctx.organizationId,
        documentType: body.documentType,
      });
      if (max !== null && body.nextNumber <= max) {
        throw NextNumberTooLowException(max);
      }
      const row = await tx.documentSequences.upsert({
        organizationId: ctx.organizationId,
        documentType: body.documentType,
        prefix: body.prefix ?? null,
        nextNumber: body.nextNumber,
        padWidth: body.padWidth ?? null,
      });
      return toSequenceView(row);
    });
  }
}

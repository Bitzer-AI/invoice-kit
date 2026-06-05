import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { DocumentType } from "../../types";
import type { SequenceResponse, UpsertSequenceBody } from "./validation";
import { toSequenceView } from "./mappers";
import { NextNumberTooLowException } from "./exceptions";

export class NumberingService {
  constructor(private readonly repos: Repositories) {}

  async get(
    documentType: DocumentType,
    prefix: string | undefined,
    ctx: AuthContext,
  ): Promise<SequenceResponse> {
    const series = prefix ?? "";
    const row = await this.repos.documentSequences.find({
      organizationId: ctx.organizationId,
      documentType,
      prefix: series,
    });
    if (row) return toSequenceView(row);
    const max = await this.repos.documentSequences.maxIssuedNumber({
      organizationId: ctx.organizationId,
      documentType,
      prefix: series,
    });
    return { documentType, prefix: prefix ?? null, label: null, nextNumber: (max ?? 0) + 1, padWidth: null };
  }

  async list(documentType: DocumentType, ctx: AuthContext): Promise<SequenceResponse[]> {
    const rows = await this.repos.documentSequences.list({
      organizationId: ctx.organizationId,
      documentType,
    });
    return rows.map(toSequenceView);
  }

  async upsert(body: UpsertSequenceBody, ctx: AuthContext): Promise<SequenceResponse> {
    return this.repos.tx(async (tx) => {
      const max = await tx.documentSequences.maxIssuedNumber({
        organizationId: ctx.organizationId,
        documentType: body.documentType,
        prefix: body.prefix ?? null,
      });
      if (max !== null && body.nextNumber <= max) {
        throw NextNumberTooLowException(max);
      }
      const row = await tx.documentSequences.upsert({
        organizationId: ctx.organizationId,
        documentType: body.documentType,
        prefix: body.prefix ?? null,
        label: body.label ?? null,
        nextNumber: body.nextNumber,
        padWidth: body.padWidth ?? null,
      });
      return toSequenceView(row);
    });
  }
}

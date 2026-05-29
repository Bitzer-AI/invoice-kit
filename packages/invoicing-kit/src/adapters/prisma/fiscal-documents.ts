import type { FiscalDocument } from "../../types";
import type { FiscalDocumentRepository, FiscalDocumentUpdate, NewFiscalDocument } from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { fiscalDocumentRowToDomain } from "./mappers";

export function createPrismaFiscalDocumentRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): FiscalDocumentRepository {
  const db = (prisma as any)[modelNames.fiscalDocument];
  return {
    async upsertByInvoice(data: NewFiscalDocument): Promise<FiscalDocument> {
      const row = await db.upsert({
        where: { invoiceId: data.invoiceId },
        create: {
          invoiceId: data.invoiceId,
          provider: data.provider,
          status: data.status ?? "pending",
          documentType: data.documentType ?? null,
          fiscalId: data.fiscalId ?? null,
          trackId: data.trackId ?? null,
          securityCode: data.securityCode ?? null,
          qrUrl: data.qrUrl ?? null,
          message: data.message ?? null,
          payload: data.payload ?? null,
          issuedAt: data.issuedAt ?? null,
        },
        update: {
          provider: data.provider,
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.documentType !== undefined ? { documentType: data.documentType } : {}),
          ...(data.fiscalId !== undefined ? { fiscalId: data.fiscalId } : {}),
          ...(data.trackId !== undefined ? { trackId: data.trackId } : {}),
          ...(data.securityCode !== undefined ? { securityCode: data.securityCode } : {}),
          ...(data.qrUrl !== undefined ? { qrUrl: data.qrUrl } : {}),
          ...(data.message !== undefined ? { message: data.message } : {}),
          ...(data.payload !== undefined ? { payload: data.payload } : {}),
          ...(data.issuedAt !== undefined ? { issuedAt: data.issuedAt } : {}),
        },
      });
      return fiscalDocumentRowToDomain(row);
    },
    async findByInvoice(invoiceId: string) {
      const row = await db.findUnique({ where: { invoiceId } });
      return row ? fiscalDocumentRowToDomain(row) : null;
    },
    async update(invoiceId: string, patch: FiscalDocumentUpdate) {
      const row = await db.update({ where: { invoiceId }, data: patch });
      return fiscalDocumentRowToDomain(row);
    },
  };
}

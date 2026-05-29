import { randomUUID } from "node:crypto";
import type { FiscalDocument } from "../../types";
import type { FiscalDocumentRepository, FiscalDocumentUpdate, NewFiscalDocument } from "../types";
import type { MemoryStore } from "./store";

export function createInMemoryFiscalDocumentRepository(store: MemoryStore): FiscalDocumentRepository {
  const rows = store.fiscalDocuments;
  return {
    async upsertByInvoice(data: NewFiscalDocument): Promise<FiscalDocument> {
      const existing = rows.get(data.invoiceId);
      const now = new Date();
      const row: FiscalDocument = existing
        ? {
            ...existing,
            provider: data.provider,
            status: data.status ?? existing.status,
            documentType: data.documentType ?? existing.documentType,
            fiscalId: data.fiscalId ?? existing.fiscalId,
            trackId: data.trackId ?? existing.trackId,
            securityCode: data.securityCode ?? existing.securityCode,
            qrUrl: data.qrUrl ?? existing.qrUrl,
            message: data.message ?? existing.message,
            payload: data.payload ?? existing.payload,
            issuedAt: data.issuedAt ?? existing.issuedAt,
            updatedAt: now,
          }
        : {
            id: randomUUID(),
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
            createdAt: now,
            updatedAt: now,
          };
      rows.set(data.invoiceId, row);
      return row;
    },
    async findByInvoice(invoiceId) {
      return rows.get(invoiceId) ?? null;
    },
    async update(invoiceId, patch: FiscalDocumentUpdate) {
      const existing = rows.get(invoiceId);
      if (!existing) throw new Error("fiscal document not found");
      const row = { ...existing, ...patch, updatedAt: new Date() } as FiscalDocument;
      rows.set(invoiceId, row);
      return row;
    },
  };
}

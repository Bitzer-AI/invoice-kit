// src/adapters/memory/sequences.ts
import { randomUUID } from "node:crypto";
import type { DocumentNumberSequence, DocumentType } from "../../types";
import type { DocumentSequenceRepository } from "../types";
import type { MemoryStore } from "./store";

const series = (prefix: string | null | undefined): string => prefix ?? "";
type Key = `${string}:${DocumentType}:${string}`;
const key = (org: string, t: DocumentType, prefix: string | null | undefined): Key =>
  `${org}:${t}:${series(prefix)}`;

export function createInMemoryDocumentSequenceRepository(
  store: MemoryStore,
): DocumentSequenceRepository {
  const rows = store.documentSequences;

  return {
    async ensure({ organizationId, documentType, prefix }) {
      const k = key(organizationId, documentType, prefix);
      if (rows.has(k)) return;
      rows.set(k, {
        id: randomUUID(),
        organizationId,
        documentType,
        prefix: series(prefix),
        nextNumber: 1,
        padWidth: null,
        updatedAt: new Date(),
      });
    },
    async incrementAndGet({ organizationId, documentType, prefix }) {
      const k = key(organizationId, documentType, prefix);
      const row = rows.get(k);
      if (!row) throw new Error("sequence not initialized; call ensure() first");
      const value = row.nextNumber;
      rows.set(k, { ...row, nextNumber: row.nextNumber + 1, updatedAt: new Date() });
      return value;
    },
    async find({ organizationId, documentType, prefix }) {
      return rows.get(key(organizationId, documentType, prefix)) ?? null;
    },
    async list({ organizationId, documentType }) {
      const out: DocumentNumberSequence[] = [];
      for (const row of rows.values()) {
        if (row.organizationId === organizationId && row.documentType === documentType) {
          out.push(row);
        }
      }
      return out.sort((a, b) => (a.prefix ?? "").localeCompare(b.prefix ?? ""));
    },
    async upsert({ organizationId, documentType, prefix, nextNumber, padWidth }) {
      const k = key(organizationId, documentType, prefix);
      const existing = rows.get(k);
      const row: DocumentNumberSequence = {
        id: existing?.id ?? randomUUID(),
        organizationId,
        documentType,
        prefix: series(prefix),
        nextNumber,
        padWidth,
        updatedAt: new Date(),
      };
      rows.set(k, row);
      return row;
    },
    async maxIssuedNumber({ organizationId, documentType, prefix }) {
      const p = series(prefix);
      let max: number | null = null;
      for (const doc of store.documents.values()) {
        if (doc.organizationId !== organizationId || doc.type !== documentType) continue;
        const docSeries = doc.documentNumberPrefix ?? "";
        if (docSeries !== p) continue;
        if (max === null || doc.documentNumber > max) max = doc.documentNumber;
      }
      return max;
    },
  };
}

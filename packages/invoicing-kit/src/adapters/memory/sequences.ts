// src/adapters/memory/sequences.ts
import { randomUUID } from "node:crypto";
import type { DocumentNumberSequence, DocumentType } from "../../types";
import type { DocumentSequenceRepository } from "../types";

type Key = `${string}:${DocumentType}`;
const key = (org: string, t: DocumentType): Key => `${org}:${t}`;

export function createInMemoryDocumentSequenceRepository(): DocumentSequenceRepository {
  const rows = new Map<Key, DocumentNumberSequence>();

  return {
    async ensure({ organizationId, documentType, prefix }) {
      const k = key(organizationId, documentType);
      if (rows.has(k)) return;
      rows.set(k, {
        id: randomUUID(),
        organizationId,
        documentType,
        prefix: prefix ?? null,
        nextNumber: 1,
        updatedAt: new Date(),
      });
    },
    async incrementAndGet({ organizationId, documentType }) {
      const k = key(organizationId, documentType);
      const row = rows.get(k);
      if (!row) throw new Error("sequence not initialized; call ensure() first");
      const value = row.nextNumber;
      row.nextNumber += 1;
      row.updatedAt = new Date();
      return value;
    },
    async find({ organizationId, documentType }) {
      return rows.get(key(organizationId, documentType)) ?? null;
    },
  };
}

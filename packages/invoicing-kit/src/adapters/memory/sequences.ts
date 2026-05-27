// src/adapters/memory/sequences.ts
import { randomUUID } from "node:crypto";
import type { DocumentType } from "../../types";
import type { DocumentSequenceRepository } from "../types";
import type { MemoryStore } from "./store";

type Key = `${string}:${DocumentType}`;
const key = (org: string, t: DocumentType): Key => `${org}:${t}`;

export function createInMemoryDocumentSequenceRepository(
  store: MemoryStore,
): DocumentSequenceRepository {
  // documentSequences map uses Key (org:type) as key
  const rows = store.documentSequences as Map<string, import("../../types").DocumentNumberSequence>;

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
      rows.set(k, { ...row, nextNumber: row.nextNumber + 1, updatedAt: new Date() });
      return value;
    },
    async find({ organizationId, documentType }) {
      return rows.get(key(organizationId, documentType)) ?? null;
    },
  };
}

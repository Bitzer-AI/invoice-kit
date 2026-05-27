import { randomUUID } from "node:crypto";
import type { Tax } from "../../types";
import type {
  ListTaxesArgs,
  NewTax,
  TaxRepository,
  TaxUpdate,
} from "../types";
import type { MemoryStore } from "./store";

export function createInMemoryTaxRepository(store: MemoryStore): TaxRepository {
  const rows = store.taxes;

  const repo: TaxRepository = {
    async create(data: NewTax): Promise<Tax> {
      const now = new Date();
      const row: Tax = {
        id: randomUUID(),
        organizationId: data.organizationId,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        rate: data.rate,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },

    async findById(id: string, organizationId: string): Promise<Tax | null> {
      const row = rows.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },

    async findManyById(ids: string[], organizationId: string): Promise<Tax[]> {
      const idSet = new Set(ids);
      return Array.from(rows.values()).filter(
        (r) => idSet.has(r.id) && r.organizationId === organizationId,
      );
    },

    async list(args: ListTaxesArgs): Promise<Tax[]> {
      return Array.from(rows.values())
        .filter((r) => r.organizationId === args.organizationId)
        .filter((r) => (args.isActive !== undefined ? r.isActive === args.isActive : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async update(id: string, organizationId: string, patch: TaxUpdate): Promise<Tax> {
      const existing = await repo.findById(id, organizationId);
      if (!existing) throw new Error("tax not found");
      const updated: Tax = {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },

    async delete(id: string, organizationId: string): Promise<void> {
      const existing = await repo.findById(id, organizationId);
      if (!existing) return;
      rows.delete(id);
    },

    async clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void> {
      for (const [id, row] of rows) {
        if (row.organizationId === organizationId && row.id !== keepId) {
          rows.set(id, { ...row, isDefault: false, updatedAt: new Date() });
        }
      }
    },
  };

  return repo;
}

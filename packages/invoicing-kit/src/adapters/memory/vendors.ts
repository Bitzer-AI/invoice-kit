import { randomUUID } from "node:crypto";
import type { Vendor } from "../../types";
import type {
  ListVendorsArgs,
  NewVendor,
  Page,
  VendorRepository,
  VendorUpdate,
} from "../types";
import type { MemoryStore } from "./store";

export function createInMemoryVendorRepository(store: MemoryStore): VendorRepository {
  const rows = store.vendors;

  const repo: VendorRepository = {
    async create(data: NewVendor): Promise<Vendor> {
      const now = new Date();
      const row: Vendor = {
        id: randomUUID(),
        organizationId: data.organizationId,
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        taxId: data.taxId ?? null,
        taxIdType: data.taxIdType ?? null,
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },
    async findById(id, organizationId) {
      const row = rows.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    async list(args: ListVendorsArgs): Promise<Page<Vendor>> {
      const all = Array.from(rows.values())
        .filter((r) => r.organizationId === args.organizationId)
        .filter((r) =>
          args.query ? r.name.toLowerCase().includes(args.query.toLowerCase()) : true,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const totalCount = all.length;
      const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
      const data = all.slice((page - 1) * perPage, page * perPage);
      return { data, pageInfo: { page, perPage, totalCount, pageCount } };
    },
    async update(id, organizationId, patch: VendorUpdate) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) throw new Error("vendor not found");
      const updated: Vendor = { ...existing, ...patch, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },
    async delete(id, organizationId) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) return;
      rows.delete(id);
    },
  };
  return repo;
}

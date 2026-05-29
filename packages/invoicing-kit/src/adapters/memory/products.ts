import { randomUUID } from "node:crypto";
import type { Product } from "../../types";
import type {
  ListProductsArgs,
  NewProduct,
  Page,
  ProductRepository,
  ProductUpdate,
} from "../types";
import type { MemoryStore } from "./store";

export function createInMemoryProductRepository(store: MemoryStore): ProductRepository {
  const rows = store.products;

  const repo: ProductRepository = {
    async create(data: NewProduct): Promise<Product> {
      const now = new Date();
      const row: Product = {
        id: randomUUID(),
        organizationId: data.organizationId,
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        sourceType: data.sourceType ?? null,
        sourceId: data.sourceId ?? null,
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
    async findBySource(organizationId, sourceType, sourceId) {
      for (const row of rows.values()) {
        if (
          row.organizationId === organizationId &&
          row.sourceType === sourceType &&
          row.sourceId === sourceId
        ) {
          return row;
        }
      }
      return null;
    },
    async list(args: ListProductsArgs): Promise<Page<Product>> {
      const all = Array.from(rows.values())
        .filter((r) => r.organizationId === args.organizationId)
        .filter((r) =>
          args.query
            ? r.name.toLowerCase().includes(args.query.toLowerCase())
            : true,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const totalCount = all.length;
      const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
      const data = all.slice((page - 1) * perPage, page * perPage);
      return { data, pageInfo: { page, perPage, totalCount, pageCount } };
    },
    async update(id, organizationId, patch: ProductUpdate) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) throw new Error("product not found");
      const updated: Product = {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      };
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

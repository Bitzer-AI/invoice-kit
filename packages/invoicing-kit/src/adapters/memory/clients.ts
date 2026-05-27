import { randomUUID } from "node:crypto";
import type { Client } from "../../types";
import type {
  ClientRepository,
  ClientUpdate,
  ListClientsArgs,
  NewClient,
  Page,
} from "../types";

export function createInMemoryClientRepository(): ClientRepository {
  const rows = new Map<string, Client>();

  const repo: ClientRepository = {
    async create(data: NewClient): Promise<Client> {
      const now = new Date();
      const row: Client = {
        id: randomUUID(),
        organizationId: data.organizationId,
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        country: data.country ?? null,
        addressLine1: data.addressLine1 ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        postalCode: data.postalCode ?? null,
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
    async list(args: ListClientsArgs): Promise<Page<Client>> {
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
    async update(id, organizationId, patch: ClientUpdate) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) throw new Error("client not found");
      const updated: Client = {
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

import { randomUUID } from "node:crypto";
import type { VendorBill } from "../../types";
import type {
  ListVendorBillsArgs,
  NewVendorBill,
  Page,
  VendorBillRepository,
  VendorBillUpdate,
  VendorBillWithDocument,
} from "../types";
import type { MemoryStore } from "./store";
import { createInMemoryDocumentRepository } from "./documents";

export function createInMemoryVendorBillRepository(
  store: MemoryStore,
): VendorBillRepository {
  const rows = store.vendorBills;
  const documents = createInMemoryDocumentRepository(store);

  const repo: VendorBillRepository = {
    async create(data: NewVendorBill): Promise<VendorBill> {
      const row: VendorBill = {
        id: randomUUID(),
        documentId: data.documentId,
        status: data.status,
      };
      rows.set(row.id, row);
      return row;
    },

    async findById(
      id: string,
      organizationId: string,
    ): Promise<VendorBillWithDocument | null> {
      const row = rows.get(id);
      if (!row) return null;
      const document = await documents.findById(row.documentId, organizationId);
      if (!document) return null;
      return { ...row, document };
    },

    async list(args: ListVendorBillsArgs): Promise<Page<VendorBillWithDocument>> {
      const statusFilter = args.status
        ? Array.isArray(args.status)
          ? args.status
          : [args.status]
        : null;
      const enriched: VendorBillWithDocument[] = [];
      for (const row of rows.values()) {
        const document = await documents.findById(row.documentId, args.organizationId);
        if (!document) continue;
        if (statusFilter && !statusFilter.includes(row.status)) continue;
        if (args.vendorId && document.vendorId !== args.vendorId) continue;
        if (args.issueDateFrom && document.issueDate < args.issueDateFrom) continue;
        if (args.issueDateTo && document.issueDate > args.issueDateTo) continue;
        if (
          args.query &&
          !(document.externalDocumentNumber ?? "")
            .toLowerCase()
            .includes(args.query.toLowerCase())
        )
          continue;
        enriched.push({ ...row, document });
      }
      enriched.sort(
        (a, b) => b.document.createdAt.getTime() - a.document.createdAt.getTime(),
      );
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const totalCount = enriched.length;
      const data = enriched.slice((page - 1) * perPage, page * perPage);
      return {
        data,
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },

    async update(id, organizationId, patch: VendorBillUpdate): Promise<VendorBill> {
      const existing = rows.get(id);
      if (!existing) throw new Error("vendor bill not found");
      const document = await documents.findById(existing.documentId, organizationId);
      if (!document) throw new Error("vendor bill not found");
      const updated: VendorBill = { ...existing, ...patch };
      rows.set(id, updated);
      return updated;
    },

    async delete(id, organizationId): Promise<void> {
      const existing = rows.get(id);
      if (!existing) return;
      const document = await documents.findById(existing.documentId, organizationId);
      if (!document) return;
      rows.delete(id);
    },
  };
  return repo;
}

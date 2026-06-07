import { randomUUID } from "node:crypto";
import type { Invoice } from "../../types";
import type {
  InvoiceRepository,
  InvoiceUpdate,
  InvoiceWithDocument,
  ListInvoicesArgs,
  NewInvoice,
  Page,
} from "../types";
import type { MemoryStore } from "./store";
import { createInMemoryDocumentRepository } from "./documents";
import { matchesDocumentSearch, sortInvoicesInMemory } from "../../lib/list-query";

export function createInMemoryInvoiceRepository(
  store: MemoryStore,
): InvoiceRepository {
  const rows = store.invoices;
  const clients = store.clients;
  // Use documents from the same store
  const documents = createInMemoryDocumentRepository(store);

  return {
    async create(data: NewInvoice): Promise<Invoice> {
      const id = randomUUID();
      const invoice: Invoice = {
        id,
        documentId: data.documentId,
        status: data.status,
        paidDate: data.paidDate ?? null,
        convertedFromQuoteId: data.convertedFromQuoteId ?? null,
      };
      rows.set(id, invoice);
      return invoice;
    },

    async findById(
      id: string,
      organizationId: string,
    ): Promise<InvoiceWithDocument | null> {
      const invoice = rows.get(id);
      if (!invoice) return null;
      const doc = await documents.findById(invoice.documentId, organizationId);
      if (!doc) return null;
      return { ...invoice, document: doc };
    },

    async findByDocumentNumber({
      organizationId,
      prefix,
      documentNumber,
    }: {
      organizationId: string;
      prefix: string | null;
      documentNumber: number;
    }): Promise<Invoice | null> {
      for (const invoice of rows.values()) {
        const doc = await documents.findById(invoice.documentId, organizationId);
        if (!doc) continue;
        if (
          doc.type === "INVOICE" &&
          doc.organizationId === organizationId &&
          doc.documentNumberPrefix === prefix &&
          doc.documentNumber === documentNumber
        ) {
          return invoice;
        }
      }
      return null;
    },

    async list(args: ListInvoicesArgs): Promise<Page<InvoiceWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;

      const results: InvoiceWithDocument[] = [];

      for (const invoice of rows.values()) {
        // Apply status filter before fetching doc
        if (args.status !== undefined) {
          const statuses = Array.isArray(args.status) ? args.status : [args.status];
          if (!statuses.includes(invoice.status)) continue;
        }

        const doc = await documents.findById(invoice.documentId, args.organizationId);
        if (!doc) continue;

        // Apply clientId filter
        if (args.clientId && doc.clientId !== args.clientId) continue;

        // Apply issue date range filter
        if (args.issueDateFrom && doc.issueDate < args.issueDateFrom) continue;
        if (args.issueDateTo && doc.issueDate > args.issueDateTo) continue;

        // Apply dueBefore filter (overdue = past the due date)
        if (args.dueBefore && (!doc.dueDate || doc.dueDate >= args.dueBefore)) continue;

        // Apply free-text search
        if (!matchesDocumentSearch(doc, clients.get(doc.clientId), args.query)) continue;

        results.push({ ...invoice, document: doc });
      }

      const sorted = sortInvoicesInMemory(results, args.sortBy, args.sortDir);

      const totalCount = sorted.length;
      const data = sorted.slice((page - 1) * perPage, page * perPage);

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

    async update(
      id: string,
      organizationId: string,
      patch: InvoiceUpdate,
    ): Promise<Invoice> {
      const existing = rows.get(id);
      if (!existing) throw new Error("invoice not found");
      // Verify org ownership
      const doc = await documents.findById(existing.documentId, organizationId);
      if (!doc) throw new Error("invoice not found");
      const updated: Invoice = { ...existing, ...patch };
      rows.set(id, updated);
      return updated;
    },

    async delete(id: string, organizationId: string): Promise<void> {
      const existing = rows.get(id);
      if (!existing) return;
      // Verify org ownership
      const doc = await documents.findById(existing.documentId, organizationId);
      if (!doc) return;
      rows.delete(id);
    },
  };
}

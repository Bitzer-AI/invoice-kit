import { randomUUID } from "node:crypto";
import type { Quote, QuoteStatus } from "../../types";
import { DocumentType } from "../../types";
import type {
  ListQuotesArgs,
  NewQuote,
  Page,
  QuoteRepository,
  QuoteUpdate,
  QuoteWithDocument,
} from "../types";
import type { MemoryStore } from "./store";
import { createInMemoryDocumentRepository } from "./documents";
import { matchesDocumentSearch, sortQuotesInMemory } from "../../lib/list-query";

export function createInMemoryQuoteRepository(
  store: MemoryStore,
): QuoteRepository {
  const rows = store.quotes;
  const clients = store.clients;
  // Use documents from the same store
  const documents = createInMemoryDocumentRepository(store);

  async function convertedInvoiceForQuote(
    quoteId: string,
    organizationId: string,
  ): Promise<QuoteWithDocument["convertedInvoice"]> {
    for (const invoice of store.invoices.values()) {
      if (invoice.convertedFromQuoteId !== quoteId) continue;
      const document = await documents.findById(invoice.documentId, organizationId);
      if (!document) return null;
      return {
        id: invoice.id,
        documentNumberPrefix: document.documentNumberPrefix,
        documentNumber: document.documentNumber,
        documentNumberPadWidth: document.documentNumberPadWidth,
      };
    }
    return null;
  }

  return {
    async create(data: NewQuote): Promise<Quote> {
      const id = randomUUID();
      const quote: Quote = {
        id,
        documentId: data.documentId,
        status: data.status,
        subject: data.subject,
        validUntil: data.validUntil ?? null,
      };
      rows.set(id, quote);
      return quote;
    },

    async findById(
      id: string,
      organizationId: string,
    ): Promise<QuoteWithDocument | null> {
      const quote = rows.get(id);
      if (!quote) return null;
      const doc = await documents.findById(quote.documentId, organizationId);
      if (!doc) return null;
      return {
        ...quote,
        document: doc,
        convertedInvoice: await convertedInvoiceForQuote(quote.id, organizationId),
      };
    },

    async findByDocumentNumber({
      organizationId,
      prefix,
      documentNumber,
    }: {
      organizationId: string;
      prefix: string | null;
      documentNumber: number;
    }): Promise<Quote | null> {
      for (const quote of rows.values()) {
        const doc = await documents.findById(quote.documentId, organizationId);
        if (!doc) continue;
        if (
          doc.type === DocumentType.Quote &&
          doc.organizationId === organizationId &&
          doc.documentNumberPrefix === prefix &&
          doc.documentNumber === documentNumber
        ) {
          return quote;
        }
      }
      return null;
    },

    async list(args: ListQuotesArgs): Promise<Page<QuoteWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const query = args.query?.trim().toLowerCase();

      const results: QuoteWithDocument[] = [];

      for (const quote of rows.values()) {
        if (args.quoteIds && !args.quoteIds.includes(quote.id)) continue;
        // Apply status filter before fetching doc
        if (args.status !== undefined) {
          const statuses = Array.isArray(args.status) ? args.status : [args.status];
          if (!statuses.includes(quote.status)) continue;
        }

        const doc = await documents.findById(quote.documentId, args.organizationId);
        if (!doc) continue;

        // Apply clientId filter
        if (args.clientId && doc.clientId !== args.clientId) continue;
        if (args.currency && doc.currency !== args.currency) continue;

        // Apply issue date range filter
        if (args.issueDateFrom && doc.issueDate < args.issueDateFrom) continue;
        if (args.issueDateTo && doc.issueDate > args.issueDateTo) continue;

        // Apply free-text search
        const matchesSubject = query ? (quote.subject?.toLowerCase().includes(query) ?? false) : false;
        if (!matchesSubject && !matchesDocumentSearch(doc, clients.get(doc.clientId ?? ""), args.query)) continue;

        results.push({
          ...quote,
          document: doc,
          convertedInvoice: await convertedInvoiceForQuote(
            quote.id,
            args.organizationId,
          ),
        });
      }

      const sorted = sortQuotesInMemory(results, args.sortBy, args.sortDir);

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
      patch: QuoteUpdate,
    ): Promise<Quote> {
      const existing = rows.get(id);
      if (!existing) throw new Error("quote not found");
      // Verify org ownership
      const doc = await documents.findById(existing.documentId, organizationId);
      if (!doc) throw new Error("quote not found");
      const updated: Quote = { ...existing, ...patch };
      rows.set(id, updated);
      return updated;
    },

    async transitionStatus(
      id: string,
      organizationId: string,
      from: QuoteStatus,
      to: QuoteStatus,
    ): Promise<boolean> {
      const existing = rows.get(id);
      if (!existing || existing.status !== from) return false;
      const document = await documents.findById(existing.documentId, organizationId);
      if (!document) return false;
      rows.set(id, { ...existing, status: to });
      return true;
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

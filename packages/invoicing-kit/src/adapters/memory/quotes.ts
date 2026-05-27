import { randomUUID } from "node:crypto";
import type { Quote } from "../../types";
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

export function createInMemoryQuoteRepository(
  store: MemoryStore,
): QuoteRepository {
  const rows = store.quotes;
  // Use documents from the same store
  const documents = createInMemoryDocumentRepository(store);

  return {
    async create(data: NewQuote): Promise<Quote> {
      const id = randomUUID();
      const quote: Quote = {
        id,
        documentId: data.documentId,
        status: data.status,
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
      return { ...quote, document: doc };
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
          doc.type === "QUOTE" &&
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

      const results: QuoteWithDocument[] = [];

      for (const quote of rows.values()) {
        // Apply status filter before fetching doc
        if (args.status !== undefined) {
          const statuses = Array.isArray(args.status) ? args.status : [args.status];
          if (!statuses.includes(quote.status)) continue;
        }

        const doc = await documents.findById(quote.documentId, args.organizationId);
        if (!doc) continue;

        // Apply clientId filter
        if (args.clientId && doc.clientId !== args.clientId) continue;

        results.push({ ...quote, document: doc });
      }

      // Sort by document.createdAt desc
      results.sort((a, b) => b.document.createdAt.getTime() - a.document.createdAt.getTime());

      const totalCount = results.length;
      const data = results.slice((page - 1) * perPage, page * perPage);

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

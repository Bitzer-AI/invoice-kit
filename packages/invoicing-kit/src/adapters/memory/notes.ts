import { randomUUID } from "node:crypto";
import type { Note } from "../../types";
import { DocumentType } from "../../types";
import type {
  ListNotesArgs,
  NewNote,
  NoteRepository,
  NoteUpdate,
  NoteWithDocument,
  Page,
} from "../types";
import type { MemoryStore } from "./store";
import { createInMemoryDocumentRepository } from "./documents";
import { matchesDocumentSearch, sortNotesInMemory } from "../../lib/list-query";

export function createInMemoryNoteRepository(store: MemoryStore): NoteRepository {
  const rows = store.notes;
  const documents = createInMemoryDocumentRepository(store);

  // Resolve the referenced invoice / vendor bill into the summary the response
  // exposes, including the entity id (distinct from the document id).
  async function referencedDocumentFor(
    document: { referencedDocumentId: string | null },
    organizationId: string,
  ): Promise<NoteWithDocument["referencedDocument"]> {
    if (!document.referencedDocumentId) return null;
    const referenced = await documents.findById(
      document.referencedDocumentId,
      organizationId,
    );
    if (!referenced) return null;
    let entityId: string | null = null;
    for (const invoice of store.invoices.values()) {
      if (invoice.documentId === referenced.id) {
        entityId = invoice.id;
        break;
      }
    }
    if (entityId === null) {
      for (const vendorBill of store.vendorBills.values()) {
        if (vendorBill.documentId === referenced.id) {
          entityId = vendorBill.id;
          break;
        }
      }
    }
    return {
      id: referenced.id,
      entityId,
      type: referenced.type,
      documentNumber: referenced.documentNumber,
      documentNumberPrefix: referenced.documentNumberPrefix ?? null,
      externalDocumentNumber: referenced.externalDocumentNumber ?? null,
      total: referenced.total ?? null,
      currency: referenced.currency,
      issueDate: referenced.issueDate,
    };
  }

  const repo: NoteRepository = {
    async create(data: NewNote): Promise<Note> {
      const row: Note = {
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
    ): Promise<NoteWithDocument | null> {
      const row = rows.get(id);
      if (!row) return null;
      const document = await documents.findById(row.documentId, organizationId);
      if (!document) return null;
      return {
        ...row,
        document,
        referencedDocument: await referencedDocumentFor(document, organizationId),
      };
    },

    async list(args: ListNotesArgs): Promise<Page<NoteWithDocument>> {
      const statusFilter = args.status
        ? Array.isArray(args.status)
          ? args.status
          : [args.status]
        : null;
      const enriched: NoteWithDocument[] = [];
      for (const row of rows.values()) {
        const document = await documents.findById(row.documentId, args.organizationId);
        if (!document) continue;
        if (document.type !== DocumentType.CreditNote && document.type !== DocumentType.DebitNote)
          continue;
        if (args.type && document.type !== args.type) continue;
        if (args.party === "CLIENT" && document.clientId == null) continue;
        if (args.party === "VENDOR" && document.vendorId == null) continue;
        if (statusFilter && !statusFilter.includes(row.status)) continue;
        if (args.clientId && document.clientId !== args.clientId) continue;
        if (args.vendorId && document.vendorId !== args.vendorId) continue;
        if (
          args.referencedDocumentId &&
          document.referencedDocumentId !== args.referencedDocumentId
        )
          continue;
        if (args.issueDateFrom && document.issueDate < args.issueDateFrom) continue;
        if (args.issueDateTo && document.issueDate > args.issueDateTo) continue;
        if (
          args.query &&
          !matchesDocumentSearch(
            document,
            document.clientId
              ? store.clients.get(document.clientId) ?? undefined
              : undefined,
            args.query,
          )
        )
          continue;
        enriched.push({
          ...row,
          document,
          referencedDocument: await referencedDocumentFor(document, args.organizationId),
        });
      }
      const sorted = sortNotesInMemory(enriched, args.sortBy, args.sortDir);
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
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

    async update(id, organizationId, patch: NoteUpdate): Promise<Note> {
      const existing = rows.get(id);
      if (!existing) throw new Error("note not found");
      const document = await documents.findById(existing.documentId, organizationId);
      if (!document) throw new Error("note not found");
      const updated: Note = { ...existing, ...patch };
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

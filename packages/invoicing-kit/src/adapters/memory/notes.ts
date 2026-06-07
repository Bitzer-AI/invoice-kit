import { randomUUID } from "node:crypto";
import type { Note } from "../../types";
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
      return { ...row, document };
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
        if (document.type !== "CREDIT_NOTE" && document.type !== "DEBIT_NOTE") continue;
        if (args.type && document.type !== args.type) continue;
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
        enriched.push({ ...row, document });
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

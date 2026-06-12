import type { Note } from "../../types";
import type {
  ListNotesArgs,
  NewNote,
  NoteRepository,
  NoteUpdate,
  NoteWithDocument,
  Page,
} from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { noteRowToDomain, noteWithDocumentRowToDomain } from "./mappers";
import { WITH_DOCUMENT_INCLUDE } from "./documents";
import { documentSearchWhere } from "../../lib/list-query";

export function createPrismaNoteRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): NoteRepository {
  const db = (prisma as any)[modelNames.note];
  return {
    async create(data: NewNote): Promise<Note> {
      const row = await db.create({ data: { documentId: data.documentId, status: data.status } });
      return noteRowToDomain(row);
    },

    async findById(id, organizationId): Promise<NoteWithDocument | null> {
      const row = await db.findFirst({
        where: { id, document: { organizationId } },
        include: WITH_DOCUMENT_INCLUDE,
      });
      return row ? noteWithDocumentRowToDomain(row) : null;
    },

    async list(args: ListNotesArgs): Promise<Page<NoteWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const documentWhere: any = {
        organizationId: args.organizationId,
        type: args.type ? args.type : { in: ["CREDIT_NOTE", "DEBIT_NOTE"] },
      };
      if (args.clientId) documentWhere.clientId = args.clientId;
      if (args.vendorId) documentWhere.vendorId = args.vendorId;
      if (args.referencedDocumentId) documentWhere.referencedDocumentId = args.referencedDocumentId;
      if (args.issueDateFrom || args.issueDateTo) {
        documentWhere.issueDate = {};
        if (args.issueDateFrom) documentWhere.issueDate.gte = args.issueDateFrom;
        if (args.issueDateTo) documentWhere.issueDate.lte = args.issueDateTo;
      }
      const search = documentSearchWhere(args.query);
      if (search) Object.assign(documentWhere, search);
      const where: any = { document: documentWhere };
      if (args.status) {
        where.status = Array.isArray(args.status) ? { in: args.status } : args.status;
      }
      const sortBy = args.sortBy ?? "issueDate";
      const sortDir = args.sortDir ?? "desc";
      const orderBy =
        sortBy === "status"
          ? { status: sortDir }
          : { document: { [sortBy]: sortDir } };
      const [rows, totalCount] = await Promise.all([
        db.findMany({
          where,
          include: WITH_DOCUMENT_INCLUDE,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy,
        }),
        db.count({ where }),
      ]);
      return {
        data: rows.map(noteWithDocumentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },

    async update(id, organizationId, patch: NoteUpdate): Promise<Note> {
      const { count } = await db.updateMany({
        where: { id, document: { organizationId } },
        data: patch,
      });
      if (count === 0) throw new Error("note not found");
      const row = await db.findUnique({ where: { id } });
      return noteRowToDomain(row);
    },

    async delete(id, organizationId): Promise<void> {
      await db.deleteMany({ where: { id, document: { organizationId } } });
    },
  };
}

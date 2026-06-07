import type {
  ListQuotesArgs,
  NewQuote,
  Page,
  QuoteRepository,
  QuoteUpdate,
  QuoteWithDocument,
} from "../types";
import type { Quote } from "../../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { quoteRowToDomain, quoteWithDocumentRowToDomain } from "./mappers";
import { documentSearchWhere, quoteListOrderBy } from "../../lib/list-query";

const FULL_INCLUDE = {
  document: {
    include: {
      lineItems: { include: { taxes: true } },
      paymentMethods: true,
    },
  },
};

export function createPrismaQuoteRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): QuoteRepository {
  const db = (prisma as any)[modelNames.quote];
  return {
    async create(data: NewQuote): Promise<Quote> {
      const row = await db.create({
        data: {
          documentId: data.documentId,
          status: data.status,
          validUntil: data.validUntil ?? null,
        },
      });
      return quoteRowToDomain(row);
    },
    async findById(id, organizationId) {
      const row = await db.findFirst({
        where: { id, document: { organizationId } },
        include: FULL_INCLUDE,
      });
      return row ? quoteWithDocumentRowToDomain(row) : null;
    },
    async findByDocumentNumber({ organizationId, prefix, documentNumber }) {
      const row = await db.findFirst({
        where: {
          document: {
            type: "QUOTE",
            organizationId,
            documentNumberPrefix: prefix,
            documentNumber,
          },
        },
      });
      return row ? quoteRowToDomain(row) : null;
    },
    async list(args: ListQuotesArgs): Promise<Page<QuoteWithDocument>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const documentWhere: any = { organizationId: args.organizationId };
      if (args.clientId) documentWhere.clientId = args.clientId;
      if (args.issueDateFrom || args.issueDateTo) {
        documentWhere.issueDate = {};
        if (args.issueDateFrom) documentWhere.issueDate.gte = args.issueDateFrom;
        if (args.issueDateTo) documentWhere.issueDate.lte = args.issueDateTo;
      }
      const search = documentSearchWhere(args.query);
      if (search) Object.assign(documentWhere, search);
      const where: any = { document: documentWhere };
      if (args.status) {
        where.status = Array.isArray(args.status)
          ? { in: args.status }
          : args.status;
      }
      const [rows, totalCount] = await Promise.all([
        db.findMany({
          where,
          include: FULL_INCLUDE,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: quoteListOrderBy(args.sortBy, args.sortDir),
        }),
        db.count({ where }),
      ]);
      return {
        data: rows.map(quoteWithDocumentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },
    async update(id, organizationId, patch: QuoteUpdate) {
      const { count } = await db.updateMany({
        where: { id, document: { organizationId } },
        data: patch,
      });
      if (count === 0) throw new Error("quote not found");
      const row = await db.findUnique({ where: { id } });
      return quoteRowToDomain(row);
    },
    async delete(id, organizationId) {
      await db.deleteMany({
        where: { id, document: { organizationId } },
      });
    },
  };
}

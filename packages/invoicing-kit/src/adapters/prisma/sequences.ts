// src/adapters/prisma/sequences.ts
import type { DocumentSequenceRepository } from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { documentSequenceRowToDomain } from "./mappers";

const series = (prefix: string | null | undefined): string => prefix ?? "";

export function createPrismaDocumentSequenceRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): DocumentSequenceRepository {
  const db = (prisma as any)[modelNames.documentNumberSequence];
  return {
    async ensure({ organizationId, documentType, prefix }) {
      await db.upsert({
        where: {
          organizationId_documentType_prefix: {
            organizationId,
            documentType,
            prefix: series(prefix),
          },
        },
        create: {
          organizationId,
          documentType,
          prefix: series(prefix),
          nextNumber: 1,
        },
        update: {}, // no-op on conflict
      });
    },
    async incrementAndGet({ organizationId, documentType, prefix }) {
      // Atomic: Postgres locks the row during this update.
      // `update` returns the POST-increment value; subtract 1 for the PRE-increment value.
      const row = await db.update({
        where: {
          organizationId_documentType_prefix: {
            organizationId,
            documentType,
            prefix: series(prefix),
          },
        },
        data: { nextNumber: { increment: 1 } },
      });
      return row.nextNumber - 1;
    },
    async find({ organizationId, documentType, prefix }) {
      const row = await db.findUnique({
        where: {
          organizationId_documentType_prefix: {
            organizationId,
            documentType,
            prefix: series(prefix),
          },
        },
      });
      return row ? documentSequenceRowToDomain(row) : null;
    },
    async list({ organizationId, documentType }) {
      const rows = await db.findMany({
        where: { organizationId, documentType },
        orderBy: { prefix: "asc" },
      });
      return rows.map(documentSequenceRowToDomain);
    },
    async upsert({ organizationId, documentType, prefix, label, nextNumber, padWidth }) {
      const row = await db.upsert({
        where: {
          organizationId_documentType_prefix: {
            organizationId,
            documentType,
            prefix: series(prefix),
          },
        },
        update: { label, nextNumber, padWidth },
        create: { organizationId, documentType, prefix: series(prefix), label, nextNumber, padWidth },
      });
      return documentSequenceRowToDomain(row);
    },
    async maxIssuedNumber({ organizationId, documentType, prefix }) {
      const docDb = (prisma as any)[modelNames.document];
      const p = series(prefix);
      const where =
        p === ""
          ? {
              organizationId,
              type: documentType,
              OR: [{ documentNumberPrefix: null }, { documentNumberPrefix: "" }],
            }
          : { organizationId, type: documentType, documentNumberPrefix: p };
      const agg = await docDb.aggregate({ where, _max: { documentNumber: true } });
      return agg._max.documentNumber ?? null;
    },
  };
}

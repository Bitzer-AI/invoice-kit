// src/adapters/prisma/sequences.ts
import type { DocumentSequenceRepository } from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { documentSequenceRowToDomain } from "./mappers";

export function createPrismaDocumentSequenceRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): DocumentSequenceRepository {
  const db = (prisma as any)[modelNames.documentNumberSequence];
  return {
    async ensure({ organizationId, documentType, prefix }) {
      await db.upsert({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
        create: {
          organizationId,
          documentType,
          prefix: prefix ?? null,
          nextNumber: 1,
        },
        update: {}, // no-op on conflict
      });
    },
    async incrementAndGet({ organizationId, documentType }) {
      // Atomic: Postgres locks the row during this update.
      // `update` returns the row with the POST-increment value.
      // Return the PRE-increment value by subtracting 1.
      const row = await db.update({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
        data: { nextNumber: { increment: 1 } },
      });
      return row.nextNumber - 1;
    },
    async find({ organizationId, documentType }) {
      const row = await db.findUnique({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
      });
      return row ? documentSequenceRowToDomain(row) : null;
    },
    async upsert({ organizationId, documentType, prefix, nextNumber, padWidth }) {
      const row = await db.upsert({
        where: { organizationId_documentType: { organizationId, documentType } },
        update: { prefix, nextNumber, padWidth },
        create: { organizationId, documentType, prefix, nextNumber, padWidth },
      });
      return documentSequenceRowToDomain(row);
    },
    async maxIssuedNumber({ organizationId, documentType }) {
      const docDb = (prisma as any)[modelNames.document];
      const agg = await docDb.aggregate({
        where: { organizationId, type: documentType },
        _max: { documentNumber: true },
      });
      return agg._max.documentNumber ?? null;
    },
  };
}

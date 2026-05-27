// src/adapters/prisma/sequences.ts
import type { DocumentSequenceRepository } from "../types";
import type { AnyPrismaClient } from "./client-type";
import { documentSequenceRowToDomain } from "./mappers";

export function createPrismaDocumentSequenceRepository(
  prisma: AnyPrismaClient,
): DocumentSequenceRepository {
  const db = prisma as any;
  return {
    async ensure({ organizationId, documentType, prefix }) {
      await db.documentNumberSequence.upsert({
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
      const row = await db.documentNumberSequence.update({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
        data: { nextNumber: { increment: 1 } },
      });
      return row.nextNumber - 1;
    },
    async find({ organizationId, documentType }) {
      const row = await db.documentNumberSequence.findUnique({
        where: {
          organizationId_documentType: { organizationId, documentType },
        },
      });
      return row ? documentSequenceRowToDomain(row) : null;
    },
  };
}

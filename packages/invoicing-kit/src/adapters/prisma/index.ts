import type { AnyPrismaClient } from "./client-type";
import type { Repositories } from "../types";
import { createPrismaClientRepository } from "./clients";
import { createPrismaProductRepository } from "./products";
import { createPrismaTaxRepository } from "./taxes";
import { createPrismaDocumentSequenceRepository } from "./sequences";
import { createPrismaDocumentRepository } from "./documents";
import { createPrismaInvoiceRepository } from "./invoices";
import { createPrismaQuoteRepository } from "./quotes";
import { createPrismaPaymentMethodRepository } from "./payment-methods";
import { createPrismaPaymentRepository } from "./payments";

export function prismaAdapter(prisma: AnyPrismaClient): Repositories {
  function buildRepos(client: AnyPrismaClient, depth: number): Repositories {
    return {
      clients: createPrismaClientRepository(client),
      products: createPrismaProductRepository(client),
      taxes: createPrismaTaxRepository(client),
      documentSequences: createPrismaDocumentSequenceRepository(client),
      documents: createPrismaDocumentRepository(client),
      invoices: createPrismaInvoiceRepository(client),
      quotes: createPrismaQuoteRepository(client),
      paymentMethods: createPrismaPaymentMethodRepository(client),
      payments: createPrismaPaymentRepository(client),
      tx: async (fn) => {
        if (depth > 0) {
          // Already inside a transaction; reuse same client.
          return fn(buildRepos(client, depth + 1));
        }
        return (prisma as any).$transaction(async (tx: any) => {
          return fn(buildRepos(tx, 1));
        });
      },
    };
  }
  const repos = buildRepos(prisma, 0);
  (repos as unknown as { __prisma: AnyPrismaClient }).__prisma = prisma;
  return repos;
}

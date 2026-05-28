import type { AnyPrismaClient, PrismaAdapterConfig, PrismaModelNames } from "./client-type";
import { DEFAULT_PRISMA_MODEL_NAMES } from "./client-type";
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

export function prismaAdapter(
  prisma: AnyPrismaClient,
  config?: PrismaAdapterConfig,
): Repositories {
  const modelNames: PrismaModelNames = {
    ...DEFAULT_PRISMA_MODEL_NAMES,
    ...config?.modelNames,
  };

  function buildRepos(client: AnyPrismaClient, depth: number): Repositories {
    return {
      clients: createPrismaClientRepository(client, modelNames),
      products: createPrismaProductRepository(client, modelNames),
      taxes: createPrismaTaxRepository(client, modelNames),
      documentSequences: createPrismaDocumentSequenceRepository(client, modelNames),
      documents: createPrismaDocumentRepository(client, modelNames),
      invoices: createPrismaInvoiceRepository(client, modelNames),
      quotes: createPrismaQuoteRepository(client, modelNames),
      paymentMethods: createPrismaPaymentMethodRepository(client, modelNames),
      payments: createPrismaPaymentRepository(client, modelNames),
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

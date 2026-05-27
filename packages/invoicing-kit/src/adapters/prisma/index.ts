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

function notImpl(name: string): never {
  throw new Error(`prismaAdapter: ${name} not implemented yet`);
}

export function prismaAdapter(prisma: AnyPrismaClient): Repositories {
  const clients = createPrismaClientRepository(prisma);
  const products = createPrismaProductRepository(prisma);
  const taxes = createPrismaTaxRepository(prisma);
  const documentSequences = createPrismaDocumentSequenceRepository(prisma);
  const documents = createPrismaDocumentRepository(prisma);
  const invoices = createPrismaInvoiceRepository(prisma);
  const quotes = createPrismaQuoteRepository(prisma);
  const paymentMethods = createPrismaPaymentMethodRepository(prisma);
  const repos: Repositories = {
    clients,
    products,
    taxes,
    documentSequences,
    documents,
    invoices,
    quotes,
    paymentMethods,
    payments: {
      create: () => notImpl("payments.create"),
      findById: () => notImpl("payments.findById"),
      list: () => notImpl("payments.list"),
      update: () => notImpl("payments.update"),
      delete: () => notImpl("payments.delete"),
      totalPaidForInvoice: () => notImpl("payments.totalPaidForInvoice"),
    },
    tx: () => notImpl("tx"),
  };
  (repos as unknown as { __prisma: AnyPrismaClient }).__prisma = prisma;
  return repos;
}

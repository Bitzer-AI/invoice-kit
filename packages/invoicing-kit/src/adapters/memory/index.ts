import type { Repositories } from "../types";
import { createInMemoryClientRepository } from "./clients";
import { createInMemoryProductRepository } from "./products";
import { createInMemoryTaxRepository } from "./taxes";
import { createInMemoryDocumentSequenceRepository } from "./sequences";
import { createInMemoryDocumentRepository } from "./documents";
import { createInMemoryInvoiceRepository } from "./invoices";
import { createInMemoryQuoteRepository } from "./quotes";

function notImpl(name: string): never {
  throw new Error(`inMemoryAdapter: ${name} not implemented yet`);
}

export function inMemoryAdapter(): Repositories {
  // Filled in per-domain across Phase C. For now, every method throws.
  const clients = createInMemoryClientRepository();
  const products = createInMemoryProductRepository();
  const taxes = createInMemoryTaxRepository();
  const documentSequences = createInMemoryDocumentSequenceRepository();
  const documents = createInMemoryDocumentRepository();
  const invoices = createInMemoryInvoiceRepository(documents);
  const quotes = createInMemoryQuoteRepository(documents);
  const repos: Repositories = {
    clients,
    products,
    taxes,
    documentSequences,
    documents,
    invoices,
    quotes,
    paymentMethods: {
      create: () => notImpl("paymentMethods.create"),
      findById: () => notImpl("paymentMethods.findById"),
      list: () => notImpl("paymentMethods.list"),
      update: () => notImpl("paymentMethods.update"),
      delete: () => notImpl("paymentMethods.delete"),
      clearDefaultExcept: () => notImpl("paymentMethods.clearDefaultExcept"),
    },
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
  return repos;
}

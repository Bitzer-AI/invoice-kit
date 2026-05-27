import type { Repositories } from "../types";
import { createInMemoryClientRepository } from "./clients";
import { createInMemoryProductRepository } from "./products";

function notImpl(name: string): never {
  throw new Error(`inMemoryAdapter: ${name} not implemented yet`);
}

export function inMemoryAdapter(): Repositories {
  // Filled in per-domain across Phase C. For now, every method throws.
  const clients = createInMemoryClientRepository();
  const products = createInMemoryProductRepository();
  const repos: Repositories = {
    clients,
    products,
    taxes: {
      create: () => notImpl("taxes.create"),
      findById: () => notImpl("taxes.findById"),
      findManyById: () => notImpl("taxes.findManyById"),
      list: () => notImpl("taxes.list"),
      update: () => notImpl("taxes.update"),
      delete: () => notImpl("taxes.delete"),
      clearDefaultExcept: () => notImpl("taxes.clearDefaultExcept"),
    },
    documentSequences: {
      incrementAndGet: () => notImpl("documentSequences.incrementAndGet"),
      ensure: () => notImpl("documentSequences.ensure"),
      find: () => notImpl("documentSequences.find"),
    },
    documents: {
      create: () => notImpl("documents.create"),
      findById: () => notImpl("documents.findById"),
      update: () => notImpl("documents.update"),
      replaceLineItems: () => notImpl("documents.replaceLineItems"),
      setPaymentMethods: () => notImpl("documents.setPaymentMethods"),
      delete: () => notImpl("documents.delete"),
    },
    invoices: {
      create: () => notImpl("invoices.create"),
      findById: () => notImpl("invoices.findById"),
      findByDocumentNumber: () => notImpl("invoices.findByDocumentNumber"),
      list: () => notImpl("invoices.list"),
      update: () => notImpl("invoices.update"),
      delete: () => notImpl("invoices.delete"),
    },
    quotes: {
      create: () => notImpl("quotes.create"),
      findById: () => notImpl("quotes.findById"),
      findByDocumentNumber: () => notImpl("quotes.findByDocumentNumber"),
      list: () => notImpl("quotes.list"),
      update: () => notImpl("quotes.update"),
      delete: () => notImpl("quotes.delete"),
    },
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

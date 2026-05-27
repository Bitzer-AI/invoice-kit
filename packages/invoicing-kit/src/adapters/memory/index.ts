import type { Repositories } from "../types";
import { createInMemoryClientRepository } from "./clients";
import { createInMemoryProductRepository } from "./products";
import { createInMemoryTaxRepository } from "./taxes";
import { createInMemoryDocumentSequenceRepository } from "./sequences";
import { createInMemoryDocumentRepository } from "./documents";
import { createInMemoryInvoiceRepository } from "./invoices";
import { createInMemoryQuoteRepository } from "./quotes";
import { createInMemoryPaymentMethodRepository } from "./payment-methods";
import { createInMemoryPaymentRepository } from "./payments";

function notImpl(name: string): never {
  throw new Error(`inMemoryAdapter: ${name} not implemented yet`);
}

export function inMemoryAdapter(): Repositories {
  const clients = createInMemoryClientRepository();
  const products = createInMemoryProductRepository();
  const taxes = createInMemoryTaxRepository();
  const documentSequences = createInMemoryDocumentSequenceRepository();
  const documents = createInMemoryDocumentRepository();
  const invoices = createInMemoryInvoiceRepository(documents);
  const quotes = createInMemoryQuoteRepository(documents);
  const paymentMethods = createInMemoryPaymentMethodRepository();
  const payments = createInMemoryPaymentRepository(invoices);
  const repos: Repositories = {
    clients,
    products,
    taxes,
    documentSequences,
    documents,
    invoices,
    quotes,
    paymentMethods,
    payments,
    tx: () => notImpl("tx"),
  };
  return repos;
}

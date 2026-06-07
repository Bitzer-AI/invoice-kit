import type { Repositories } from "../types";
import type { MemoryStore } from "./store";
import { applySnapshot, createStore, snapshot } from "./store";
import { createInMemoryClientRepository } from "./clients";
import { createInMemoryProductRepository } from "./products";
import { createInMemoryTaxRepository } from "./taxes";
import { createInMemoryDocumentSequenceRepository } from "./sequences";
import { createInMemoryDocumentRepository } from "./documents";
import { createInMemoryInvoiceRepository } from "./invoices";
import { createInMemoryQuoteRepository } from "./quotes";
import { createInMemoryPaymentMethodRepository } from "./payment-methods";
import { createInMemoryPaymentRepository } from "./payments";
import { createInMemoryFiscalDocumentRepository } from "./fiscal-documents";
import { createInMemoryVendorRepository } from "./vendors";
import { createInMemoryVendorBillRepository } from "./vendor-bills";
import { createInMemoryVendorBillPaymentRepository } from "./vendor-bill-payments";
import { createInMemoryNoteRepository } from "./notes";

export function inMemoryAdapter(): Repositories {
  const store = createStore();
  let txDepth = 0;

  function build(s: MemoryStore): Repositories {
    return {
      clients: createInMemoryClientRepository(s),
      vendors: createInMemoryVendorRepository(s),
      products: createInMemoryProductRepository(s),
      taxes: createInMemoryTaxRepository(s),
      documentSequences: createInMemoryDocumentSequenceRepository(s),
      documents: createInMemoryDocumentRepository(s),
      invoices: createInMemoryInvoiceRepository(s),
      vendorBills: createInMemoryVendorBillRepository(s),
      notes: createInMemoryNoteRepository(s),
      quotes: createInMemoryQuoteRepository(s),
      paymentMethods: createInMemoryPaymentMethodRepository(s),
      payments: createInMemoryPaymentRepository(s),
      vendorBillPayments: createInMemoryVendorBillPaymentRepository(s),
      fiscalDocuments: createInMemoryFiscalDocumentRepository(s),
      tx: async (fn) => {
        if (txDepth > 0) {
          // Nested: reuse current snapshot store.
          return fn(build(s));
        }
        txDepth++;
        const snap = snapshot(s);
        try {
          const result = await fn(build(snap));
          applySnapshot(store, snap);
          return result;
        } catch (err) {
          // Discard snapshot — live store is unchanged
          throw err;
        } finally {
          txDepth--;
        }
      },
    };
  }

  return build(store);
}

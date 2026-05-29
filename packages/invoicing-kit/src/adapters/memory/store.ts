import type {
  Client,
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentNumberSequence,
  DocumentPaymentMethod,
  FiscalDocument,
  Invoice,
  Payment,
  PaymentMethod,
  Product,
  Quote,
  Tax,
} from "../../types";

export interface MemoryStore {
  clients: Map<string, Client>;
  products: Map<string, Product>;
  taxes: Map<string, Tax>;
  documents: Map<string, Document>;
  documentLineItems: Map<string, DocumentLineItem>;
  documentLineItemTaxes: Map<string, DocumentLineItemTax>;
  documentPaymentMethods: Map<string, DocumentPaymentMethod>;
  documentSequences: Map<string, DocumentNumberSequence>;
  invoices: Map<string, Invoice>;
  quotes: Map<string, Quote>;
  paymentMethods: Map<string, PaymentMethod>;
  payments: Map<string, Payment>;
  fiscalDocuments: Map<string, FiscalDocument>;
}

export function createStore(): MemoryStore {
  return {
    clients: new Map(),
    products: new Map(),
    taxes: new Map(),
    documents: new Map(),
    documentLineItems: new Map(),
    documentLineItemTaxes: new Map(),
    documentPaymentMethods: new Map(),
    documentSequences: new Map(),
    invoices: new Map(),
    quotes: new Map(),
    paymentMethods: new Map(),
    payments: new Map(),
    fiscalDocuments: new Map(),
  };
}

export function snapshot(store: MemoryStore): MemoryStore {
  return {
    clients: new Map(store.clients),
    products: new Map(store.products),
    taxes: new Map(store.taxes),
    documents: new Map(store.documents),
    documentLineItems: new Map(store.documentLineItems),
    documentLineItemTaxes: new Map(store.documentLineItemTaxes),
    documentPaymentMethods: new Map(store.documentPaymentMethods),
    documentSequences: new Map(store.documentSequences),
    invoices: new Map(store.invoices),
    quotes: new Map(store.quotes),
    paymentMethods: new Map(store.paymentMethods),
    payments: new Map(store.payments),
    fiscalDocuments: new Map(store.fiscalDocuments),
  };
}

export function applySnapshot(target: MemoryStore, src: MemoryStore): void {
  for (const key of Object.keys(target) as Array<keyof MemoryStore>) {
    target[key].clear();
    for (const [k, v] of src[key]) (target[key] as Map<string, unknown>).set(k, v);
  }
}

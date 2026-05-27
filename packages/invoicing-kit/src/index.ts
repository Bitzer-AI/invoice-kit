// Public API of invoicing-kit (Plan 1 surface).
// Plan 2 will add `createInvoicingKit`, services, and routes.

// Domain types
export type {
  BigintMinor,
  Client,
  DecimalString,
  Document,
  DocumentLineItem,
  DocumentLineItemTax,
  DocumentNumberSequence,
  DocumentPaymentMethod,
  DocumentType,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  PaymentMethodType,
  PaymentProvider,
  PaymentStatus,
  Product,
  Quote,
  QuoteStatus,
  Tax,
  TaxType,
} from "./types";

// Repository interfaces and input/output shapes
export type {
  ClientRepository,
  ClientUpdate,
  DocumentRepository,
  DocumentSequenceRepository,
  DocumentUpdate,
  DocumentWithRelations,
  InvoiceRepository,
  InvoiceUpdate,
  InvoiceWithDocument,
  ListClientsArgs,
  ListInvoicesArgs,
  ListPaymentMethodsArgs,
  ListPaymentsArgs,
  ListProductsArgs,
  ListQuotesArgs,
  ListTaxesArgs,
  NewClient,
  NewDocument,
  NewDocumentLineItem,
  NewInvoice,
  NewPayment,
  NewPaymentMethod,
  NewProduct,
  NewQuote,
  NewTax,
  Page,
  PageRequest,
  PaymentMethodRepository,
  PaymentMethodUpdate,
  PaymentRepository,
  PaymentUpdate,
  ProductRepository,
  ProductUpdate,
  QuoteRepository,
  QuoteUpdate,
  QuoteWithDocument,
  Repositories,
  TaxRepository,
  TaxUpdate,
} from "./adapters/types";

// Default adapter
export { prismaAdapter } from "./adapters/prisma";

// Error handling
export { ErrorCode, httpError } from "./lib/errors";
export type { ErrorCodeKey, ErrorCodeValue } from "./lib/errors";

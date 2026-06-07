// Public API of invoicing-kit (Plan 1 surface).
// Plan 2 adds `createInvoicingKit`, services, and routes.

export { createInvoicingKit } from "./create";
export type {
  InvoicingKitConfig,
  InvoicingKitHooks,
  InvoiceIssuedContext,
  PaymentSucceededContext,
  VendorBillRecordedContext,
  VendorBillPaymentSucceededContext,
} from "./config";
export type { AuthContext } from "./auth/types";

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
  FiscalDocument,
  FiscalStatus,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  PaymentMethodType,
  PaymentStatus,
  Product,
  Quote,
  QuoteStatus,
  Tax,
  TaxType,
  Vendor,
  VendorBill,
  VendorBillStatus,
  VendorBillPayment,
  VendorBillPaymentStatus,
} from "./types";

// Repository interfaces and input/output shapes
export type {
  ClientRepository,
  ClientUpdate,
  DocumentRepository,
  DocumentSequenceRepository,
  DocumentUpdate,
  DocumentWithRelations,
  FiscalDocumentRepository,
  FiscalDocumentUpdate,
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
  NewFiscalDocument,
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
  VendorRepository,
  VendorUpdate,
  NewVendor,
  ListVendorsArgs,
  VendorBillRepository,
  VendorBillUpdate,
  NewVendorBill,
  VendorBillWithDocument,
  ListVendorBillsArgs,
  VendorBillPaymentRepository,
  VendorBillPaymentUpdate,
  NewVendorBillPayment,
  ListVendorBillPaymentsArgs,
} from "./adapters/types";

// Default adapter
export { prismaAdapter } from "./adapters/prisma";
export type { PrismaAdapterConfig, PrismaModelNames } from "./adapters/prisma/client-type";
export { DEFAULT_PRISMA_MODEL_NAMES } from "./adapters/prisma/client-type";

// Error handling
export { ErrorCode, httpError } from "./lib/errors";
export type { ErrorCodeKey, ErrorCodeValue } from "./lib/errors";

import type {
  Client,
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
  BigintMinor,
  DecimalString,
} from "../types";

export interface PageRequest {
  page?: number;
  perPage?: number;
}

export interface Page<T> {
  data: T[];
  pageInfo: {
    page: number;
    perPage: number;
    totalCount: number;
    pageCount: number;
  };
}

// ============== Client ==============

export interface NewClient {
  organizationId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

export type ClientUpdate = Partial<Omit<NewClient, "organizationId">>;

export interface ListClientsArgs extends PageRequest {
  organizationId: string;
  query?: string;
}

export interface ClientRepository {
  create(data: NewClient): Promise<Client>;
  findById(id: string, organizationId: string): Promise<Client | null>;
  list(args: ListClientsArgs): Promise<Page<Client>>;
  update(id: string, organizationId: string, patch: ClientUpdate): Promise<Client>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Product ==============

export interface NewProduct {
  organizationId: string;
  name: string;
  description?: string | null;
  price: DecimalString;
}

export type ProductUpdate = Partial<Omit<NewProduct, "organizationId">>;

export interface ListProductsArgs extends PageRequest {
  organizationId: string;
  query?: string;
}

export interface ProductRepository {
  create(data: NewProduct): Promise<Product>;
  findById(id: string, organizationId: string): Promise<Product | null>;
  list(args: ListProductsArgs): Promise<Page<Product>>;
  update(id: string, organizationId: string, patch: ProductUpdate): Promise<Product>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Tax ==============

export interface NewTax {
  organizationId: string;
  name: string;
  description?: string | null;
  type: TaxType;
  rate: DecimalString;
  isActive?: boolean;
  isDefault?: boolean;
}

export type TaxUpdate = Partial<Omit<NewTax, "organizationId">>;

export interface ListTaxesArgs {
  organizationId: string;
  isActive?: boolean;
}

export interface TaxRepository {
  create(data: NewTax): Promise<Tax>;
  findById(id: string, organizationId: string): Promise<Tax | null>;
  findManyById(ids: string[], organizationId: string): Promise<Tax[]>;
  list(args: ListTaxesArgs): Promise<Tax[]>;
  update(id: string, organizationId: string, patch: TaxUpdate): Promise<Tax>;
  delete(id: string, organizationId: string): Promise<void>;
  /** Clears the `isDefault` flag on all rows for an org except `keepId`. */
  clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void>;
}

// ============== DocumentNumberSequence ==============

export interface DocumentSequenceRepository {
  /** Atomically increments `nextNumber` for (org, type) and returns the value prior to increment. */
  incrementAndGet(args: {
    organizationId: string;
    documentType: DocumentType;
  }): Promise<number>;
  /** Idempotent: creates the row with `nextNumber=1` if missing, no-op otherwise. */
  ensure(args: {
    organizationId: string;
    documentType: DocumentType;
    prefix?: string | null;
  }): Promise<void>;
  find(args: {
    organizationId: string;
    documentType: DocumentType;
  }): Promise<DocumentNumberSequence | null>;
}

// ============== Document ==============

export interface NewDocumentLineItem {
  productId: string;
  quantity: DecimalString;
  price: BigintMinor;
  description?: string | null;
  /** Per-line tax breakdown (post-calculation). Empty array for no tax. */
  taxes: Array<{ taxId: string; taxAmount: BigintMinor }>;
  /** Pre-computed line totals. */
  taxAmount: BigintMinor;
  total: BigintMinor;
}

export interface NewDocument {
  type: DocumentType;
  organizationId: string;
  clientId: string;
  documentNumberPrefix?: string | null;
  documentNumber: number;
  issueDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
  lineItems: NewDocumentLineItem[];
  paymentMethodIds?: string[];
}

export type DocumentUpdate = Partial<{
  clientId: string;
  documentNumberPrefix: string | null;
  documentNumber: number;
  issueDate: Date;
  dueDate: Date | null;
  notes: string | null;
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
}>;

export interface DocumentWithRelations extends Document {
  lineItems: Array<DocumentLineItem & { taxes: DocumentLineItemTax[] }>;
  paymentMethods: DocumentPaymentMethod[];
}

export interface DocumentRepository {
  /** Inserts the Document + line items + per-line taxes + payment-method links in one DB call (the adapter's responsibility). Returns the document with relations. */
  create(data: NewDocument): Promise<DocumentWithRelations>;
  findById(id: string, organizationId: string): Promise<DocumentWithRelations | null>;
  update(id: string, organizationId: string, patch: DocumentUpdate): Promise<Document>;
  /** Replaces line items + per-line taxes wholesale. */
  replaceLineItems(
    documentId: string,
    organizationId: string,
    lineItems: NewDocumentLineItem[],
  ): Promise<void>;
  /** Sets the linked payment-method ids (replaces the set). */
  setPaymentMethods(
    documentId: string,
    organizationId: string,
    paymentMethodIds: string[],
  ): Promise<void>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Invoice ==============

export interface NewInvoice {
  documentId: string;
  status: InvoiceStatus;
  paidDate?: Date | null;
  convertedFromQuoteId?: string | null;
}

export type InvoiceUpdate = Partial<{
  status: InvoiceStatus;
  paidDate: Date | null;
}>;

export interface InvoiceWithDocument extends Invoice {
  document: DocumentWithRelations;
}

export interface ListInvoicesArgs extends PageRequest {
  organizationId: string;
  status?: InvoiceStatus | InvoiceStatus[];
  clientId?: string;
  /** Inclusive date range on Document.issueDate. */
  issueDateFrom?: Date;
  issueDateTo?: Date;
}

export interface InvoiceRepository {
  create(data: NewInvoice): Promise<Invoice>;
  findById(id: string, organizationId: string): Promise<InvoiceWithDocument | null>;
  findByDocumentNumber(args: {
    organizationId: string;
    prefix: string | null;
    documentNumber: number;
  }): Promise<Invoice | null>;
  list(args: ListInvoicesArgs): Promise<Page<InvoiceWithDocument>>;
  update(id: string, organizationId: string, patch: InvoiceUpdate): Promise<Invoice>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== Quote ==============

export interface NewQuote {
  documentId: string;
  status: QuoteStatus;
  validUntil?: Date | null;
}

export type QuoteUpdate = Partial<{
  status: QuoteStatus;
  validUntil: Date | null;
}>;

export interface QuoteWithDocument extends Quote {
  document: DocumentWithRelations;
}

export interface ListQuotesArgs extends PageRequest {
  organizationId: string;
  status?: QuoteStatus | QuoteStatus[];
  clientId?: string;
}

export interface QuoteRepository {
  create(data: NewQuote): Promise<Quote>;
  findById(id: string, organizationId: string): Promise<QuoteWithDocument | null>;
  findByDocumentNumber(args: {
    organizationId: string;
    prefix: string | null;
    documentNumber: number;
  }): Promise<Quote | null>;
  list(args: ListQuotesArgs): Promise<Page<QuoteWithDocument>>;
  update(id: string, organizationId: string, patch: QuoteUpdate): Promise<Quote>;
  delete(id: string, organizationId: string): Promise<void>;
}

// ============== PaymentMethod ==============

export interface NewPaymentMethod {
  organizationId: string;
  name: string;
  type: PaymentMethodType;
  instructions?: string | null;
  metadata?: unknown | null;
  isActive?: boolean;
  isDefault?: boolean;
}

export type PaymentMethodUpdate = Partial<Omit<NewPaymentMethod, "organizationId">>;

export interface ListPaymentMethodsArgs {
  organizationId: string;
  isActive?: boolean;
}

export interface PaymentMethodRepository {
  create(data: NewPaymentMethod): Promise<PaymentMethod>;
  findById(id: string, organizationId: string): Promise<PaymentMethod | null>;
  list(args: ListPaymentMethodsArgs): Promise<PaymentMethod[]>;
  update(id: string, organizationId: string, patch: PaymentMethodUpdate): Promise<PaymentMethod>;
  delete(id: string, organizationId: string): Promise<void>;
  clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void>;
}

// ============== Payment ==============

export interface NewPayment {
  invoiceId: string;
  paymentMethodId?: string | null;
  amount: BigintMinor;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  stripePaymentIntentId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripeChargeId?: string | null;
  paidAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
  reference?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
  metadata?: unknown | null;
}

export type PaymentUpdate = Partial<Omit<NewPayment, "invoiceId">>;

export interface ListPaymentsArgs extends PageRequest {
  organizationId: string;
  invoiceId?: string;
  status?: PaymentStatus;
}

export interface PaymentRepository {
  create(data: NewPayment): Promise<Payment>;
  findById(id: string, organizationId: string): Promise<Payment | null>;
  list(args: ListPaymentsArgs): Promise<Page<Payment>>;
  update(id: string, organizationId: string, patch: PaymentUpdate): Promise<Payment>;
  delete(id: string, organizationId: string): Promise<void>;
  /** Sum of `amount` for succeeded payments on the given invoice, in the invoice's currency. */
  totalPaidForInvoice(invoiceId: string, organizationId: string): Promise<BigintMinor>;
}

// ============== Top-level bundle ==============

export interface Repositories {
  clients: ClientRepository;
  products: ProductRepository;
  taxes: TaxRepository;
  documentSequences: DocumentSequenceRepository;
  documents: DocumentRepository;
  invoices: InvoiceRepository;
  quotes: QuoteRepository;
  paymentMethods: PaymentMethodRepository;
  payments: PaymentRepository;
  /** Runs `fn` inside a transaction; the `txRepos` passed in share the transaction. Nested calls must reuse the outer transaction (no nested savepoints in v0). */
  tx<T>(fn: (txRepos: Repositories) => Promise<T>): Promise<T>;
}

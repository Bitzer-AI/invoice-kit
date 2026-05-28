// We can't import `@prisma/client` directly because the generated client lives
// in the consumer's project, not in our package. Use a minimal structural type
// covering only the model namespaces we need.
//
// At call sites inside the adapter we'll cast through `any` at the point we use
// model-specific operations, since each consumer's generated client has a
// different concrete shape. The boundary is typed; the inside is dynamic.
//
// In production this is fine: consumers pass `new PrismaClient()` and the
// `Repositories` shape we return is fully typed.

export type AnyPrismaClient = {
  $transaction: <T>(fn: (tx: AnyPrismaClient) => Promise<T>) => Promise<T>;
} & Record<string, unknown>;

// ---------------------------------------------------------------------------
// Model name configuration
// ---------------------------------------------------------------------------

export interface PrismaModelNames {
  client: string;
  product: string;
  tax: string;
  paymentMethod: string;
  document: string;
  documentLineItem: string;
  documentLineItemTax: string;
  documentNumberSequence: string;
  documentPaymentMethod: string;
  quote: string;
  invoice: string;
  payment: string;
}

export const DEFAULT_PRISMA_MODEL_NAMES: PrismaModelNames = {
  client: "client",
  product: "product",
  tax: "tax",
  paymentMethod: "paymentMethod",
  document: "document",
  documentLineItem: "documentLineItem",
  documentLineItemTax: "documentLineItemTax",
  documentNumberSequence: "documentNumberSequence",
  documentPaymentMethod: "documentPaymentMethod",
  quote: "quote",
  invoice: "invoice",
  payment: "payment",
};

export interface PrismaAdapterConfig {
  modelNames?: Partial<PrismaModelNames>;
}

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
  // The boundary is intentionally minimal: every internal use casts `prisma as any` (model
  // namespaces via `(prisma as any)[modelName]`, transactions via `(prisma as any).$transaction`),
  // so the only thing this type must do is accept a real generated client without a cast.
  //
  // Do NOT add `& Record<string, unknown>` here. A generated PrismaClient is a nominal class /
  // interface and is NOT assignable to a string index signature, so the intersection silently
  // breaks `prismaAdapter(new PrismaClient())` and forces consumers to cast. Likewise, leave
  // `$transaction` loose — narrowing it to a single fixed signature won't unify with the client's
  // overloaded (batch + interactive) `$transaction`.
  $transaction: (...args: any[]) => any;
};

// Compile-time regression guard. `_NominalClient` is an `interface` on purpose: like a real
// generated client (and unlike a `type` alias), an interface is not assignable to a string index
// signature. So if anyone reintroduces `& Record<string, unknown>` on `AnyPrismaClient`, this stops
// compiling — the exact regression that would force `prismaAdapter(prisma)` to need a cast again.
interface _NominalClient {
  $transaction: (...args: any[]) => any;
}
type _Assert<T extends AnyPrismaClient> = T;
type _AnyPrismaClientAcceptsNominalClient = _Assert<_NominalClient>;

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
  fiscalDocument: string;
  vendor: string;
  vendorBill: string;
  vendorBillPayment: string;
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
  fiscalDocument: "fiscalDocument",
  vendor: "vendor",
  vendorBill: "vendorBill",
  vendorBillPayment: "vendorBillPayment",
};

export interface PrismaAdapterConfig {
  modelNames?: Partial<PrismaModelNames>;
}

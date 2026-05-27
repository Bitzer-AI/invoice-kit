import { randomUUID } from "node:crypto";
import type { Payment } from "../../types";
import type {
  InvoiceRepository,
  ListPaymentsArgs,
  NewPayment,
  Page,
  PaymentRepository,
  PaymentUpdate,
} from "../types";
import type { BigintMinor } from "../../types";

export function createInMemoryPaymentRepository(
  invoices: InvoiceRepository,
): PaymentRepository {
  const rows = new Map<string, Payment>();

  const repo: PaymentRepository = {
    async create(data: NewPayment): Promise<Payment> {
      const now = new Date();
      const row: Payment = {
        id: randomUUID(),
        invoiceId: data.invoiceId,
        paymentMethodId: data.paymentMethodId ?? null,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        provider: data.provider,
        stripePaymentIntentId: data.stripePaymentIntentId ?? null,
        stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
        stripeChargeId: data.stripeChargeId ?? null,
        paidAt: data.paidAt ?? null,
        failedAt: data.failedAt ?? null,
        failureReason: data.failureReason ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        recordedBy: data.recordedBy ?? null,
        metadata: data.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },

    async findById(id: string, organizationId: string): Promise<Payment | null> {
      const row = rows.get(id);
      if (!row) return null;
      // Org-scope: verify the invoice belongs to the org
      const invoice = await invoices.findById(row.invoiceId, organizationId);
      if (!invoice) return null;
      return row;
    },

    async list(args: ListPaymentsArgs): Promise<Page<Payment>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;

      const results: Payment[] = [];

      for (const row of rows.values()) {
        // Org-scope via invoice -> document chain
        const invoice = await invoices.findById(row.invoiceId, args.organizationId);
        if (!invoice) continue;

        if (args.invoiceId && row.invoiceId !== args.invoiceId) continue;
        if (args.status && row.status !== args.status) continue;

        results.push(row);
      }

      // Sort by createdAt desc
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const totalCount = results.length;
      const data = results.slice((page - 1) * perPage, page * perPage);

      return {
        data,
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },

    async update(
      id: string,
      organizationId: string,
      patch: PaymentUpdate,
    ): Promise<Payment> {
      const existing = rows.get(id);
      if (!existing) throw new Error("payment not found");
      // Verify org ownership
      const invoice = await invoices.findById(existing.invoiceId, organizationId);
      if (!invoice) throw new Error("payment not found");
      const updated: Payment = { ...existing, ...patch, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },

    async delete(id: string, organizationId: string): Promise<void> {
      const existing = rows.get(id);
      if (!existing) return;
      // Verify org ownership
      const invoice = await invoices.findById(existing.invoiceId, organizationId);
      if (!invoice) return;
      rows.delete(id);
    },

    async totalPaidForInvoice(
      invoiceId: string,
      organizationId: string,
    ): Promise<BigintMinor> {
      // Verify the invoice belongs to this org first
      const invoice = await invoices.findById(invoiceId, organizationId);
      if (!invoice) return 0n;

      let total = 0n;
      for (const row of rows.values()) {
        if (row.invoiceId === invoiceId && row.status === "succeeded") {
          total += row.amount;
        }
      }
      return total;
    },
  };

  return repo;
}

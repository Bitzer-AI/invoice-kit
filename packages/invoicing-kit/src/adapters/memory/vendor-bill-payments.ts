import { randomUUID } from "node:crypto";
import type { BigintMinor, VendorBillPayment } from "../../types";
import type {
  ListVendorBillPaymentsArgs,
  NewVendorBillPayment,
  Page,
  VendorBillPaymentRepository,
  VendorBillPaymentUpdate,
} from "../types";
import type { MemoryStore } from "./store";

export function createInMemoryVendorBillPaymentRepository(
  store: MemoryStore,
): VendorBillPaymentRepository {
  const rows = store.vendorBillPayments;

  const repo: VendorBillPaymentRepository = {
    async create(data: NewVendorBillPayment): Promise<VendorBillPayment> {
      const now = new Date();
      const row: VendorBillPayment = {
        id: randomUUID(),
        organizationId: data.organizationId,
        vendorBillId: data.vendorBillId,
        paymentMethodId: data.paymentMethodId ?? null,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        provider: data.provider,
        paidAt: data.paidAt ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        recordedBy: data.recordedBy ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },

    async findById(id, organizationId): Promise<VendorBillPayment | null> {
      const row = rows.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },

    async list(args: ListVendorBillPaymentsArgs): Promise<Page<VendorBillPayment>> {
      const all = Array.from(rows.values())
        .filter((r) => r.organizationId === args.organizationId)
        .filter((r) => (args.vendorBillId ? r.vendorBillId === args.vendorBillId : true))
        .filter((r) => (args.status ? r.status === args.status : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const totalCount = all.length;
      const data = all.slice((page - 1) * perPage, page * perPage);
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

    async update(id, organizationId, patch: VendorBillPaymentUpdate) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) throw new Error("vendor bill payment not found");
      const updated: VendorBillPayment = { ...existing, ...patch, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },

    async delete(id, organizationId) {
      const existing = await repo.findById(id, organizationId);
      if (!existing) return;
      rows.delete(id);
    },

    async totalPaidForBill(vendorBillId, organizationId): Promise<BigintMinor> {
      let total = 0n;
      for (const row of rows.values()) {
        if (
          row.organizationId === organizationId &&
          row.vendorBillId === vendorBillId &&
          row.status === "succeeded"
        ) {
          total += row.amount;
        }
      }
      return total;
    },
  };
  return repo;
}

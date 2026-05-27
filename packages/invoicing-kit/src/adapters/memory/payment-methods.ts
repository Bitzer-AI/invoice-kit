import { randomUUID } from "node:crypto";
import type { PaymentMethod } from "../../types";
import type {
  ListPaymentMethodsArgs,
  NewPaymentMethod,
  PaymentMethodRepository,
  PaymentMethodUpdate,
} from "../types";

export function createInMemoryPaymentMethodRepository(): PaymentMethodRepository {
  const rows = new Map<string, PaymentMethod>();

  const repo: PaymentMethodRepository = {
    async create(data: NewPaymentMethod): Promise<PaymentMethod> {
      const now = new Date();
      const row: PaymentMethod = {
        id: randomUUID(),
        organizationId: data.organizationId,
        name: data.name,
        type: data.type,
        instructions: data.instructions ?? null,
        metadata: data.metadata ?? null,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },

    async findById(id: string, organizationId: string): Promise<PaymentMethod | null> {
      const row = rows.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },

    async list(args: ListPaymentMethodsArgs): Promise<PaymentMethod[]> {
      return Array.from(rows.values())
        .filter((r) => r.organizationId === args.organizationId)
        .filter((r) => (args.isActive !== undefined ? r.isActive === args.isActive : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async update(
      id: string,
      organizationId: string,
      patch: PaymentMethodUpdate,
    ): Promise<PaymentMethod> {
      const existing = await repo.findById(id, organizationId);
      if (!existing) throw new Error("payment method not found");
      const updated: PaymentMethod = {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },

    async delete(id: string, organizationId: string): Promise<void> {
      const existing = await repo.findById(id, organizationId);
      if (!existing) return;
      rows.delete(id);
    },

    async clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void> {
      for (const [id, row] of rows) {
        if (row.organizationId === organizationId && row.id !== keepId) {
          rows.set(id, { ...row, isDefault: false, updatedAt: new Date() });
        }
      }
    },
  };

  return repo;
}

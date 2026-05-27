import type { PaymentMethod } from "../../types";
import type {
  ListPaymentMethodsArgs,
  NewPaymentMethod,
  PaymentMethodRepository,
  PaymentMethodUpdate,
} from "../types";
import type { AnyPrismaClient } from "./client-type";
import { paymentMethodRowToDomain } from "./mappers";

export function createPrismaPaymentMethodRepository(prisma: AnyPrismaClient): PaymentMethodRepository {
  const db = prisma as any;
  return {
    async create(data: NewPaymentMethod): Promise<PaymentMethod> {
      const row = await db.paymentMethod.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          type: data.type,
          instructions: data.instructions ?? null,
          metadata: data.metadata ?? null,
          isActive: data.isActive ?? true,
          isDefault: data.isDefault ?? false,
        },
      });
      return paymentMethodRowToDomain(row);
    },

    async findById(id: string, organizationId: string): Promise<PaymentMethod | null> {
      const row = await db.paymentMethod.findFirst({ where: { id, organizationId } });
      return row ? paymentMethodRowToDomain(row) : null;
    },

    async list(args: ListPaymentMethodsArgs): Promise<PaymentMethod[]> {
      const where: any = { organizationId: args.organizationId };
      if (args.isActive !== undefined) {
        where.isActive = args.isActive;
      }
      const rows = await db.paymentMethod.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(paymentMethodRowToDomain);
    },

    async update(
      id: string,
      organizationId: string,
      patch: PaymentMethodUpdate,
    ): Promise<PaymentMethod> {
      const { count } = await db.paymentMethod.updateMany({
        where: { id, organizationId },
        data: patch,
      });
      if (count === 0) throw new Error("payment method not found");
      const row = await db.paymentMethod.findUnique({ where: { id } });
      return paymentMethodRowToDomain(row);
    },

    async delete(id: string, organizationId: string): Promise<void> {
      await db.paymentMethod.deleteMany({ where: { id, organizationId } });
    },

    async clearDefaultExcept(organizationId: string, keepId: string | null): Promise<void> {
      await db.paymentMethod.updateMany({
        where: {
          organizationId,
          isDefault: true,
          ...(keepId ? { NOT: { id: keepId } } : {}),
        },
        data: { isDefault: false },
      });
    },
  };
}

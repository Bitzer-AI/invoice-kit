import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { PaymentMethod } from "../../types";
import type { CreatePaymentMethodBody, UpdatePaymentMethodBody, ListPaymentMethodsQuery } from "./validation";
import { PaymentMethodNotFoundException } from "./exceptions";

export class PaymentMethodService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreatePaymentMethodBody, ctx: AuthContext): Promise<PaymentMethod> {
    return this.repos.tx(async (tx) => {
      const created = await tx.paymentMethods.create({
        organizationId: ctx.organizationId,
        name: body.name,
        type: body.type,
        instructions: body.instructions ?? null,
        metadata: body.metadata ?? null,
        isActive: body.isActive,
        isDefault: body.isDefault,
      });
      if (body.isDefault) {
        await tx.paymentMethods.clearDefaultExcept(ctx.organizationId, created.id);
      }
      return created;
    });
  }

  async list(query: ListPaymentMethodsQuery, ctx: AuthContext): Promise<PaymentMethod[]> {
    return this.repos.paymentMethods.list({
      organizationId: ctx.organizationId,
      isActive: query.isActive === undefined ? undefined : query.isActive === "true",
    });
  }

  async findById(id: string, ctx: AuthContext): Promise<PaymentMethod> {
    const paymentMethod = await this.repos.paymentMethods.findById(id, ctx.organizationId);
    if (!paymentMethod) throw PaymentMethodNotFoundException();
    return paymentMethod;
  }

  async update(id: string, body: UpdatePaymentMethodBody, ctx: AuthContext): Promise<PaymentMethod> {
    return this.repos.tx(async (tx) => {
      const existing = await tx.paymentMethods.findById(id, ctx.organizationId);
      if (!existing) throw PaymentMethodNotFoundException();
      const updated = await tx.paymentMethods.update(id, ctx.organizationId, body);
      if (body.isDefault === true) {
        await tx.paymentMethods.clearDefaultExcept(ctx.organizationId, id);
      }
      return updated;
    });
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.paymentMethods.delete(id, ctx.organizationId);
  }
}

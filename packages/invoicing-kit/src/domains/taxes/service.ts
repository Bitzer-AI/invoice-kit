import type { Repositories } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Tax } from "../../types";
import type { CreateTaxBody, UpdateTaxBody, ListTaxesQuery } from "./validation";
import { TaxNotFoundException } from "./exceptions";

export class TaxService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreateTaxBody, ctx: AuthContext): Promise<Tax> {
    return this.repos.tx(async (tx) => {
      const created = await tx.taxes.create({
        organizationId: ctx.organizationId,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        rate: body.rate,
        isActive: body.isActive,
        isDefault: body.isDefault,
      });
      if (body.isDefault) {
        await tx.taxes.clearDefaultExcept(ctx.organizationId, created.id);
      }
      return created;
    });
  }

  async list(query: ListTaxesQuery, ctx: AuthContext): Promise<Tax[]> {
    return this.repos.taxes.list({
      organizationId: ctx.organizationId,
      isActive: query.isActive === undefined ? undefined : query.isActive === "true",
    });
  }

  async findById(id: string, ctx: AuthContext): Promise<Tax> {
    const tax = await this.repos.taxes.findById(id, ctx.organizationId);
    if (!tax) throw TaxNotFoundException();
    return tax;
  }

  async update(id: string, body: UpdateTaxBody, ctx: AuthContext): Promise<Tax> {
    return this.repos.tx(async (tx) => {
      const existing = await tx.taxes.findById(id, ctx.organizationId);
      if (!existing) throw TaxNotFoundException();
      const updated = await tx.taxes.update(id, ctx.organizationId, body);
      if (body.isDefault === true) {
        await tx.taxes.clearDefaultExcept(ctx.organizationId, id);
      }
      return updated;
    });
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.taxes.delete(id, ctx.organizationId);
  }
}

import type { Repositories, ListVendorsArgs } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Vendor } from "../../types";
import type { CreateVendorBody, UpdateVendorBody, ListVendorsQuery } from "./validation";
import { VendorNotFoundException } from "./exceptions";

export class VendorService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreateVendorBody, ctx: AuthContext): Promise<Vendor> {
    return this.repos.vendors.create({
      organizationId: ctx.organizationId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      taxId: body.taxId ?? null,
      taxIdType: body.taxIdType ?? null,
      isActive: body.isActive,
    });
  }

  async list(query: ListVendorsQuery, ctx: AuthContext) {
    const args: ListVendorsArgs = {
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      query: query.query,
    };
    return this.repos.vendors.list(args);
  }

  async findById(id: string, ctx: AuthContext): Promise<Vendor> {
    const vendor = await this.repos.vendors.findById(id, ctx.organizationId);
    if (!vendor) throw VendorNotFoundException();
    return vendor;
  }

  async update(id: string, body: UpdateVendorBody, ctx: AuthContext): Promise<Vendor> {
    await this.findById(id, ctx);
    return this.repos.vendors.update(id, ctx.organizationId, body);
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.vendors.delete(id, ctx.organizationId);
  }
}

import type { Repositories, ListClientsArgs } from "../../adapters/types";
import type { AuthContext } from "../../auth/types";
import type { Client } from "../../types";
import type { CreateClientBody, UpdateClientBody, ListClientsQuery } from "./validation";
import { ClientNotFoundException } from "./exceptions";

export class ClientService {
  constructor(private readonly repos: Repositories) {}

  async create(body: CreateClientBody, ctx: AuthContext): Promise<Client> {
    return this.repos.clients.create({
      organizationId: ctx.organizationId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      country: body.country ?? null,
      addressLine1: body.addressLine1 ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      postalCode: body.postalCode ?? null,
    });
  }

  async list(query: ListClientsQuery, ctx: AuthContext) {
    const args: ListClientsArgs = {
      organizationId: ctx.organizationId,
      page: query.page,
      perPage: query.perPage,
      query: query.query,
    };
    return this.repos.clients.list(args);
  }

  async findById(id: string, ctx: AuthContext): Promise<Client> {
    const client = await this.repos.clients.findById(id, ctx.organizationId);
    if (!client) throw ClientNotFoundException();
    return client;
  }

  async update(id: string, body: UpdateClientBody, ctx: AuthContext): Promise<Client> {
    // Verify existence (and throw typed 404 instead of a generic Prisma error).
    await this.findById(id, ctx);
    return this.repos.clients.update(id, ctx.organizationId, body);
  }

  async delete(id: string, ctx: AuthContext): Promise<void> {
    await this.findById(id, ctx);
    await this.repos.clients.delete(id, ctx.organizationId);
  }
}

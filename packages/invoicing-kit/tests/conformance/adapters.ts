import { inMemoryAdapter } from "../../src/adapters/memory";
import { prismaAdapter } from "../../src/adapters/prisma";
import type { AdapterFactory } from "./factories";
import type { Repositories } from "../../src/adapters/types";

// Lazy: only import the generated Prisma client when the Prisma factory runs,
// so unit-test-only files don't pay for it.
async function loadPrismaClient() {
  // @ts-expect-error — file generated at test setup
  const mod = await import("../../src/generated/test-prisma/client.ts");
  return mod.PrismaClient as new () => any;
}

let sharedPrisma: any;

export const inMemoryFactory: AdapterFactory = {
  name: "in-memory",
  async create(): Promise<Repositories> {
    return inMemoryAdapter();
  },
  async reset(_repos: Repositories): Promise<void> {
    // In-memory is recreated per test; nothing to clean.
  },
};

export const prismaFactory: AdapterFactory = {
  name: "prisma",
  async create(): Promise<Repositories> {
    if (!sharedPrisma) {
      const PrismaClient = await loadPrismaClient();
      sharedPrisma = new PrismaClient();
    }
    // Truncate all billing tables before each test.
    await sharedPrisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "document_line_item_taxes",
        "document_line_items",
        "document_payment_methods",
        "payments",
        "payment_methods",
        "invoices",
        "quotes",
        "documents",
        "taxes",
        "products",
        "clients",
        "document_number_sequences",
        "invitation",
        "member",
        "organization",
        "session",
        "account",
        "verification",
        "user"
      RESTART IDENTITY CASCADE
    `);
    return prismaAdapter(sharedPrisma);
  },
  async reset(_repos: Repositories): Promise<void> {
    // Per-test truncation handled in create(); nothing to do after.
  },
};

export const allFactories: AdapterFactory[] = [inMemoryFactory, prismaFactory];

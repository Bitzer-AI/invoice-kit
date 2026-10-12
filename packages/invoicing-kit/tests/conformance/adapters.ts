import { inMemoryAdapter } from "../../src/adapters/memory";
import { prismaAdapter } from "../../src/adapters/prisma";
import type { AdapterFactory } from "./factories";
import type { Repositories } from "../../src/adapters/types";
import { emptyTestDatabase } from "../support/test-database";

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
    return prismaAdapter(await emptyTestDatabase());
  },
  async reset(_repos: Repositories): Promise<void> {
    // Per-test truncation handled in create(); nothing to do after.
  },
};

export const allFactories: AdapterFactory[] = [inMemoryFactory, prismaFactory];

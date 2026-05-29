import type { Repositories } from "../../src/adapters/types";
import { randomUUID } from "node:crypto";

export interface Seeded {
  organizationId: string;
  userId: string;
}

export interface SeededWithInvoice extends Seeded {
  /** Id of a minimal invoice created under the seeded organization. */
  invoiceId: string;
}

/**
 * Seeds the minimum FK rows (organization + user + membership) for a test.
 * For Prisma: inserts directly via the underlying client.
 * For in-memory: no FK enforcement; returns synthetic ids.
 */
export async function seed(repos: Repositories): Promise<Seeded> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  // Tunnel access through the adapter's prisma field if present.
  const prisma = (repos as unknown as { __prisma?: any }).__prisma;
  if (prisma) {
    await prisma.user.create({
      data: {
        id: userId,
        name: "Test User",
        email: `${userId}@test.local`,
        emailVerified: true,
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Test Org",
        slug: `org-${organizationId.slice(0, 8)}`,
        createdAt: new Date(),
      },
    });
    await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId,
        userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
  }
  return { organizationId, userId };
}

/**
 * Seeds the minimum FK rows AND a minimal invoice.
 * Used by fiscal-document conformance tests that need an invoiceId FK target.
 * Existing callers of `seed` are unaffected.
 */
export async function seedWithInvoice(repos: Repositories): Promise<SeededWithInvoice> {
  const base = await seed(repos);
  const { organizationId } = base;

  const client = await repos.clients.create({ organizationId, name: "Seed Client" });
  const product = await repos.products.create({
    organizationId,
    name: "Seed Product",
    price: "10.00",
  });
  const document = await repos.documents.create({
    type: "INVOICE",
    organizationId,
    clientId: client.id,
    documentNumber: 1,
    documentNumberPrefix: null,
    issueDate: new Date("2026-01-01"),
    subtotal: 10n,
    tax: 0n,
    total: 10n,
    lineItems: [
      {
        productId: product.id,
        quantity: "1",
        price: 10n,
        taxes: [],
        taxAmount: 0n,
        total: 10n,
      },
    ],
  });
  const invoice = await repos.invoices.create({ documentId: document.id, status: "draft" });

  return { ...base, invoiceId: invoice.id };
}

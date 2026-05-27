import type { Repositories } from "../../src/adapters/types";
import { randomUUID } from "node:crypto";

export interface Seeded {
  organizationId: string;
  userId: string;
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

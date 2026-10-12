import { Hono } from "hono";
import type { Repositories } from "../../src/adapters/types";
import { prismaAdapter } from "../../src/adapters/prisma";
import type { AuthContext } from "../../src/auth/types";
import type { InvoicingKitConfig } from "../../src/config";
import { randomUUID } from "node:crypto";
import { emptyTestDatabase } from "../support/test-database";
import { stubAuth, type StubSession } from "../support/stub-auth";

export interface HarnessOptions {
  basePath?: string;
  session?: StubSession;
  moneyPolicy?: InvoicingKitConfig["moneyPolicy"];
  exchangeRates?: InvoicingKitConfig["exchangeRates"];
}

export async function buildHarness(
  createInvoicingKit: (config: InvoicingKitConfig) => { router: any; services?: any; repos?: any },
  opts: HarnessOptions = {},
) {
  const prisma = await emptyTestDatabase();
  const adapter = prismaAdapter(prisma);

  const userId = opts.session?.user.id ?? randomUUID();
  const organizationId =
    opts.session?.session.activeOrganizationId ?? randomUUID();

  await (prisma as any).user.create({
    data: { id: userId, name: "Test User", email: `${userId}@test.local`, emailVerified: true },
  });
  await (prisma as any).organization.create({
    data: {
      id: organizationId,
      name: "Test Org",
      slug: `org-${organizationId.slice(0, 8)}`,
      createdAt: new Date(),
    },
  });
  await (prisma as any).member.create({
    data: { id: randomUUID(), organizationId, userId, role: "owner", createdAt: new Date() },
  });

  const session: StubSession = opts.session ?? {
    user: { id: userId },
    session: { activeOrganizationId: organizationId },
  };
  const auth = stubAuth(session);
  const kit = createInvoicingKit({
    adapter,
    auth,
    basePath: opts.basePath ?? "/api/bills",
    moneyPolicy: opts.moneyPolicy,
    exchangeRates: opts.exchangeRates,
  }) as { router: any; services?: any; repos?: any };

  const app = new Hono();
  app.route("/", kit.router);

  const ctx: AuthContext = { userId, organizationId, role: session.user.role ?? null };

  return {
    app,
    organizationId,
    userId,
    services: kit.services,
    repos: kit.repos,
    ctx,
    request: (input: string, init?: RequestInit) =>
      app.request(input, {
        ...init,
        headers: { ...(init?.headers ?? {}), "x-test-auth": userId },
      }),
  };
}

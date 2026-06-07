import { Hono } from "hono";
import type { Repositories } from "../../src/adapters/types";
import { prismaAdapter } from "../../src/adapters/prisma";
import type { BetterAuthLike } from "../../src/auth/middleware";
import type { AuthContext } from "../../src/auth/types";
import { randomUUID } from "node:crypto";

interface StubSession {
  user: { id: string; role?: string | null };
  session: { activeOrganizationId?: string | null };
}

export function stubAuth(session: StubSession | null): BetterAuthLike {
  return {
    api: {
      async getSession() {
        return session;
      },
    },
  };
}

let sharedPrisma: any;

async function getSharedPrisma(): Promise<any> {
  if (sharedPrisma) return sharedPrisma;
  // @ts-expect-error generated at test setup
  const { PrismaClient } = await import("../../src/generated/test-prisma/client.ts");
  // @ts-expect-error driver adapter
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const connectionString =
    process.env.INVOICING_KIT_TEST_DATABASE_URL ??
    "postgresql://test:test@localhost:5544/invoicing_kit_test";
  sharedPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return sharedPrisma;
}

export interface HarnessOptions {
  basePath?: string;
  session?: StubSession;
}

export async function buildHarness(
  createInvoicingKit: (config: {
    adapter: Repositories;
    auth: BetterAuthLike;
    basePath?: string;
  }) => { router: any },
  opts: HarnessOptions = {},
) {
  const prisma = await getSharedPrisma();
  const adapter = prismaAdapter(prisma);

  await (prisma as any).$executeRawUnsafe(`
    TRUNCATE TABLE
      "fiscal_documents",
      "document_line_item_taxes",
      "document_line_items",
      "document_payment_methods",
      "vendor_bill_payments",
      "vendor_bills",
      "payments",
      "payment_methods",
      "invoices",
      "quotes",
      "documents",
      "taxes",
      "products",
      "clients",
      "vendors",
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

const TEST_DATABASE_URL =
  process.env["INVOICING_KIT_TEST_DATABASE_URL"] ?? "postgresql://test:test@localhost:5544/invoicing_kit_test";

const BILLING_TABLES = [
  "notes",
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
  "user",
];

let client: any;

export async function testDatabaseClient(): Promise<any> {
  if (client) return client;
  const { PrismaClient } = await import("../../src/generated/test-prisma/client.ts");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
  return client;
}

export async function emptyTestDatabase(): Promise<any> {
  const prisma = await testDatabaseClient();
  const tables = BILLING_TABLES.map((table) => `"${table}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  return prisma;
}

export async function disconnectTestDatabase(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = undefined;
}

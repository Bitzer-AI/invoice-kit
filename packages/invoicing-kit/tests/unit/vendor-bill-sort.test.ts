import { describe, it, expect } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { Repositories } from "../../src/adapters/types";
import type { VendorBillStatus } from "../../src/types";

const ORG = "org1";

async function makeBill(
  repos: Repositories,
  opts: {
    total: bigint;
    status: VendorBillStatus;
    ncf: string;
    documentNumber: number;
    issueDate?: Date;
  },
) {
  return repos.tx(async (tx) => {
    const doc = await tx.documents.create({
      type: "VENDOR_BILL",
      organizationId: ORG,
      clientId: null,
      vendorId: "v1",
      externalDocumentNumber: opts.ncf,
      documentNumber: opts.documentNumber,
      issueDate: opts.issueDate ?? new Date("2026-01-15"),
      currency: "DOP",
      subtotal: opts.total,
      tax: 0n,
      total: opts.total,
      lineItems: [],
    });
    return tx.vendorBills.create({ documentId: doc.id, status: opts.status });
  });
}

describe("vendor bill list() sorting (memory)", () => {
  it("sorts by total ascending", async () => {
    const repos = inMemoryAdapter();
    await makeBill(repos, { total: 300n, status: "paid", ncf: "B0100000001", documentNumber: 1 });
    await makeBill(repos, { total: 100n, status: "draft", ncf: "B0100000002", documentNumber: 2 });
    await makeBill(repos, { total: 200n, status: "received", ncf: "B0100000003", documentNumber: 3 });

    const page = await repos.vendorBills.list({
      organizationId: ORG,
      sortBy: "total",
      sortDir: "asc",
    });

    expect(page.data.map((b) => b.document.total)).toEqual([100n, 200n, 300n]);
  });

  it("sorts by total descending", async () => {
    const repos = inMemoryAdapter();
    await makeBill(repos, { total: 300n, status: "paid", ncf: "B0100000001", documentNumber: 1 });
    await makeBill(repos, { total: 100n, status: "draft", ncf: "B0100000002", documentNumber: 2 });
    await makeBill(repos, { total: 200n, status: "received", ncf: "B0100000003", documentNumber: 3 });

    const page = await repos.vendorBills.list({
      organizationId: ORG,
      sortBy: "total",
      sortDir: "desc",
    });

    expect(page.data.map((b) => b.document.total)).toEqual([300n, 200n, 100n]);
  });

  it("sorts by status ascending (alphabetical)", async () => {
    const repos = inMemoryAdapter();
    await makeBill(repos, { total: 300n, status: "received", ncf: "B0100000001", documentNumber: 1 });
    await makeBill(repos, { total: 100n, status: "draft", ncf: "B0100000002", documentNumber: 2 });
    await makeBill(repos, { total: 200n, status: "paid", ncf: "B0100000003", documentNumber: 3 });

    const page = await repos.vendorBills.list({
      organizationId: ORG,
      sortBy: "status",
      sortDir: "asc",
    });

    expect(page.data.map((b) => b.status)).toEqual(["draft", "paid", "received"]);
  });

  it("defaults to issueDate desc when no sortBy is given (matches prisma adapter)", async () => {
    const repos = inMemoryAdapter();
    await makeBill(repos, {
      total: 300n,
      status: "paid",
      ncf: "B0100000001",
      documentNumber: 1,
      issueDate: new Date("2026-01-10"),
    });
    await makeBill(repos, {
      total: 100n,
      status: "draft",
      ncf: "B0100000002",
      documentNumber: 2,
      issueDate: new Date("2026-03-15"),
    });
    await makeBill(repos, {
      total: 200n,
      status: "received",
      ncf: "B0100000003",
      documentNumber: 3,
      issueDate: new Date("2026-02-20"),
    });

    const page = await repos.vendorBills.list({ organizationId: ORG });

    // Newest issueDate first (issueDate desc default, consistent with the prisma adapter).
    expect(page.data.map((b) => b.document.issueDate.toISOString().slice(0, 10))).toEqual([
      "2026-03-15",
      "2026-02-20",
      "2026-01-10",
    ]);
    expect(page.pageInfo.totalCount).toBe(3);
  });
});

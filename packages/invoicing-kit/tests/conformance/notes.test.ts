// tests/conformance/notes.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";

// Seed a referenced INVOICE (with a client) through the repos.
async function createInvoiceFixture(
  ctx: { repos: any },
  organizationId: string,
  overrides: Partial<{ clientId: string; clientName: string }> = {},
) {
  const clientId =
    overrides.clientId ??
    (
      await ctx.repos.clients.create({
        organizationId,
        name: overrides.clientName ?? "Test client",
      })
    ).id;
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Invoice product",
    price: "100.00",
  });
  const document = await ctx.repos.documents.create({
    type: "INVOICE",
    organizationId,
    clientId,
    documentNumber: 1,
    documentNumberPrefix: null,
    issueDate: new Date("2026-01-15"),
    subtotal: 100n,
    tax: 0n,
    total: 100n,
    lineItems: [
      { productId: product.id, quantity: "1", price: 100n, taxes: [], taxAmount: 0n, total: 100n },
    ],
  });
  await ctx.repos.invoices.create({ documentId: document.id, status: "draft" });
  return { clientId, document };
}

// Seed a referenced VENDOR_BILL (with a vendor) through the repos.
async function createVendorBillFixture(
  ctx: { repos: any },
  organizationId: string,
  overrides: Partial<{ vendorId: string; vendorName: string }> = {},
) {
  const vendorId =
    overrides.vendorId ??
    (
      await ctx.repos.vendors.create({
        organizationId,
        name: overrides.vendorName ?? "Test vendor",
      })
    ).id;
  const product = await ctx.repos.products.create({
    organizationId,
    name: "Bill product",
    price: "100.00",
  });
  const document = await ctx.repos.documents.create({
    type: "VENDOR_BILL",
    organizationId,
    vendorId,
    documentNumber: 1,
    documentNumberPrefix: null,
    issueDate: new Date("2026-01-15"),
    subtotal: 100n,
    tax: 0n,
    total: 100n,
    lineItems: [
      { productId: product.id, quantity: "1", price: 100n, taxes: [], taxAmount: 0n, total: 100n },
    ],
  });
  await ctx.repos.vendorBills.create({ documentId: document.id, status: "draft" });
  return { vendorId, document };
}

// Create a note Document + Note row directly via the repos (mirrors what the
// service does, but without the domain layer — conformance tests the repos).
async function createNoteFixture(
  ctx: { repos: any },
  organizationId: string,
  args: {
    type: "CREDIT_NOTE" | "DEBIT_NOTE";
    referencedDocumentId: string;
    clientId?: string | null;
    vendorId?: string | null;
    status?: "draft" | "issued";
    issueDate?: Date;
    total?: bigint;
    documentNumber?: number;
    productId?: string;
  },
) {
  const productId =
    args.productId ??
    (
      await ctx.repos.products.create({
        organizationId,
        name: "Note product",
        price: "10.00",
      })
    ).id;
  const total = args.total ?? 50n;
  const document = await ctx.repos.documents.create({
    type: args.type,
    organizationId,
    clientId: args.clientId ?? null,
    vendorId: args.vendorId ?? null,
    referencedDocumentId: args.referencedDocumentId,
    documentNumber: args.documentNumber ?? 1,
    documentNumberPrefix: null,
    issueDate: args.issueDate ?? new Date("2026-02-01"),
    subtotal: total,
    tax: 0n,
    total,
    lineItems: [
      { productId, quantity: "1", price: total, taxes: [], taxAmount: 0n, total },
    ],
  });
  const note = await ctx.repos.notes.create({
    documentId: document.id,
    status: args.status ?? "draft",
  });
  return { note, document, productId };
}

describeForEachAdapter("NoteRepository", allFactories, (ctx) => {
  test("create sales credit note (clientId + referenced INVOICE) and findById returns it", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const { note } = await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
    });

    const found = await ctx.repos.notes.findById(note.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.status).toBe("draft");
    expect(found!.document.type).toBe("CREDIT_NOTE");
    expect(found!.document.clientId).toBe(clientId);
    expect(found!.document.referencedDocumentId).toBe(invoice.id);
    expect(found!.document.lineItems).toHaveLength(1);
  });

  test("create purchase debit note (vendorId + referenced VENDOR_BILL) -> type DEBIT_NOTE", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { vendorId, document: bill } = await createVendorBillFixture(ctx, organizationId);
    const { note } = await createNoteFixture(ctx, organizationId, {
      type: "DEBIT_NOTE",
      referencedDocumentId: bill.id,
      vendorId,
    });

    const found = await ctx.repos.notes.findById(note.id, organizationId);
    expect(found).not.toBeNull();
    expect(found!.document.type).toBe("DEBIT_NOTE");
    expect(found!.document.vendorId).toBe(vendorId);
    expect(found!.document.referencedDocumentId).toBe(bill.id);
  });

  test("list filters by type", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const { vendorId, document: bill } = await createVendorBillFixture(ctx, organizationId);
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
    });
    await createNoteFixture(ctx, organizationId, {
      type: "DEBIT_NOTE",
      referencedDocumentId: bill.id,
      vendorId,
    });

    const credits = await ctx.repos.notes.list({ organizationId, type: "CREDIT_NOTE" });
    expect(credits.data).toHaveLength(1);
    expect(credits.data[0]!.document.type).toBe("CREDIT_NOTE");

    const debits = await ctx.repos.notes.list({ organizationId, type: "DEBIT_NOTE" });
    expect(debits.data).toHaveLength(1);
    expect(debits.data[0]!.document.type).toBe("DEBIT_NOTE");

    const all = await ctx.repos.notes.list({ organizationId });
    expect(all.data).toHaveLength(2);
  });

  test("list filters by status", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
      status: "draft",
    });
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
      status: "issued",
      documentNumber: 2,
    });

    const issued = await ctx.repos.notes.list({ organizationId, status: "issued" });
    expect(issued.data).toHaveLength(1);
    expect(issued.data[0]!.status).toBe("issued");
  });

  test("list filters by clientId and vendorId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const { vendorId, document: bill } = await createVendorBillFixture(ctx, organizationId);
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
    });
    await createNoteFixture(ctx, organizationId, {
      type: "DEBIT_NOTE",
      referencedDocumentId: bill.id,
      vendorId,
    });

    const byClient = await ctx.repos.notes.list({ organizationId, clientId });
    expect(byClient.data).toHaveLength(1);
    expect(byClient.data[0]!.document.clientId).toBe(clientId);

    const byVendor = await ctx.repos.notes.list({ organizationId, vendorId });
    expect(byVendor.data).toHaveLength(1);
    expect(byVendor.data[0]!.document.vendorId).toBe(vendorId);
  });

  test("list filters by party (CLIENT/VENDOR) independent of credit/debit type", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const { vendorId, document: bill } = await createVendorBillFixture(ctx, organizationId);
    // All four combinations: both types on both parties.
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
    });
    await createNoteFixture(ctx, organizationId, {
      type: "DEBIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
    });
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: bill.id,
      vendorId,
    });
    await createNoteFixture(ctx, organizationId, {
      type: "DEBIT_NOTE",
      referencedDocumentId: bill.id,
      vendorId,
    });

    const clientNotes = await ctx.repos.notes.list({ organizationId, party: "CLIENT" });
    expect(clientNotes.data).toHaveLength(2);
    expect(clientNotes.data.every((note: any) => note.document.clientId === clientId)).toBe(true);

    const vendorNotes = await ctx.repos.notes.list({ organizationId, party: "VENDOR" });
    expect(vendorNotes.data).toHaveLength(2);
    expect(vendorNotes.data.every((note: any) => note.document.vendorId === vendorId)).toBe(true);
  });

  test("list filters by referencedDocumentId", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoiceA } = await createInvoiceFixture(ctx, organizationId, {
      clientName: "Client A",
    });
    const { clientId: clientB, document: invoiceB } = await createInvoiceFixture(
      ctx,
      organizationId,
      { clientName: "Client B" },
    );
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoiceA.id,
      clientId,
    });
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoiceB.id,
      clientId: clientB,
    });

    const byRef = await ctx.repos.notes.list({
      organizationId,
      referencedDocumentId: invoiceA.id,
    });
    expect(byRef.data).toHaveLength(1);
    expect(byRef.data[0]!.document.referencedDocumentId).toBe(invoiceA.id);
  });

  test("list sorts by issueDate asc and desc", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const mk = (issueDate: Date, documentNumber: number) =>
      createNoteFixture(ctx, organizationId, {
        type: "CREDIT_NOTE",
        referencedDocumentId: invoice.id,
        clientId,
        issueDate,
        documentNumber,
      });
    await mk(new Date("2026-03-10"), 1);
    await mk(new Date("2026-01-10"), 2);
    await mk(new Date("2026-02-10"), 3);

    const asc = await ctx.repos.notes.list({ organizationId, sortBy: "issueDate", sortDir: "asc" });
    expect(asc.data.map((n: any) => n.document.issueDate.toISOString())).toEqual([
      new Date("2026-01-10").toISOString(),
      new Date("2026-02-10").toISOString(),
      new Date("2026-03-10").toISOString(),
    ]);

    const desc = await ctx.repos.notes.list({
      organizationId,
      sortBy: "issueDate",
      sortDir: "desc",
    });
    expect(desc.data.map((n: any) => n.document.issueDate.toISOString())).toEqual([
      new Date("2026-03-10").toISOString(),
      new Date("2026-02-10").toISOString(),
      new Date("2026-01-10").toISOString(),
    ]);
  });

  test("list sorts by total asc and desc", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const mk = (total: bigint, documentNumber: number) =>
      createNoteFixture(ctx, organizationId, {
        type: "CREDIT_NOTE",
        referencedDocumentId: invoice.id,
        clientId,
        total,
        documentNumber,
      });
    await mk(300n, 1);
    await mk(100n, 2);
    await mk(200n, 3);

    const asc = await ctx.repos.notes.list({ organizationId, sortBy: "total", sortDir: "asc" });
    expect(asc.data.map((n: any) => n.document.total)).toEqual([100n, 200n, 300n]);

    const desc = await ctx.repos.notes.list({ organizationId, sortBy: "total", sortDir: "desc" });
    expect(desc.data.map((n: any) => n.document.total)).toEqual([300n, 200n, 100n]);
  });

  test("list sorts by status asc and desc", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
      status: "issued",
      documentNumber: 1,
    });
    await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
      status: "draft",
      documentNumber: 2,
    });

    const asc = await ctx.repos.notes.list({ organizationId, sortBy: "status", sortDir: "asc" });
    expect(asc.data.map((n: any) => n.status)).toEqual(["draft", "issued"]);

    const desc = await ctx.repos.notes.list({ organizationId, sortBy: "status", sortDir: "desc" });
    expect(desc.data.map((n: any) => n.status)).toEqual(["issued", "draft"]);
  });

  test("update patches status draft->issued", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const { note } = await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
      status: "draft",
    });
    const updated = await ctx.repos.notes.update(note.id, organizationId, { status: "issued" });
    expect(updated.status).toBe("issued");
    const found = await ctx.repos.notes.findById(note.id, organizationId);
    expect(found!.status).toBe("issued");
  });

  test("delete removes the note (findById -> null)", async () => {
    const { organizationId } = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, organizationId);
    const { note } = await createNoteFixture(ctx, organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
    });
    await ctx.repos.notes.delete(note.id, organizationId);
    expect(await ctx.repos.notes.findById(note.id, organizationId)).toBeNull();
  });

  test("findById is org-scoped (returns null for other org)", async () => {
    const a = await seed(ctx.repos);
    const b = await seed(ctx.repos);
    const { clientId, document: invoice } = await createInvoiceFixture(ctx, a.organizationId);
    const { note } = await createNoteFixture(ctx, a.organizationId, {
      type: "CREDIT_NOTE",
      referencedDocumentId: invoice.id,
      clientId,
    });
    expect(await ctx.repos.notes.findById(note.id, b.organizationId)).toBeNull();
  });
});

import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";
import { inMemoryAdapter } from "../../src/adapters/memory";
import type { InvoicingKitHooks } from "../../src/config";
import type { AuthContext } from "../../src/auth/types";
import { randomUUID } from "node:crypto";

type Request = (input: string, init?: RequestInit) => Promise<Response>;

async function json(res: Response): Promise<any> {
  return res.json();
}

async function makeClient(request: Request, name = "Cliente SRL"): Promise<string> {
  const res = await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await json(res)).id as string;
}

async function makeVendor(request: Request, name = "Proveedor SRL"): Promise<string> {
  const res = await request("/api/bills/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, taxId: "130000001", taxIdType: "RNC" }),
  });
  return (await json(res)).id as string;
}

// Creates an invoice via HTTP; returns its underlying Document id (the note's reference target).
async function makeInvoiceDocId(request: Request, clientId: string): Promise<string> {
  const res = await request("/api/bills/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      issueDate: "2026-01-01",
      lineItems: [{ source: { type: "experience", id: "exp1", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] }],
    }),
  });
  return (await json(res)).documentId as string;
}

// Creates a vendor bill via HTTP; returns its underlying Document id.
async function makeVendorBillDocId(request: Request, vendorId: string): Promise<string> {
  const res = await request("/api/bills/vendor-bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorId,
      externalDocumentNumber: "B0100000001",
      issueDate: "2026-01-01",
      status: "received",
      lineItems: [{ source: { type: "expense", id: "e1", name: "Servicio" }, quantity: "1", price: "100000", taxIds: [] }],
    }),
  });
  return (await json(res)).documentId as string;
}

const creditLine = () => ({
  source: { type: "experience", id: "exp1", name: "Tour" },
  quantity: "1",
  price: "20000",
  taxIds: [] as string[],
});

describe("notes integration", () => {
  test("POST /notes creates a sales credit note (clientId + referenced invoice) -> 201", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const refDocId = await makeInvoiceDocId(request, clientId);

    const res = await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "CREDIT",
        referencedDocumentId: refDocId,
        clientId,
        issueDate: "2026-02-01",
        currency: "DOP",
        lineItems: [creditLine()],
      }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.document.type).toBe("CREDIT_NOTE");
    expect(body.document.clientId).toBe(clientId);
    expect(body.document.vendorId).toBeNull();
    expect(body.document.referencedDocumentId).toBe(refDocId);
    expect(body.document.total).toBe("20000");
    expect(body.document.currency).toBe("DOP");
  });

  test("POST /notes creates a purchase debit note (vendorId + referenced vendor bill) -> 201, DEBIT_NOTE", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const vendorId = await makeVendor(request);
    const refDocId = await makeVendorBillDocId(request, vendorId);

    const res = await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "DEBIT",
        referencedDocumentId: refDocId,
        vendorId,
        issueDate: "2026-02-01",
        lineItems: [{ source: { type: "expense", id: "e1", name: "Servicio" }, quantity: "1", price: "20000", taxIds: [] }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.document.type).toBe("DEBIT_NOTE");
    expect(body.document.vendorId).toBe(vendorId);
    expect(body.document.clientId).toBeNull();
    expect(body.document.referencedDocumentId).toBe(refDocId);
  });

  test("POST /notes with BOTH clientId and vendorId -> 400 (party invariant)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const vendorId = await makeVendor(request);
    const refDocId = await makeInvoiceDocId(request, clientId);

    const res = await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "CREDIT",
        referencedDocumentId: refDocId,
        clientId,
        vendorId,
        issueDate: "2026-02-01",
        lineItems: [creditLine()],
      }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /notes with neither clientId nor vendorId -> 400", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const refDocId = await makeInvoiceDocId(request, clientId);

    const res = await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "CREDIT",
        referencedDocumentId: refDocId,
        issueDate: "2026-02-01",
        lineItems: [creditLine()],
      }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /notes referencing a non-existent document -> 404", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);

    const res = await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "CREDIT",
        referencedDocumentId: randomUUID(),
        clientId,
        issueDate: "2026-02-01",
        lineItems: [creditLine()],
      }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /notes (clientId) referencing a VENDOR_BILL -> 400 (DocumentPartyInvalid)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const vendorId = await makeVendor(request);
    const billDocId = await makeVendorBillDocId(request, vendorId);

    const res = await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "CREDIT",
        referencedDocumentId: billDocId,
        clientId,
        issueDate: "2026-02-01",
        lineItems: [creditLine()],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("DOCUMENT_PARTY_INVALID");
  });

  test("POST /notes referencing another note -> 400 (NoteReferencesNote)", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const refDocId = await makeInvoiceDocId(request, clientId);

    // Create a first note, then reference its document.
    const first = await json(
      await request("/api/bills/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType: "CREDIT",
          referencedDocumentId: refDocId,
          clientId,
          issueDate: "2026-02-01",
          lineItems: [creditLine()],
        }),
      }),
    );

    const res = await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "CREDIT",
        referencedDocumentId: first.documentId,
        clientId,
        issueDate: "2026-02-02",
        lineItems: [creditLine()],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("NOTE_REFERENCES_NOTE");
  });

  test("GET /notes filters by type and referencedDocumentId", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const vendorId = await makeVendor(request);
    const invoiceDocId = await makeInvoiceDocId(request, clientId);
    const billDocId = await makeVendorBillDocId(request, vendorId);

    await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "CREDIT",
        referencedDocumentId: invoiceDocId,
        clientId,
        issueDate: "2026-02-01",
        lineItems: [creditLine()],
      }),
    });
    await request("/api/bills/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteType: "DEBIT",
        referencedDocumentId: billDocId,
        vendorId,
        issueDate: "2026-02-01",
        lineItems: [{ source: { type: "expense", id: "e1", name: "Servicio" }, quantity: "1", price: "20000", taxIds: [] }],
      }),
    });

    const byType = await json(await request("/api/bills/notes?type=CREDIT_NOTE"));
    expect(byType.data).toHaveLength(1);
    expect(byType.data[0].document.type).toBe("CREDIT_NOTE");

    const byRef = await json(
      await request(`/api/bills/notes?referencedDocumentId=${billDocId}`),
    );
    expect(byRef.data).toHaveLength(1);
    expect(byRef.data[0].document.referencedDocumentId).toBe(billDocId);
  });

  test("PATCH /notes/{id} updates status draft->issued", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const refDocId = await makeInvoiceDocId(request, clientId);
    const created = await json(
      await request("/api/bills/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType: "CREDIT",
          referencedDocumentId: refDocId,
          clientId,
          issueDate: "2026-02-01",
          status: "draft",
          lineItems: [creditLine()],
        }),
      }),
    );
    expect(created.status).toBe("draft");

    const res = await request(`/api/bills/notes/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "issued" }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).status).toBe("issued");
  });

  test("DELETE /notes/{id} -> 204, then GET -> 404", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(request);
    const refDocId = await makeInvoiceDocId(request, clientId);
    const created = await json(
      await request("/api/bills/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType: "CREDIT",
          referencedDocumentId: refDocId,
          clientId,
          issueDate: "2026-02-01",
          lineItems: [creditLine()],
        }),
      }),
    );

    const del = await request(`/api/bills/notes/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const got = await request(`/api/bills/notes/${created.id}`);
    expect(got.status).toBe(404);
  });

  test("cross-org: org A cannot fetch/update/delete org B's note (-> 404)", async () => {
    const a = await buildHarness(createInvoicingKit);
    const clientId = await makeClient(a.request);
    const refDocId = await makeInvoiceDocId(a.request, clientId);
    const noteA = await json(
      await a.request("/api/bills/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType: "CREDIT",
          referencedDocumentId: refDocId,
          clientId,
          issueDate: "2026-02-01",
          lineItems: [creditLine()],
        }),
      }),
    );

    const ctxB: AuthContext = { userId: randomUUID(), organizationId: randomUUID(), role: "owner" };
    await expect(a.services.notes.findById(noteA.id, ctxB)).rejects.toMatchObject({ status: 404 });
    await expect(
      a.services.notes.update(noteA.id, { status: "issued" }, ctxB),
    ).rejects.toMatchObject({ status: 404 });
    await expect(a.services.notes.delete(noteA.id, ctxB)).rejects.toMatchObject({ status: 404 });

    // Org A's note untouched.
    const stillThere = await a.request(`/api/bills/notes/${noteA.id}`);
    expect(stillThere.status).toBe(200);
  });

  describe("onNoteRecorded hook (in-memory)", () => {
    const ctx: AuthContext = { userId: "u1", organizationId: "org1", role: "owner" };

    function makeKit(hooks: InvoicingKitHooks) {
      const repos = inMemoryAdapter();
      return createInvoicingKit({ adapter: repos, auth: {} as never, hooks });
    }

    const noteBody = (clientId: string, referencedDocumentId: string) => ({
      noteType: "CREDIT" as const,
      referencedDocumentId,
      clientId,
      issueDate: "2026-02-01",
      lineItems: [creditLine()],
    });

    test("create with status 'issued' fires onNoteRecorded once with {organizationId, noteId}", async () => {
      const recorded: Array<{ organizationId: string; noteId: string }> = [];
      const k = makeKit({ onNoteRecorded: (c) => void recorded.push(c) });
      const client = await k.services.clients.create({ name: "Cliente" }, ctx);
      const inv = await k.services.invoices.create(
        {
          clientId: client.id,
          issueDate: "2026-01-01",
          lineItems: [{ source: { type: "experience", id: "exp1", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] }],
        } as any,
        ctx,
      );
      const note = await k.services.notes.create(
        { ...noteBody(client.id, inv.documentId), status: "issued" },
        ctx,
      );
      expect(recorded).toEqual([{ organizationId: "org1", noteId: note.id }]);
    });

    test("create draft then PATCH->issued fires once on the transition", async () => {
      const recorded: Array<{ organizationId: string; noteId: string }> = [];
      const k = makeKit({ onNoteRecorded: (c) => void recorded.push(c) });
      const client = await k.services.clients.create({ name: "Cliente" }, ctx);
      const inv = await k.services.invoices.create(
        {
          clientId: client.id,
          issueDate: "2026-01-01",
          lineItems: [{ source: { type: "experience", id: "exp1", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] }],
        } as any,
        ctx,
      );
      const note = await k.services.notes.create(
        { ...noteBody(client.id, inv.documentId), status: "draft" },
        ctx,
      );
      expect(recorded).toEqual([]);
      await k.services.notes.update(note.id, { status: "issued" }, ctx);
      expect(recorded).toEqual([{ organizationId: "org1", noteId: note.id }]);
      // A no-op subsequent update does not re-fire.
      await k.services.notes.update(note.id, { status: "issued" }, ctx);
      expect(recorded).toEqual([{ organizationId: "org1", noteId: note.id }]);
    });

    test("create draft then GET does not fire", async () => {
      const recorded: unknown[] = [];
      const k = makeKit({ onNoteRecorded: (c) => void recorded.push(c) });
      const client = await k.services.clients.create({ name: "Cliente" }, ctx);
      const inv = await k.services.invoices.create(
        {
          clientId: client.id,
          issueDate: "2026-01-01",
          lineItems: [{ source: { type: "experience", id: "exp1", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] }],
        } as any,
        ctx,
      );
      const note = await k.services.notes.create(
        { ...noteBody(client.id, inv.documentId), status: "draft" },
        ctx,
      );
      await k.services.notes.findById(note.id, ctx);
      expect(recorded).toEqual([]);
    });

    test("a throwing handler does not fail create (note still persisted)", async () => {
      const k = makeKit({ onNoteRecorded: () => { throw new Error("boom"); } });
      const client = await k.services.clients.create({ name: "Cliente" }, ctx);
      const inv = await k.services.invoices.create(
        {
          clientId: client.id,
          issueDate: "2026-01-01",
          lineItems: [{ source: { type: "experience", id: "exp1", name: "Tour" }, quantity: "1", price: "100000", taxIds: [] }],
        } as any,
        ctx,
      );
      const note = await k.services.notes.create(
        { ...noteBody(client.id, inv.documentId), status: "issued" },
        ctx,
      );
      expect(note.id).toBeTruthy();
      const found = await k.services.notes.findById(note.id, ctx);
      expect(found.id).toBe(note.id);
    });
  });
});

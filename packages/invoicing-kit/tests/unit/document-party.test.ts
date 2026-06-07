import { describe, it, expect } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";

describe("Document party fields (memory)", () => {
  it("round-trips a vendor-bill document: vendorId set, clientId null, externalDocumentNumber set", async () => {
    const repos = inMemoryAdapter();
    const doc = await repos.tx((tx) =>
      tx.documents.create({
        type: "VENDOR_BILL",
        organizationId: "org1",
        clientId: null,
        vendorId: "v1",
        externalDocumentNumber: "B0100000123",
        documentNumber: 1,
        issueDate: new Date("2026-01-15"),
        currency: "DOP",
        subtotal: 100000n,
        tax: 18000n,
        total: 118000n,
        lineItems: [],
      }),
    );
    expect(doc.vendorId).toBe("v1");
    expect(doc.clientId).toBeNull();
    expect(doc.externalDocumentNumber).toBe("B0100000123");
    expect(doc.type).toBe("VENDOR_BILL");
  });
});

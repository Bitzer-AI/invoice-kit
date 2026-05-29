import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seedWithInvoice } from "./seed";

describeForEachAdapter("FiscalDocumentRepository", allFactories, (ctx) => {
  test("upsertByInvoice creates then findByInvoice returns it", async () => {
    const { invoiceId } = await seedWithInvoice(ctx.repos);
    const created = await ctx.repos.fiscalDocuments.upsertByInvoice({
      invoiceId,
      provider: "dgii",
      status: "pending",
      documentType: "31",
    });
    expect(created.invoiceId).toBe(invoiceId);
    expect(created.provider).toBe("dgii");
    expect(created.status).toBe("pending");
    const found = await ctx.repos.fiscalDocuments.findByInvoice(invoiceId);
    expect(found).toMatchObject({ invoiceId, documentType: "31" });
  });

  test("upsertByInvoice is idempotent on invoiceId (updates, no duplicate)", async () => {
    const { invoiceId } = await seedWithInvoice(ctx.repos);
    await ctx.repos.fiscalDocuments.upsertByInvoice({ invoiceId, provider: "dgii" });
    const again = await ctx.repos.fiscalDocuments.upsertByInvoice({
      invoiceId,
      provider: "dgii",
      status: "accepted",
    });
    expect(again.status).toBe("accepted");
  });

  test("update mutates status and fiscalId", async () => {
    const { invoiceId } = await seedWithInvoice(ctx.repos);
    await ctx.repos.fiscalDocuments.upsertByInvoice({ invoiceId, provider: "dgii" });
    const updated = await ctx.repos.fiscalDocuments.update(invoiceId, {
      status: "accepted",
      fiscalId: "E310005000099",
      trackId: "TRK1",
    });
    expect(updated.status).toBe("accepted");
    expect(updated.fiscalId).toBe("E310005000099");
  });

  test("findByInvoice returns null when none", async () => {
    const found = await ctx.repos.fiscalDocuments.findByInvoice("missing-invoice-id");
    expect(found).toBeNull();
  });
});

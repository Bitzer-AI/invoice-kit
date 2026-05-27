import { test, expect, describe } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

// Helper: create prerequisites (client, product) and return their IDs.
async function createPrereqs(request: (input: string, init?: RequestInit) => Promise<Response>) {
  const clientRes = await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Payment Client" }),
  });
  const client = await clientRes.json();

  const productRes = await request("/api/bills/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Widget", price: "100.00" }),
  });
  const product = await productRes.json();

  return { clientId: client.id as string, productId: product.id as string };
}

// Helper: create an invoice with a single line item of the given price (no tax).
// Returns the parsed invoice body.
async function createInvoice(
  request: (input: string, init?: RequestInit) => Promise<Response>,
  clientId: string,
  productId: string,
  price: string,
) {
  const res = await request("/api/bills/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      issueDate: "2025-01-01",
      status: "sent",
      lineItems: [{ productId, quantity: "1", price, taxIds: [] }],
    }),
  });
  return res.json();
}

describe("payments integration", () => {
  test("full payment sets invoice status to 'paid' and paidDate", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const invoice = await createInvoice(request, clientId, productId, "10000");
    expect(invoice.document.total).toBe("10000");

    const res = await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: "10000",
        currency: "USD",
        provider: "MANUAL",
      }),
    });

    expect(res.status).toBe(201);
    const payment = await res.json();
    expect(payment.id).toBeTruthy();
    expect(payment.amount).toBe("10000");
    expect(payment.status).toBe("succeeded");
    expect(payment.provider).toBe("MANUAL");

    // Invoice should now be paid
    const invoiceRes = await request(`/api/bills/invoices/${invoice.id}`);
    const updatedInvoice = await invoiceRes.json();
    expect(updatedInvoice.status).toBe("paid");
    expect(updatedInvoice.paidDate).not.toBeNull();
  });

  test("partial payment sets invoice status to 'partially_paid' with no paidDate", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const invoice = await createInvoice(request, clientId, productId, "10000");

    const res = await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: "4000",
        currency: "USD",
        provider: "MANUAL",
      }),
    });

    expect(res.status).toBe(201);

    const invoiceRes = await request(`/api/bills/invoices/${invoice.id}`);
    const updatedInvoice = await invoiceRes.json();
    expect(updatedInvoice.status).toBe("partially_paid");
    expect(updatedInvoice.paidDate).toBeNull();
  });

  test("two payments that together equal total sets invoice to 'paid'", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const invoice = await createInvoice(request, clientId, productId, "10000");

    // First partial payment
    await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: "4000",
        currency: "USD",
        provider: "MANUAL",
      }),
    });

    // Second payment completing the balance
    const res = await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: "6000",
        currency: "USD",
        provider: "MANUAL",
      }),
    });

    expect(res.status).toBe(201);

    const invoiceRes = await request(`/api/bills/invoices/${invoice.id}`);
    const updatedInvoice = await invoiceRes.json();
    expect(updatedInvoice.status).toBe("paid");
    expect(updatedInvoice.paidDate).not.toBeNull();
  });

  test("overpayment returns 400 with PAYMENT_AMOUNT_EXCEEDS_INVOICE_TOTAL", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const invoice = await createInvoice(request, clientId, productId, "10000");

    const res = await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: "15000",
        currency: "USD",
        provider: "MANUAL",
      }),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("PAYMENT_AMOUNT_EXCEEDS_INVOICE_TOTAL");
  });

  test("GET /invoices/{id}/payments lists all payments for an invoice", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const invoice = await createInvoice(request, clientId, productId, "10000");

    // Record two payments
    await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "3000", currency: "USD", provider: "MANUAL" }),
    });
    await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "2000", currency: "USD", provider: "MANUAL" }),
    });

    const listRes = await request(`/api/bills/invoices/${invoice.id}/payments`);
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.every((p: any) => p.invoiceId === invoice.id)).toBe(true);
  });

  test("DELETE /payments/{id} recalculates invoice status back to 'sent'", async () => {
    const { request } = await buildHarness(createInvoicingKit);
    const { clientId, productId } = await createPrereqs(request);

    const invoice = await createInvoice(request, clientId, productId, "10000");

    // Fully pay the invoice
    const payRes = await request(`/api/bills/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10000", currency: "USD", provider: "MANUAL" }),
    });
    const payment = await payRes.json();

    // Verify it's paid
    const before = await (await request(`/api/bills/invoices/${invoice.id}`)).json();
    expect(before.status).toBe("paid");

    // Void the payment
    const delRes = await request(`/api/bills/payments/${payment.id}`, { method: "DELETE" });
    expect(delRes.status).toBe(204);

    // Invoice should recalculate to 'sent' (no remaining payments)
    const after = await (await request(`/api/bills/invoices/${invoice.id}`)).json();
    expect(after.status).toBe("sent");
    expect(after.paidDate).toBeNull();
  });
});

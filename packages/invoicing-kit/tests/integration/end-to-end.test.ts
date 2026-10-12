import { test, expect } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

test("full invoicing flow: client → product → tax → quote → accept → invoice → issue → payment", async () => {
  const { request } = await buildHarness(createInvoicingKit);

  const clientRes = await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Client" }),
  });
  const client = await clientRes.json();
  expect(client.id).toBeTruthy();

  const productRes = await request("/api/bills/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Service", price: "100.00" }),
  });
  const product = await productRes.json();
  expect(product.id).toBeTruthy();

  const taxRes = await request("/api/bills/taxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "VAT", type: "PERCENTAGE", rate: "0.2100" }),
  });
  const tax = await taxRes.json();
  expect(tax.id).toBeTruthy();

  const quoteRes = await request("/api/bills/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: client.id,
      issueDate: "2026-01-15",
      lineItems: [
        { productId: product.id, quantity: "1", price: "10000", taxIds: [tax.id] },
      ],
    }),
  });
  const quote = await quoteRes.json();
  expect(quote.id).toBeTruthy();
  expect(quote.status).toBe("draft");
  expect(quote.document.total).toBe("12100");

  const acceptRes = await request(`/api/bills/quotes/${quote.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "accepted" }),
  });
  expect(acceptRes.status).toBe(200);
  expect((await acceptRes.json()).status).toBe("accepted");

  const invoiceRes = await request(`/api/bills/invoices/from-quote/${quote.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(invoiceRes.status).toBe(201);
  const invoice = await invoiceRes.json();
  expect(invoice.id).toBeTruthy();
  expect(invoice.document.total).toBe("12100");
  expect(invoice.status).toBe("draft");
  expect(invoice.document.documentNumber).toBeNull();
  expect(invoice.convertedFromQuoteId).toBe(quote.id);

  const issueRes = await request(`/api/bills/invoices/${invoice.id}/issue`, { method: "POST" });
  expect(issueRes.status).toBe(200);
  const issued = await issueRes.json();
  expect(issued.status).toBe("issued");
  expect(issued.document.documentNumber).toBe(1);

  const paymentRes = await request(`/api/bills/invoices/${invoice.id}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: "12100",
      currency: "USD",
      provider: "MANUAL",
    }),
  });
  expect(paymentRes.status).toBe(201);
  const payment = await paymentRes.json();
  expect(payment.amount).toBe("12100");
  expect(payment.status).toBe("succeeded");

  const invoiceCheckRes = await request(`/api/bills/invoices/${invoice.id}`);
  const refetchedInvoice = await invoiceCheckRes.json();
  expect(refetchedInvoice.status).toBe("paid");
  expect(refetchedInvoice.paidDate).toBeTruthy();
  expect(refetchedInvoice.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const quoteCheckRes = await request(`/api/bills/quotes/${quote.id}`);
  const refetchedQuote = await quoteCheckRes.json();
  expect(refetchedQuote.status).toBe("converted");
});

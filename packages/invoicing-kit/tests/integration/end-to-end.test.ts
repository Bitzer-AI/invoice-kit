import { test, expect } from "vitest";
import { buildHarness } from "./harness";
import { createInvoicingKit } from "../../src/create";

test("full invoicing flow: client → product → tax → quote → invoice → payment", async () => {
  const { request } = await buildHarness(createInvoicingKit);

  // 1. Create client
  const clientRes = await request("/api/bills/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Client" }),
  });
  const client = await clientRes.json();
  expect(client.id).toBeTruthy();

  // 2. Create product
  const productRes = await request("/api/bills/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Service", price: "100.00" }),
  });
  const product = await productRes.json();
  expect(product.id).toBeTruthy();

  // 3. Create tax
  const taxRes = await request("/api/bills/taxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "VAT", type: "PERCENTAGE", rate: "0.2100" }),
  });
  const tax = await taxRes.json();
  expect(tax.id).toBeTruthy();

  // 4. Create quote
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
  expect(quote.document.total).toBe("12100"); // 10000 + 2100 tax

  // 5. Convert quote to invoice
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
  expect(invoice.convertedFromQuoteId).toBe(quote.id);

  // 6. Record full payment
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

  // 7. Verify invoice is now paid
  const invoiceCheckRes = await request(`/api/bills/invoices/${invoice.id}`);
  const refetchedInvoice = await invoiceCheckRes.json();
  expect(refetchedInvoice.status).toBe("paid");
  expect(refetchedInvoice.paidDate).toBeTruthy();
  expect(refetchedInvoice.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // 8. Verify the original quote is converted
  const quoteCheckRes = await request(`/api/bills/quotes/${quote.id}`);
  const refetchedQuote = await quoteCheckRes.json();
  expect(refetchedQuote.status).toBe("converted");
});

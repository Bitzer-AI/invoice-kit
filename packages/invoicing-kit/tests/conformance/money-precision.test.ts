import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { parsedBody, seededKit, type SeededKit } from "./kit";
import { invoiceResponse } from "../../src/domains/invoices/validation";
import { productListResponse, productResponse } from "../../src/domains/products/validation";
import { taxListResponse, taxResponse } from "../../src/domains/taxes/validation";
import { canonicalDecimal } from "../../src/lib/money";
import { TAX_RATE_PRECISION, TAX_RATE_SCALE } from "../../src/lib/money/decimal";
import { ErrorCode } from "../../src/lib/errors";
import { InvoiceStatus, TaxType } from "../../src/types";

const createTax = async (kit: SeededKit, rate: string, type: TaxType = TaxType.Percentage) =>
  parsedBody(await kit.post("/taxes", { name: "Sales tax", type, rate }), taxResponse);

async function draftInvoiceWith(kit: SeededKit, currency: string, lineItems: unknown[]) {
  const client = await kit.services.clients.create({ name: "Client" }, kit.ctx);
  const response = await kit.post("/invoices", { clientId: client.id, issueDate: "2026-03-01", currency, lineItems });
  expect(response.status).toBe(201);
  return parsedBody(response, invoiceResponse);
}

const readTax = async (kit: SeededKit, taxId: string) => parsedBody(await kit.get(`/taxes/${taxId}`), taxResponse);
const listTaxes = async (kit: SeededKit) => (await parsedBody(await kit.get("/taxes"), taxListResponse)).data;
const readProduct = async (kit: SeededKit, productId: string) =>
  parsedBody(await kit.get(`/products/${productId}`), productResponse);
const listProducts = async (kit: SeededKit) => (await parsedBody(await kit.get("/products"), productListResponse)).data;
const createProduct = async (kit: SeededKit, body: unknown) => parsedBody(await kit.post("/products", body), productResponse);

describeForEachAdapter("tax rate with six decimals", allFactories, (ctx) => {
  test("a rate with six decimals is stored, read back and used in a total", async () => {
    const kit = await seededKit(ctx.repos);

    const created = await createTax(kit, "0.08875");
    expect(created.rate).toBe("0.088750");
    expect((await readTax(kit, created.id)).rate).toBe("0.088750");
    expect((await listTaxes(kit)).map((tax) => tax.rate)).toEqual(["0.088750"]);

    const invoice = await draftInvoiceWith(kit, "usd", [
      { description: "Legal fees", quantity: "1", price: "100000", taxIds: [created.id] },
    ]);
    expect(invoice.document).toMatchObject({ subtotal: "100000", tax: "8875", total: "108875" });

    const issued = await parsedBody(await kit.post(`/invoices/${invoice.id}/issue`, {}), invoiceResponse);
    expect(issued.document).toMatchObject({ tax: "8875", total: "108875" });
  });

  test("the sixth decimal reaches the stored rate and the total", async () => {
    const kit = await seededKit(ctx.repos);

    const tax = await createTax(kit, "0.099755");
    const invoice = await draftInvoiceWith(kit, "usd", [
      { description: "Legal fees", quantity: "1", price: "1000000", taxIds: [tax.id] },
    ]);

    expect(tax.rate).toBe("0.099755");
    expect(invoice.document.tax).toBe("99755");
  });

  test("a rate written with four decimals reads back with the same value and taxes the same amount", async () => {
    const kit = await seededKit(ctx.repos);

    const tax = await createTax(kit, "0.1800");
    const invoice = await draftInvoiceWith(kit, "usd", [
      { description: "Legal fees", quantity: "1", price: "100000", taxIds: [tax.id] },
    ]);

    expect(canonicalDecimal(tax.rate)).toBe("0.18");
    expect(tax.rate).toBe("0.180000");
    expect(invoice.document.tax).toBe("18000");
  });

  test("an update stores a six-decimal rate, and a zero rate is kept", async () => {
    const kit = await seededKit(ctx.repos);
    const tax = await createTax(kit, "0.18");
    const zeroRated = await createTax(kit, "0");

    const updated = await parsedBody(await kit.patch(`/taxes/${tax.id}`, { rate: "0.09975" }), taxResponse);

    expect(updated.rate).toBe("0.099750");
    expect(zeroRated.rate).toBe("0.000000");
  });

  test("a fixed rate keeps its minor units", async () => {
    const kit = await seededKit(ctx.repos);

    const stamp = await createTax(kit, "50", TaxType.Fixed);
    const invoice = await draftInvoiceWith(kit, "usd", [
      { description: "Filing", quantity: "3", price: "10000", taxIds: [stamp.id] },
    ]);

    expect(stamp.rate).toBe("50.000000");
    expect(invoice.document.tax).toBe("150");
  });

  test("a fixed tax of 5000000 minor units is stored, read back and used in a total", async () => {
    const kit = await seededKit(ctx.repos);

    const stamp = await createTax(kit, "5000000", TaxType.Fixed);
    const invoice = await draftInvoiceWith(kit, "cop", [
      { description: "Registro", quantity: "2", price: "100000000", taxIds: [stamp.id] },
    ]);

    expect(stamp.rate).toBe("5000000.000000");
    expect((await readTax(kit, stamp.id)).rate).toBe("5000000.000000");
    expect(invoice.document).toMatchObject({ subtotal: "200000000", tax: "10000000", total: "210000000" });
    const issued = await parsedBody(await kit.post(`/invoices/${invoice.id}/issue`, {}), invoiceResponse);
    expect(issued.document).toMatchObject({ tax: "10000000", total: "210000000" });
  });

  test("a fixed tax holds every integer digit of the column", async () => {
    const kit = await seededKit(ctx.repos);
    const largest = "9".repeat(TAX_RATE_PRECISION - TAX_RATE_SCALE);

    const stamp = await createTax(kit, largest, TaxType.Fixed);

    expect((await readTax(kit, stamp.id)).rate).toBe(`${largest}.000000`);
  });

  test("a fixed tax of 14 integer digits is refused with 400 and stores no tax", async () => {
    const kit = await seededKit(ctx.repos);

    const response = await kit.post("/taxes", { name: "Stamp", type: TaxType.Fixed, rate: "10000000000000" });

    expect(response.status).toBe(400);
    expect(await listTaxes(kit)).toHaveLength(0);
  });

  test("a seventh decimal is refused with 400 and stores no tax", async () => {
    const kit = await seededKit(ctx.repos);

    const response = await kit.post("/taxes", { name: "Sales tax", type: TaxType.Percentage, rate: "0.0887501" });

    expect(response.status).toBe(400);
    expect(await listTaxes(kit)).toHaveLength(0);
  });

  test("the repository prints a rate the same way in both adapters", async () => {
    const kit = await seededKit(ctx.repos);

    const created = await ctx.repos.taxes.create({
      organizationId: kit.organizationId,
      name: "IVA",
      type: TaxType.Percentage,
      rate: "0.16",
    });
    const updated = await ctx.repos.taxes.update(created.id, kit.organizationId, { rate: "0.08875" });

    expect(created.rate).toBe("0.160000");
    expect(updated.rate).toBe("0.088750");
    expect((await ctx.repos.taxes.findById(created.id, kit.organizationId))?.rate).toBe("0.088750");
  });
});

describeForEachAdapter("minor units follow the currency", allFactories, (ctx) => {
  const sourceLine = (id: string, price: string) => ({
    source: { type: "service", id, name: "Consultation" },
    quantity: "1",
    price,
    taxIds: [],
  });

  test.each([
    ["jpy", "1500", "1500"],
    ["clp", "150000", "150000"],
    ["kwd", "1500", "1.500"],
    ["usd", "1500", "15.00"],
    ["cop", "15000000000", "150000000.00"],
  ])("a %s source line of %s minor units creates a catalog price of %s", async (currency, minorUnits, catalogPrice) => {
    const kit = await seededKit(ctx.repos);

    const invoice = await draftInvoiceWith(kit, currency, [sourceLine("consultation", minorUnits)]);

    const [line] = invoice.document.lineItems;
    expect(line).toMatchObject({ price: minorUnits, product: { price: catalogPrice, currency } });
    const products = await listProducts(kit);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ id: line?.productId, price: catalogPrice, currency });
    expect(invoice.document.total).toBe(minorUnits);
  });

  test.each([
    ["jpy", "1500", "1500"],
    ["jpy", "1500.00", "1500"],
    ["kwd", "1.5", "1.500"],
    ["kwd", "1.505", "1.505"],
    ["usd", "9.9", "9.90"],
    ["cop", "150000000", "150000000.00"],
  ])("a %s product priced %s is stored as %s", async (currency, price, stored) => {
    const kit = await seededKit(ctx.repos);

    const response = await kit.post("/products", { name: "Retainer", price, cost: price, currency });

    expect(response.status).toBe(201);
    const created = await parsedBody(response, productResponse);
    expect(created).toMatchObject({ price: stored, cost: stored, currency });
    expect(await readProduct(kit, created.id)).toMatchObject({ price: stored, cost: stored });
  });

  test.each([
    ["jpy", "1500.5"],
    ["clp", "0.01"],
    ["usd", "9.999"],
    ["kwd", "1.5001"],
  ])("a %s product priced %s has too many decimals and is refused", async (currency, price) => {
    const kit = await seededKit(ctx.repos);

    const asPrice = await kit.post("/products", { name: "Retainer", price, currency });
    const asCost = await kit.post("/products", { name: "Retainer", price: "1", cost: price, currency });

    expect(asPrice.status).toBe(422);
    expect(await asPrice.text()).toContain(ErrorCode.ProductPricePrecisionInvalid);
    expect(asCost.status).toBe(422);
    expect(await listProducts(kit)).toHaveLength(0);
  });

  test("a price with five decimals is refused for every currency with 400", async () => {
    const kit = await seededKit(ctx.repos);

    const response = await kit.post("/products", { name: "Retainer", price: "1.00001", currency: "kwd" });

    expect(response.status).toBe(400);
  });

  test("an update checks the new price against the currency of the product", async () => {
    const kit = await seededKit(ctx.repos);
    const product = await createProduct(kit, { name: "Retainer", price: "1500", currency: "jpy" });

    const refused = await kit.patch(`/products/${product.id}`, { price: "1500.5" });
    const accepted = await kit.patch(`/products/${product.id}`, { price: "2000" });

    expect(refused.status).toBe(422);
    expect(accepted.status).toBe(200);
    expect((await parsedBody(accepted, productResponse)).price).toBe("2000");
  });

  test("a currency change checks the stored price and cost against the new currency", async () => {
    const kit = await seededKit(ctx.repos);
    const fractional = await createProduct(kit, { name: "Hourly", price: "150.50", cost: "80.00", currency: "usd" });
    const whole = await createProduct(kit, { name: "Flat fee", price: "150.00", cost: "80.00", currency: "usd" });

    const refused = await kit.patch(`/products/${fractional.id}`, { currency: "jpy" });
    const afterRefusal = await readProduct(kit, fractional.id);
    const accepted = await kit.patch(`/products/${whole.id}`, { currency: "jpy" });
    const repriced = await kit.patch(`/products/${fractional.id}`, { currency: "kwd", price: "150.505", cost: null });

    expect(refused.status).toBe(422);
    expect(afterRefusal).toMatchObject({ price: "150.50", cost: "80.00", currency: "usd" });
    expect(await parsedBody(accepted, productResponse)).toMatchObject({ price: "150", cost: "80", currency: "jpy" });
    expect(await parsedBody(repriced, productResponse)).toMatchObject({ price: "150.505", cost: null, currency: "kwd" });
  });

  test("an update of another field leaves the price and the cost as stored", async () => {
    const kit = await seededKit(ctx.repos);
    const product = await createProduct(kit, { name: "Hourly", price: "150.50", cost: "80.25", currency: "usd" });

    const renamed = await parsedBody(await kit.patch(`/products/${product.id}`, { name: "Hourly rate" }), productResponse);

    expect(renamed).toMatchObject({ name: "Hourly rate", price: "150.50", cost: "80.25", currency: "usd" });
  });

  test("totals, taxes and payments of a zero-decimal currency stay integer minor units", async () => {
    const kit = await seededKit(ctx.repos);
    const tax = await createTax(kit, "0.19");
    const invoice = await draftInvoiceWith(kit, "clp", [
      { description: "Honorarios", quantity: "1", price: "150000", taxIds: [tax.id] },
    ]);
    expect(invoice.document).toMatchObject({ subtotal: "150000", tax: "28500", total: "178500", currency: "clp" });
    await kit.post(`/invoices/${invoice.id}/issue`, {});

    const partial = await kit.post(`/invoices/${invoice.id}/payments`, { amount: "100000", currency: "CLP", provider: "MANUAL" });
    const rest = await kit.post(`/invoices/${invoice.id}/payments`, { amount: "78500", currency: "CLP", provider: "MANUAL" });

    expect(partial.status).toBe(201);
    expect(rest.status).toBe(201);
    const paid = await parsedBody(await kit.get(`/invoices/${invoice.id}`), invoiceResponse);
    expect(paid.status).toBe(InvoiceStatus.Paid);
  });
});

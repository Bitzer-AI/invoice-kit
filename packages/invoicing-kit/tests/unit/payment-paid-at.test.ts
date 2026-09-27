import { describe, expect, it } from "vitest";
import { createPaymentBody } from "../../src/domains/payments/validation";
import { createVendorBillPaymentBody } from "../../src/domains/vendor-bill-payments/validation";

const body = { amount: "118000", currency: "USD", provider: "manual" };

describe("payment paidAt", () => {
  it("accepts an ISO-8601 datetime with a UTC offset (a local noon from the dashboard)", () => {
    expect(createPaymentBody.safeParse({ ...body, paidAt: "2026-09-25T12:00:00-04:00" }).success).toBe(true);
    expect(createVendorBillPaymentBody.safeParse({ ...body, paidAt: "2026-09-25T12:00:00-04:00" }).success).toBe(true);
  });

  it("still accepts UTC and rejects a date without a time", () => {
    expect(createPaymentBody.safeParse({ ...body, paidAt: "2026-09-25T16:00:00.000Z" }).success).toBe(true);
    expect(createPaymentBody.safeParse({ ...body, paidAt: "2026-09-25" }).success).toBe(false);
  });
});

import { test, expect, describe } from "vitest";
import { lineItemSchema } from "../../src/lib/line-item";

describe("lineItemSchema metadata", () => {
  test("keeps a metadata object when provided", () => {
    const parsed = lineItemSchema.parse({
      productId: "prod_1",
      quantity: "1",
      price: "10000",
      taxIds: [],
      metadata: { booking: { availabilityId: 7, adults: 2, children: 0, infants: 0 } },
    });
    expect(parsed.metadata).toEqual({
      booking: { availabilityId: 7, adults: 2, children: 0, infants: 0 },
    });
  });

  test("leaves metadata undefined when omitted", () => {
    const parsed = lineItemSchema.parse({
      productId: "prod_1",
      quantity: "1",
      price: "10000",
      taxIds: [],
    });
    expect(parsed.metadata).toBeUndefined();
  });
});

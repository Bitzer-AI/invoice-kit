import { describe, expect, test } from "vitest";
import { createClientBody, updateClientBody } from "../../src/domains/clients/validation";
import { createVendorBody, updateVendorBody } from "../../src/domains/vendors/validation";
import { TAX_ID_MAX_LENGTH, TAX_ID_TYPE_MAX_LENGTH } from "../../src/lib/tax-identification";

describe.each([
  ["client", createClientBody, updateClientBody],
  ["vendor", createVendorBody, updateVendorBody],
])("%s tax identification", (_party, createBody, updateBody) => {
  const create = (fields: Record<string, unknown>) => createBody.safeParse({ name: "Acme", ...fields });

  test("the tax id type is free text, trimmed", () => {
    for (const taxIdType of ["RFC", "NIT", "CUIT", "EIN", "VAT", "RNC"]) {
      expect(create({ taxIdType })).toMatchObject({ success: true, data: { taxIdType } });
    }
    expect(create({ taxIdType: "  RFC  " })).toMatchObject({ success: true, data: { taxIdType: "RFC" } });
  });

  test("the tax id type holds 1 to 20 characters, or null", () => {
    expect(create({ taxIdType: "x".repeat(TAX_ID_TYPE_MAX_LENGTH) }).success).toBe(true);
    expect(create({ taxIdType: "x".repeat(TAX_ID_TYPE_MAX_LENGTH + 1) }).success).toBe(false);
    expect(create({ taxIdType: "" }).success).toBe(false);
    expect(create({ taxIdType: "   " }).success).toBe(false);
    expect(create({ taxIdType: null })).toMatchObject({ success: true, data: { taxIdType: null } });
    expect(create({}).success).toBe(true);
  });

  test("the tax id holds 40 characters", () => {
    expect(TAX_ID_MAX_LENGTH).toBe(40);
    expect(create({ taxId: "XAXX010101000" }).success).toBe(true);
    expect(create({ taxId: "9".repeat(TAX_ID_MAX_LENGTH) }).success).toBe(true);
    expect(create({ taxId: "9".repeat(TAX_ID_MAX_LENGTH + 1) }).success).toBe(false);
    expect(create({ taxId: null }).success).toBe(true);
  });

  test("an update takes the same limits", () => {
    expect(updateBody.safeParse({ taxIdType: "NIT", taxId: "900123456-7" }).success).toBe(true);
    expect(updateBody.safeParse({ taxIdType: "x".repeat(TAX_ID_TYPE_MAX_LENGTH + 1) }).success).toBe(false);
    expect(updateBody.safeParse({ taxId: "9".repeat(TAX_ID_MAX_LENGTH + 1) }).success).toBe(false);
  });
});

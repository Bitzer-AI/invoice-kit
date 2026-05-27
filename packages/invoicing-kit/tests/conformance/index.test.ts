// Vitest picks up every *.test.ts file in tests/conformance/ automatically.
// This file is a sanity check that the harness imports resolve.
import { describe, expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";

describe("conformance harness wiring", () => {
  test("describeForEachAdapter is callable", () => {
    expect(typeof describeForEachAdapter).toBe("function");
  });
});

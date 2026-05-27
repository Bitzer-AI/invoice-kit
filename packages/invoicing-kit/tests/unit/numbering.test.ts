import { test, expect, describe } from "vitest";
import { inMemoryAdapter } from "../../src/adapters/memory";
import { DocumentNumberingService } from "../../src/lib/numbering";

describe("DocumentNumberingService", () => {
  test("next() ensures sequence exists then returns sequential numbers", async () => {
    const repos = inMemoryAdapter();
    const numbering = new DocumentNumberingService();
    const a = await numbering.next(repos, "org-1", "INVOICE", null);
    const b = await numbering.next(repos, "org-1", "INVOICE", null);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  test("next() is per (org, type)", async () => {
    const repos = inMemoryAdapter();
    const numbering = new DocumentNumberingService();
    const inv = await numbering.next(repos, "org-1", "INVOICE", null);
    const q = await numbering.next(repos, "org-1", "QUOTE", null);
    expect(inv).toBe(1);
    expect(q).toBe(1);
  });
});

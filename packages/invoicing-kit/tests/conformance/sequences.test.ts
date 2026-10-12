// tests/conformance/sequences.test.ts
import { expect, test } from "vitest";
import { describeForEachAdapter } from "./harness";
import { allFactories } from "./adapters";
import { seed } from "./seed";
import { DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH } from "../../src/lib/numbering";

describeForEachAdapter("DocumentSequenceRepository", allFactories, (ctx) => {
  test("ensure creates row at nextNumber=1, second call no-ops", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    const seq = await ctx.repos.documentSequences.find({
      organizationId,
      documentType: "INVOICE",
    });
    expect(seq).not.toBeNull();
    expect(seq!.nextNumber).toBe(1);
  });

  test("incrementAndGet returns sequential numbers", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    const n1 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "INVOICE",
    });
    const n2 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "INVOICE",
    });
    expect(n1).toEqual({ number: 1, padWidth: DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH });
    expect(n2).toEqual({ number: 2, padWidth: DEFAULT_DOCUMENT_NUMBER_PAD_WIDTH });
  });

  test("incrementAndGet is per-(org, type)", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "QUOTE",
    });
    const i1 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "INVOICE",
    });
    const q1 = await ctx.repos.documentSequences.incrementAndGet({
      organizationId,
      documentType: "QUOTE",
    });
    expect(i1.number).toBe(1);
    expect(q1.number).toBe(1);
  });

  test("concurrent incrementAndGet yields distinct numbers", async () => {
    const { organizationId } = await seed(ctx.repos);
    await ctx.repos.documentSequences.ensure({
      organizationId,
      documentType: "INVOICE",
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        ctx.repos.documentSequences.incrementAndGet({
          organizationId,
          documentType: "INVOICE",
        }),
      ),
    );
    const sorted = results.map((assigned) => assigned.number).sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

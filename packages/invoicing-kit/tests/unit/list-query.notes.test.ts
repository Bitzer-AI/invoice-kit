import { describe, it, expect } from "vitest";
import { sortNotesInMemory } from "../../src/lib/list-query";

const row = (id: string, issueDate: string, total: bigint, status: string) => ({
  id,
  status,
  document: { issueDate: new Date(issueDate), total } as any,
});

describe("sortNotesInMemory", () => {
  it("defaults to issueDate desc", () => {
    const rows = [
      row("a", "2026-01-01", 100n, "issued"),
      row("b", "2026-02-01", 50n, "draft"),
    ];
    expect(sortNotesInMemory(rows as any, undefined, undefined).map((r) => r.id)).toEqual([
      "b",
      "a",
    ]);
  });
  it("sorts by total asc", () => {
    const rows = [
      row("a", "2026-01-01", 100n, "issued"),
      row("b", "2026-02-01", 50n, "draft"),
    ];
    expect(sortNotesInMemory(rows as any, "total", "asc").map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("sorts by status asc", () => {
    const rows = [
      row("a", "2026-01-01", 100n, "issued"),
      row("b", "2026-02-01", 50n, "draft"),
    ];
    expect(sortNotesInMemory(rows as any, "status", "asc").map((r) => r.id)).toEqual(["b", "a"]);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { generate } from "../src/commands/generate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(__dirname, "..", "templates", "v0");
const EXPECTED_FILES = ["client.prisma", "invoicing.prisma", "payment.prisma", "product.prisma"];

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "invoicing-kit-cli-"));
});

describe("generate", () => {
  it("copies all v0 templates into the default output dir", async () => {
    const result = await generate({ outDir: join(workdir, "prisma/models") });

    expect(result.written.sort()).toEqual(EXPECTED_FILES.map((f) => join(workdir, "prisma/models", f)).sort());
    expect(result.skipped).toEqual([]);

    for (const file of EXPECTED_FILES) {
      const out = readFileSync(join(workdir, "prisma/models", file), "utf8");
      const tpl = readFileSync(join(TEMPLATE_DIR, file), "utf8");
      expect(out).toBe(tpl);
    }
  });

  it("respects --out", async () => {
    const out = join(workdir, "custom-out");
    const result = await generate({ outDir: out });
    expect(result.written.length).toBe(EXPECTED_FILES.length);
    expect(readdirSync(out).sort()).toEqual(EXPECTED_FILES.sort());
  });

  it("dry-run writes nothing but reports what it would write", async () => {
    const out = join(workdir, "prisma/models");
    const result = await generate({ outDir: out, dryRun: true });

    expect(result.written.length).toBe(EXPECTED_FILES.length);
    expect(existsSync(out)).toBe(false);
  });

  it("skips existing files without --force", async () => {
    const out = join(workdir, "prisma/models");
    await generate({ outDir: out });
    writeFileSync(join(out, "client.prisma"), "// user-edited\n");

    const second = await generate({ outDir: out });

    expect(second.skipped).toContain(join(out, "client.prisma"));
    expect(readFileSync(join(out, "client.prisma"), "utf8")).toBe("// user-edited\n");
  });

  it("overwrites existing files with --force", async () => {
    const out = join(workdir, "prisma/models");
    await generate({ outDir: out });
    writeFileSync(join(out, "client.prisma"), "// user-edited\n");

    const second = await generate({ outDir: out, force: true });

    expect(second.skipped).toEqual([]);
    const tpl = readFileSync(join(TEMPLATE_DIR, "client.prisma"), "utf8");
    expect(readFileSync(join(out, "client.prisma"), "utf8")).toBe(tpl);
  });
});

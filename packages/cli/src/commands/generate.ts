import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface GenerateOptions {
  outDir: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface GenerateResult {
  written: string[];
  skipped: string[];
}

const DEFAULT_TEMPLATE_VERSION = "v0";

function resolveTemplateDir(version: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "templates", version),
    resolve(here, "..", "..", "templates", version),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Template directory for "${version}" not found. Looked in:\n  ${candidates.join("\n  ")}`,
  );
}

function listPrismaTemplates(templateDir: string): string[] {
  return readdirSync(templateDir).filter((f) => f.endsWith(".prisma"));
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const templateDir = resolveTemplateDir(DEFAULT_TEMPLATE_VERSION);
  const templates = listPrismaTemplates(templateDir);

  const written: string[] = [];
  const skipped: string[] = [];

  if (!options.dryRun) {
    mkdirSync(options.outDir, { recursive: true });
  }

  for (const file of templates) {
    const dest = join(options.outDir, file);
    if (!options.force && existsSync(dest)) {
      skipped.push(dest);
      continue;
    }

    if (!options.dryRun) {
      copyFileSync(join(templateDir, file), dest);
    }
    written.push(dest);
  }

  return { written, skipped };
}

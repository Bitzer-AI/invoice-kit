// Copies billing schema templates from packages/cli/templates/v0/ into
// the Prisma fixture folder so `prisma generate` and `prisma db push` see them
// alongside auth.prisma via the prismaSchemaFolder preview.
import { cpSync, readdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const fixtureDir = resolve(here, "prisma");
const templatesDir = resolve(here, "../../../cli/templates/v0");

// Wipe any previously-copied template files (keep auth.prisma and schema.prisma).
const KEEP = new Set(["schema.prisma", "auth.prisma"]);
if (existsSync(fixtureDir)) {
  for (const f of readdirSync(fixtureDir)) {
    if (f.endsWith(".prisma") && !KEEP.has(f)) {
      rmSync(join(fixtureDir, f));
    }
  }
}

for (const f of readdirSync(templatesDir)) {
  if (f.endsWith(".prisma")) {
    cpSync(join(templatesDir, f), join(fixtureDir, f));
  }
}

console.log("Copied billing templates into test fixture");

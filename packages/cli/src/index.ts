#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";

import { generate } from "./commands/generate.js";

const program = new Command();

program
  .name("invoicing-kit")
  .description("Schema generator for invoicing-kit's default Prisma adapter")
  .version("0.1.0");

program
  .command("generate")
  .description("Write invoicing-kit Prisma model files into your project")
  .option("--out <dir>", "output directory", "prisma/models")
  .option("--dry-run", "print what would be written without touching the filesystem", false)
  .option("--force", "overwrite existing files", false)
  .action(async (opts: { out: string; dryRun: boolean; force: boolean }) => {
    const outDir = resolve(process.cwd(), opts.out);
    const { written, skipped } = await generate({
      outDir,
      dryRun: opts.dryRun,
      force: opts.force,
    });

    if (opts.dryRun) {
      console.log(`[dry-run] would write ${written.length} file(s) to ${outDir}:`);
      for (const f of written) console.log(`  ${f}`);
      if (skipped.length) {
        console.log(`[dry-run] would skip ${skipped.length} existing file(s) (use --force to overwrite):`);
        for (const f of skipped) console.log(`  ${f}`);
      }
      return;
    }

    console.log(`Wrote ${written.length} file(s) to ${outDir}:`);
    for (const f of written) console.log(`  ${f}`);
    if (skipped.length) {
      console.log(`Skipped ${skipped.length} existing file(s) (use --force to overwrite):`);
      for (const f of skipped) console.log(`  ${f}`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

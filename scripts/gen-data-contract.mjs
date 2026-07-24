#!/usr/bin/env node
// Regenerates docs/data-contract.md from lib/readModel/contract.ts (PRD MC.8).
// The registry is the source of truth; this script is the only writer.
// A vitest check fails the suite if the committed doc drifts from the registry,
// so running this is mandatory after any contract edit — not optional hygiene.

// Node >=22.6 strips TypeScript types natively, so the .ts registry imports
// directly — no tsx/ts-node dependency for a doc generator.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

const { renderDataContractMarkdown } = await import(
  join(repo, "lib/readModel/contract.ts")
);

const out = join(repo, "docs/data-contract.md");
writeFileSync(out, renderDataContractMarkdown(), "utf8");
console.log(`wrote ${out}`);

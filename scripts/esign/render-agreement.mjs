#!/usr/bin/env node
// Q47 e-sign — standalone renderer for the Phase I agreement engine.
//
// The engine (lib/esign/agreementPdf.ts) is pure JSON-in -> PDF-bytes-out with
// no Next/Supabase imports, exactly so it can be driven from outside the
// dashboard (Rob 2026-07-23: "skill-wrappable"). This CLI is that wrapper: same
// engine, same intake gate, same refusal text as POST /api/esign/generate — the
// only difference is the PDF lands on disk instead of in the private bucket.
//
//   node scripts/esign/render-agreement.mjs <config.json> [--out <path>] [--force]
//
// Exit 0 = PDF written (path + page count + sha256 printed).
// Exit 1 = refused or failed; NOTHING is written. Intake-gate refusals are
//          printed verbatim because the refusal doubles as the fix-it list.
//
// Requires Node >= 22.18 (native TypeScript type-stripping); no build step.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));
const outIdx = argv.indexOf("--out");
const outArg = outIdx >= 0 ? argv[outIdx + 1] : null;
const configArg = positional.filter((a) => a !== outArg)[0];

if (!configArg || flags.has("--help")) {
  die("usage: node scripts/esign/render-agreement.mjs <config.json> [--out <path>] [--force]");
}

const configPath = resolve(process.cwd(), configArg);
if (!existsSync(configPath)) die(`config not found: ${configPath}`);

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (err) {
  die(`config is not valid JSON (${configPath}): ${err.message}`);
}
if (!config || typeof config !== "object" || !config.client || !Array.isArray(config.entities)) {
  die(`config must have { client, entities[], intake, fee?, provider?, additional_scope? }: ${configPath}`);
}

// Default output: the config's own output_filename (contracts-repo convention),
// resolved relative to the config's directory. Never silently overwrite paper.
const defaultOut =
  typeof config.output_filename === "string" && config.output_filename.trim()
    ? config.output_filename.trim()
    : `Phase 1 Agreement - ${config.client.legal_name ?? "client"}.pdf`;
const rawOut = outArg ?? defaultOut;
const outPath = isAbsolute(rawOut) ? rawOut : join(dirname(configPath), rawOut);
if (existsSync(outPath) && !flags.has("--force")) {
  die(`refusing to overwrite an existing document: ${outPath}\n(pass --force only if you are certain it is not executed paper)`);
}

const { buildAgreementPdf } = await import(join(REPO_ROOT, "lib/esign/agreementPdf.ts"));

let result;
try {
  result = await buildAgreementPdf(config, configArg);
} catch (err) {
  // Verbatim: the intake gate's message IS the instruction set.
  die(err.message);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, result.bytes);
const sha256 = createHash("sha256").update(result.bytes).digest("hex");

console.log(`wrote    ${outPath}`);
console.log(`pages    ${result.pageCount}`);
console.log(`bytes    ${result.bytes.length}`);
console.log(`sha256   ${sha256}`);

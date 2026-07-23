#!/usr/bin/env node
// MC.16 hardening: repeatable secrets sweep (CR-3 — the audit is code, not prose).
// Run after `npm run build`:  node scripts/secrets-sweep.mjs
// Exit 0 = clean, exit 1 = findings (each printed with file:line).
//
// Three gates:
//  1. No .env* file tracked by git (secrets stay externalized).
//  2. No literal secret VALUE in tracked files: JWTs (eyJ…​.eyJ…), Anthropic/OpenAI
//     sk- keys, Twilio SK/AC+32hex tokens. Env-var NAMES and docs mentioning
//     "password" are fine — the DoD's intent is no hardcoded credentials.
//  3. No .env.local value (≥8 chars) present in the client bundle (.next/static).
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const findings = [];

// Gate 1 — tracked env files
const trackedEnv = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter((f) => /(^|\/)\.env(\.|$)/.test(f));
for (const f of trackedEnv) findings.push(`tracked env file: ${f}`);

// Gate 2 — literal secret values in tracked files
const LITERAL_PATTERNS =
  "(eyJ[A-Za-z0-9_-]{20,}\\.eyJ[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-proj-[A-Za-z0-9_-]{10,}|SK[0-9a-f]{32}|AC[0-9a-f]{32})";
try {
  const hits = execSync(
    `git grep -InE "${LITERAL_PATTERNS}" -- ':!package-lock.json'`,
    { encoding: "utf8" }
  ).trim();
  if (hits) for (const line of hits.split("\n")) findings.push(`literal secret: ${line}`);
} catch {
  /* git grep exits 1 on zero matches — that's the clean case */
}

// Gate 3 — .env.local values in client static chunks
const STATIC_DIR = ".next/static";
if (!existsSync(STATIC_DIR)) {
  console.error("no .next/static — run `npm run build` first");
  process.exit(1);
}
const envVals = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (val.length >= 8) envVals[key] = val; // short values would false-positive
  }
}
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
let chunkCount = 0;
for (const file of walk(STATIC_DIR)) {
  const buf = readFileSync(file);
  chunkCount++;
  for (const [key, val] of Object.entries(envVals)) {
    if (buf.includes(val)) findings.push(`env value ${key} leaked into client chunk: ${file}`);
  }
}

console.log(
  `secrets-sweep: ${trackedEnv.length} tracked env files, ` +
    `${Object.keys(envVals).length} env values checked against ${chunkCount} client files`
);
if (findings.length) {
  console.error("FINDINGS:");
  for (const f of findings) console.error("  " + f);
  process.exit(1);
}
console.log("CLEAN");

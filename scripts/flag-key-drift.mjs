/**
 * Q84 inc.103 — the standing read for one finding filed twice under two spellings.
 *
 * Prod #144 `org-hosts/duplicate-slot-C-2010` and #145 `org-host/C-2010-duplicate-slot`
 * are the same finding on the same org. The POST route matches keys with `eq()`, so it
 * saw two findings and inserted the second. Nobody noticed for days; it took a human
 * reading the ledger. This puts that read on a script.
 *
 * PLAN-BY-DEFAULT. It prints what it found and writes nothing. `--flag` is the only way
 * it reaches Rob's ledger, and it is deliberately NOT run today: #150 already carries
 * this exact finding, hand-filed, and a second row about duplicate rows would be the
 * joke telling itself. Once #150 is resolved, this script is the thing that re-raises it.
 *
 * Read-only against the ledger. The decision lives in lib/flags/dedupeKeyIdentity.ts
 * (pure, 11 tests); this file is the I/O around it, imported through ts-loader so the
 * ladder that runs here is the ladder the tests grade.
 *
 *   node --import ./scripts/ts-loader.mjs scripts/flag-key-drift.mjs [--flag] [--json]
 */

import { findKeyDrift } from "../lib/flags/dedupeKeyIdentity.ts";

// Same var as scripts/migration-backlog.mjs and notion-crm-check.mjs — one name for the
// one destination. Defaults to prod: the ledger Rob reads is the deployed one.
const BASE = (process.env.FLAGS_BASE_URL || "https://mle-rob-dashboard.vercel.app").replace(/\/$/, "");
const FLAG = process.argv.includes("--flag");
const JSON_OUT = process.argv.includes("--json");

// A finding this script files about itself must carry a key it OWNS, not one typed here
// twice. That is the whole lesson of #144/#145, so it is a module constant, exported.
export const KEY_FLAG_KEY_DRIFT = "flag-ledger/key-drift";

const res = await fetch(`${BASE}/api/admin/flags`, { headers: { accept: "application/json" } });
if (!res.ok) {
  // A failed read must not read as "no drift" — that is how a silent check rots.
  console.error(`flag read failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const body = await res.json();
const all = Array.isArray(body) ? body : (body.flags ?? []);
const open = all.filter((f) => (f.status ?? "open") === "open");
const groups = findKeyDrift(open.map((f) => ({ id: f.id, dedupeKey: f.dedupe_key ?? f.dedupeKey })));

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: open.length, groups }, null, 2));
} else {
  console.log(`open flags: ${open.length} · one identity spelled more than once: ${groups.length}`);
  for (const g of groups) {
    console.log(`  [${g.identity}] rows ${g.rows.map((r) => `#${r.id}`).join(", ")}`);
    for (const s of g.spellings) console.log(`      ${s}`);
  }
  if (!groups.length) console.log("  none — every open key is one finding, one spelling.");
}

if (!groups.length || !FLAG) {
  if (groups.length) console.log("\nplan only — pass --flag to put this on the ledger.");
  process.exit(0);
}

const detail =
  groups
    .map(
      (g) =>
        `${g.rows.map((r) => `#${r.id}`).join(" and ")} are one finding under ${g.spellings.length} spellings: ` +
        g.spellings.map((s) => `"${s}"`).join(" vs "),
    )
    .join(" · ") +
  ". The write door matches keys exactly, so the second spelling INSERTED instead of correcting the first. " +
  "Neither row is wrong; they are the same row. Resolve one with a note pointing at the other, and give the " +
  "producer a module constant so the key cannot be retyped.";

const post = await fetch(`${BASE}/api/admin/flags`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    entityName: "Flag ledger",
    title: `${groups.length} finding(s) filed more than once under drifted dedupe keys`,
    detail,
    severity: "medium",
    dedupeKey: KEY_FLAG_KEY_DRIFT,
  }),
});
const json = await post.json().catch(() => ({}));
if (!post.ok) {
  console.error(`flag write failed: ${post.status} ${json.error ?? post.statusText}`);
  process.exit(1);
}
console.log(`--flag: [${KEY_FLAG_KEY_DRIFT}] ledger ${json.action ?? "written"}`);

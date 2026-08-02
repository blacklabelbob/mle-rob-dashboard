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

import {
  findCrossStatusDrift,
  findKeyDrift,
  findKeylessStacks,
  findTitleNearMisses,
} from "../lib/flags/dedupeKeyIdentity.ts";

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
const rows = open.map((f) => ({
  id: f.id,
  dedupeKey: f.dedupe_key ?? f.dedupeKey,
  entityName: f.entity_name ?? f.entityName,
  title: f.title,
}));
const groups = findKeyDrift(rows);

// Q84 inc.104 — the keyless population, read on its own terms. A row with no key stacks
// unconditionally at the write door, so it is the larger exposure; but the only identity
// strict enough to be safe is the exact one, and today it pairs nothing. The near misses
// are printed so the refusal is visible rather than mistaken for "checked, all clear".
const keyless = rows.filter((r) => !(typeof r.dedupeKey === "string" && r.dedupeKey.trim()));
const stacks = findKeylessStacks(rows);
const nearMisses = findTitleNearMisses(rows);

// Q84 inc.105 — the ONE read here that must not stop at the open rows. A spelling that
// survives only on a resolved row is invisible to every check above, and re-filing under
// it inserts a row that reads as a first sighting instead of a recurrence. The open-only
// counts above are deliberately unchanged: this is an extra window, not a wider one.
const crossStatus = findCrossStatusDrift(
  all.map((f) => ({ id: f.id, dedupeKey: f.dedupe_key ?? f.dedupeKey, status: f.status ?? "open" })),
);

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { scanned: open.length, ledger: all.length, groups, keyless: keyless.length, stacks, nearMisses, crossStatus },
      null,
      2,
    ),
  );
} else {
  console.log(`open flags: ${open.length} · one identity spelled more than once: ${groups.length}`);
  for (const g of groups) {
    console.log(`  [${g.identity}] rows ${g.rows.map((r) => `#${r.id}`).join(", ")}`);
    for (const s of g.spellings) console.log(`      ${s}`);
  }
  if (!groups.length) console.log("  none — every open key is one finding, one spelling.");

  console.log(`\nno key at all: ${keyless.length} · same record, same title: ${stacks.length}`);
  for (const s of stacks) {
    console.log(`  [${s.identity}] rows ${s.rows.map((r) => `#${r.id}`).join(", ")}`);
  }
  if (!stacks.length && keyless.length) {
    console.log("  none — keyless, but no two of them are the same finding on the same record yet.");
  }
  console.log(
    `\nledger incl. resolved: ${all.length} · spellings that survive only on a resolved row: ${crossStatus.length}`,
  );
  for (const c of crossStatus) {
    console.log(`  [${c.identity}] open: ${c.openSpellings.join(", ")}`);
    console.log(`      resolved-only: ${c.resolvedOnlySpellings.join(", ")} — a re-file under this reads as new`);
  }
  if (!crossStatus.length) {
    console.log("  none — no resolved row carries a spelling an open row does not.");
  }

  if (nearMisses.length) {
    console.log(`\nnear misses NOT paired (${nearMisses.length}) — a title alone is not a key:`);
    for (const m of nearMisses) {
      console.log(`  #${m.rows[0].id} vs #${m.rows[1].id} · ${(m.overlap * 100).toFixed(0)}% alike`);
      console.log(`      differ by: ${m.differing.join(", ")}`);
    }
  }
}

// A keyless stack is the same defect through the other door, so it gates the write too —
// otherwise a run that found only stacks would exit silently as though it found nothing.
// Near misses never gate anything: they are the pairings this script REFUSED to make.
// Nor does cross-status drift (inc.105): the remedy the filed row prescribes is "resolve one
// with a note pointing at the other", and one of those rows is ALREADY resolved. Filing that
// sentence about a row Rob closed would be advice to undo his own closure.
const findings = groups.length + stacks.length;
if (!findings || !FLAG) {
  if (findings) console.log("\nplan only — pass --flag to put this on the ledger.");
  process.exit(0);
}

const detail =
  [
    ...groups.map(
      (g) =>
        `${g.rows.map((r) => `#${r.id}`).join(" and ")} are one finding under ${g.spellings.length} spellings: ` +
        g.spellings.map((s) => `"${s}"`).join(" vs "),
    ),
    ...stacks.map(
      (s) => `${s.rows.map((r) => `#${r.id}`).join(" and ")} carry NO key and are the same title on the same record`,
    ),
  ].join(" · ") +
  ". The write door matches keys exactly, so the second spelling INSERTED instead of correcting the first, and a " +
  "row with no key never even reaches that read. Neither row is wrong; they are the same row. Resolve one with a " +
  "note pointing at the other, and give the producer a module constant so the key cannot be retyped.";

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

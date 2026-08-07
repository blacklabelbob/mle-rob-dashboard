/**
 * Q85 inc.19 — the standing read for an UNKEYED ledger row that says nothing a KEYED row is
 * already saying, and saying more currently.
 *
 * `flag-key-drift.mjs` (inc.103) reads one finding filed twice under TWO KEYS. This reads one
 * finding filed twice where the second copy has NO key at all — the door the findings protocol
 * opens by design and `supersede.ts` explicitly does not watch ("no key → insert, exactly as
 * before"). Measured pair on prod today: keyed #213 and hand-filed #219, both open, both about
 * Joseph Green / Dix thedev08 / P-1010, with two different counts in their titles.
 *
 * PLAN-BY-DEFAULT. It prints and writes nothing. `--apply` is the only way it touches the
 * ledger, and all it ever does is RESOLVE the restating row with `supersededNote(survivor)` —
 * the same sentence every other supersession leaves, so the Reopen control appears on it and
 * one click undoes this. Nothing is deleted, no keyed row is altered, no new row is filed.
 *
 * Read-only against the CRM. The decision lives in lib/flags/restatement.ts (pure, 12 tests);
 * this file is the I/O around it, imported through ts-loader so the ladder that runs here is
 * the ladder the tests grade.
 *
 *   node --import ./scripts/ts-loader.mjs scripts/flag-restatement.mjs [--apply] [--json]
 */

import { ambiguousRestatements, findRestatements } from "../lib/flags/restatement.ts";
import { supersededNote } from "../lib/flags/supersede.ts";

// Same var as flag-key-drift.mjs and notion-crm-check.mjs — one name for the one destination.
const BASE = (process.env.FLAGS_BASE_URL || "https://mle-rob-dashboard.vercel.app").replace(/\/$/, "");
const APPLY = process.argv.includes("--apply");
const JSON_OUT = process.argv.includes("--json");

const res = await fetch(`${BASE}/api/admin/flags`, { headers: { accept: "application/json" } });
if (!res.ok) {
  // A failed read must not read as "no restatements" — that is how a silent check rots.
  console.error(`flag read failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const body = await res.json();
const all = Array.isArray(body) ? body : (body.flags ?? []);
const rows = all.map((f) => ({
  id: f.id,
  status: (f.status ?? "open") === "resolved" ? "resolved" : "open",
  dedupeKey: f.dedupe_key ?? f.dedupeKey ?? null,
  entityName: f.entity_name ?? f.entityName ?? null,
  title: f.title ?? null,
  detail: f.detail ?? null,
}));

const found = findRestatements(rows);
const ambiguous = ambiguousRestatements(rows);
const byId = new Map(rows.map((r) => [r.id, r]));

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: rows.length, found, ambiguous }, null, 2));
} else {
  const open = rows.filter((r) => r.status === "open");
  const unkeyed = open.filter((r) => !r.dedupeKey).length;
  console.log(
    `\n── ledger restatement scan ── ${rows.length} row(s) read · ${open.length} open · ` +
      `${unkeyed} of those carry no dedupe key (the population at risk)`,
  );
  if (!found.length) console.log("  ✅ no unkeyed row is wholly contained in a keyed one");
  for (const r of found) {
    const restated = byId.get(r.restatedId);
    const survivor = byId.get(r.survivorId);
    console.log(`\n  #${r.restatedId} restates #${r.survivorId} [${r.survivorKey}]`);
    console.log(`     restating : ${restated?.title ?? "(no title)"}`);
    console.log(`     survivor  : ${survivor?.title ?? "(no title)"}  ← re-minted every run`);
    console.log(`     shared    : ${r.sharedSubjects.join(" · ")}`);
  }
  for (const a of ambiguous)
    console.log(`\n  ⚠️  #${a.restatedId} is contained in ${a.survivorIds.length} keyed rows ` +
      `(${a.survivorIds.map((i) => `#${i}`).join(", ")}) — refused, a human picks`);
  if (found.length && !APPLY)
    console.log(`\n  (plan only — re-run with --apply to resolve the restating row(s) as superseded)`);
}

if (APPLY) {
  for (const r of found) {
    const note = supersededNote(r.survivorId);
    // Q85 inc.20: inc.19 sent `{ id, status, resolutionNote }` — a shape the route has never
    // accepted. It 400s on the first line of the handler, so the write path shipped broken and
    // read as "nothing to apply" because the live scan happened to find nothing to try it on.
    // The contract is `{ id, action, note }`, and `unverifiedActorRefusal` means an actor field
    // is not merely unnecessary here — sending one is refused.
    const patch = await fetch(`${BASE}/api/admin/flags`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: r.restatedId, action: "resolve", note }),
    });
    console.log(
      patch.ok
        ? `  ✔ #${r.restatedId} resolved — ${note}`
        : `  ✗ #${r.restatedId} PATCH failed: ${patch.status} ${patch.statusText}`,
    );
  }
}

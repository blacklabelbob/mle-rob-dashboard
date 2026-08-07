#!/usr/bin/env node
/**
 * publish-archive-meetings.mjs — Q85 inc.2. The writer. This is the first thing in the repo
 * that can turn an archived meeting into a CRM row without a human typing the payload.
 *
 * inc.1 built `lib/meetings/activityDraft.ts`: plan row → the exact activity shape. It is pure
 * and deliberately writes nothing. This is its only caller, and it is deliberately NOT pure —
 * it reads prod and, with `--apply`, writes to `activities`. Every judgement it could have made
 * itself is delegated upward to the draft module, so the two never reach different answers.
 *
 * WHY NOT `publish-meeting-activity.mjs`. That script exists and it refuses these rows on
 * purpose: its `auditActivity` requires `sourceContext.intel` to be non-empty — "writing this
 * row would add a meeting with nothing to render". That rule is correct for Q89's path, where
 * the payload IS extracted intel and an empty one means the extraction failed. It is wrong for
 * this path. An archive row is the *fact that the meeting happened*, on a day, with a company;
 * nobody has extracted anything from it yet and may never. Refusing to record a real meeting
 * because we have not yet mined it is how 46 real conversations came to be invisible in the
 * first place. So this is a second writer, not a loosened first one — the intel gate stays
 * exactly as strict for the payloads it was written for.
 *
 * PLAN BY DEFAULT. Without `--apply` nothing is written and the exit code is 0. `--apply`
 * inserts rows that are absent. A row that is present and DIFFERENT is never overwritten here
 * at all — not even with a flag: an existing meeting row may have been edited by a human, and
 * a bulk pass is the worst possible place to make that judgement one row at a time. It is
 * printed and left alone.
 *
 * TOUCHES NOTHING ELSE. Only `activities`, only ids this run drafted. No org, person, deal or
 * document row is created or edited; no money / quoted / signed / paid column is read or
 * written; no delete in any mode.
 *
 * Usage:
 *   npm run --silent check:archive -- --json > /tmp/q85-check.json
 *   npm run --silent publish:archive-meetings -- --input /tmp/q85-check.json
 *   npm run --silent publish:archive-meetings -- --input /tmp/q85-check.json --apply
 *
 * `--silent` is not optional on the producing command: npm otherwise prints its banner onto
 * STDOUT ahead of the JSON and the redirect captures a file no parser will read.
 *
 * Run it through the npm script, NOT bare `node scripts/publish-archive-meetings.mjs`. This
 * file imports `lib/meetings/activityDraft.ts` directly, so it needs `--import
 * ./scripts/ts-loader.mjs` — which the npm script supplies and a bare node run does not. Bare
 * node dies on the draft module's own `.ts`-less import with ERR_MODULE_NOT_FOUND, several
 * frames deep and nowhere near the real cause; verified 2026-08-07.
 */

import { readFileSync } from "node:fs";

import { draftActivityFromPlan, recorderSawMeeting } from "../lib/meetings/activityDraft.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const AS_JSON = args.includes("--json");
const inputIdx = args.indexOf("--input");
const INPUT = inputIdx >= 0 ? args[inputIdx + 1] : "";

/** Stamped into every row this run creates, so a row always names the run that made it. */
const CREATED_BY = "driver:Q85-inc.2";

if (!INPUT) {
  console.error("usage: publish-archive-meetings.mjs --input <check:archive --json> [--apply]");
  console.error("  produce the input with:  npm run --silent check:archive -- --json > /tmp/q85-check.json");
  process.exit(2);
}

/* ── env ─────────────────────────────────────────────────────────────────────────────── */

function readEnvLocal() {
  const out = {};
  let raw = "";
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
// `SUPABASE_URL` only — deliberately NOT a `NEXT_PUBLIC_SUPABASE_URL` fallback. That name
// appears nowhere else in this repo, and `.env.example` says of these two vars "server-side
// only, never exposed to client". A fallback onto a `NEXT_PUBLIC_` name would have quietly
// invited the client-exposed spelling into a service-key script. The env manifest gate
// (lib/__tests__/envManifest.test.ts) caught it; the fallback is removed, not documented.
const SUPABASE_URL = env.SUPABASE_URL || "";
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";

/* ── row mapping — mirrors toRow in publish-meeting-activity.mjs and fromActivity in lib/crm ── */

function toRow(a) {
  return {
    id: a.id,
    person_id: null,
    org_id: a.orgId,
    deal_id: null,
    created_by: a.createdBy,
    type: a.type,
    source: a.source,
    source_context: a.sourceContext,
    summary: a.summary ?? null,
    action_items: null,
    buying_signals: null,
    // The Fireflies/Notion recording link lives in `sourceContext.recording` and is copied here
    // too because `recording_url` is the column every existing reader already looks at. It is
    // NOT identity — see the header of lib/meetings/activityDraft.ts.
    recording_url: a.sourceContext?.recording ?? null,
    transcript_url: null,
    book_protected: false,
    occurred_at: a.occurredAt,
  };
}

/* ── run ─────────────────────────────────────────────────────────────────────────────── */

const check = JSON.parse(readFileSync(INPUT, "utf8"));
const planRows = check?.activityPlan?.rows;
if (!Array.isArray(planRows)) {
  console.error(`${INPUT} has no activityPlan.rows — is it the output of \`check:archive --json\`?`);
  process.exit(2);
}

const drafts = [];
const refusals = [];
const outOfScope = [];
const droppedSummaries = [];
for (const planRow of planRows) {
  // Q85's own scope line, enforced before anything is drafted — see `recorderSawMeeting`.
  // Kept separate from `refusals` on purpose: a refusal is the plan saying "answer something
  // first", this is Q85 saying "not mine, Q84 asks a human about it". Collapsing the two would
  // make 24 human-account rows read as 24 broken ones.
  if (!recorderSawMeeting(planRow?.row || {})) {
    outOfScope.push({ rowId: planRow?.row?.id, title: planRow?.row?.title, disposition: planRow?.disposition });
    continue;
  }
  const result = draftActivityFromPlan(planRow, CREATED_BY);
  if (result.drafted) {
    drafts.push({ draft: result.draft, planRow });
    if (result.droppedSummary) droppedSummaries.push({ id: result.draft.id, why: result.droppedSummary });
  } else {
    refusals.push({ rowId: planRow?.row?.id, title: planRow?.row?.title, refusal: result.refusal });
  }
}

const refusalCounts = refusals.reduce((acc, r) => {
  const key = r.refusal.kind === "not-attachable" ? `not-attachable:${r.refusal.disposition}` : r.refusal.kind;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — cannot reach the table.");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// One read for every id this run drafted. Asked with the SAME id the draft module produces, so
// "already there?" can never be answered against a second recipe for the identity string.
let existingById = new Map();
if (drafts.length > 0) {
  const ids = drafts.map((d) => d.draft.id);
  const url =
    `${SUPABASE_URL}/rest/v1/activities?select=*&id=in.(${ids.map((i) => `"${i}"`).join(",")})`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`read failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  existingById = new Map((await res.json()).map((r) => [r.id, r]));
}

const toInsert = [];
const alreadyPresent = [];
for (const d of drafts) {
  if (existingById.has(d.draft.id)) alreadyPresent.push(d);
  else toInsert.push(d);
}

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        considered: planRows.length,
        outOfScope: outOfScope.length,
        drafted: drafts.length,
        refused: refusals.length,
        refusalCounts,
        alreadyPresent: alreadyPresent.map((d) => d.draft.id),
        wouldInsert: toInsert.map((d) => d.draft),
        droppedSummaries,
        applied: false,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`\nplan rows considered   ${planRows.length}`);
console.log(`out of Q85's scope     ${outOfScope.length} — no recorder saw them; Q84's pass asks a human, this one never writes them`);
console.log(`drafted                ${drafts.length}`);
console.log(`refused                ${refusals.length}` + (refusals.length ? ` — ${Object.entries(refusalCounts).map(([k, v]) => `${k}:${v}`).join("  ")}` : ""));
console.log(`already in the CRM     ${alreadyPresent.length}`);
console.log(`would insert           ${toInsert.length}\n`);

for (const d of toInsert) {
  const s = d.draft;
  console.log(`  + ${s.id}`);
  console.log(`      org=${s.orgId}  occurred=${s.occurredAt}  dayFrom=${s.sourceContext.dayFrom}  matchedBy=${s.sourceContext.matchedBy ?? "—"}`);
  console.log(`      "${(d.planRow.row.title || "").slice(0, 90)}"`);
  console.log(`      summary=${s.summary ? `${s.summary.length} chars` : "none"}`);
}
for (const d of droppedSummaries) console.log(`\n  ! ${d.id}: ${d.why}`);
for (const d of alreadyPresent) console.log(`\n  = ${d.draft.id} already present — left exactly as it is (this pass never overwrites a meeting row)`);

if (!APPLY) {
  console.log(`\nPLAN ONLY — nothing written. Re-run with --apply to insert the ${toInsert.length} row(s) above.`);
  process.exit(0);
}

if (toInsert.length === 0) {
  console.log(`\n--apply with nothing to insert — no-op.`);
  process.exit(0);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/activities`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify(toInsert.map((d) => toRow(d.draft))),
});
if (!res.ok) {
  console.error(`\nwrite failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const written = await res.json();
console.log(`\nWROTE ${written.length} activity row(s):`);
for (const w of written) console.log(`  ${w.id}  type=${w.type}  org=${w.org_id}  occurred=${w.occurred_at}`);
console.log(`\nRe-run \`npm run check:archive\` to see the reconciliation move.`);

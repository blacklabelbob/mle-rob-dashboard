#!/usr/bin/env node
/**
 * publish-meeting-activity.mjs — Q89 inc.6. Put a reviewed meeting activity into the
 * `activities` table so the four blocks have something to render.
 *
 * Everything Q89 built up to now is upstream of storage: inc.1 the gate, inc.2 the face,
 * inc.3/4 the seam on both surfaces, inc.5 the Omega payload on disk and green in CI. All
 * four ended on the same wall — `activities` holds zero rows of type `meeting`, so every
 * surface correctly returns null. This is the write that removes the wall.
 *
 * WHY THE VERBATIM RULE IS RE-CHECKED HERE and not left to CI:
 * `lib/meetings/meetingIntel.ts` rejects a paraphrased pain point at RENDER time, which
 * protects Rob's screen. It does not protect the TABLE. A pain point that reaches prod
 * storage as our wording is a wrong claim sitting in the CRM whether or not a component
 * happens to hide it, and the next reader of that row — an export, a deck, an agent — will
 * not run the gate. So the check runs again at the write boundary, in this file's own
 * plain-JS implementation. Two independent implementations of one rule is the point: if
 * they ever disagree, the write is refused and a human looks.
 *
 * PLAN BY DEFAULT. Without `--apply` this prints exactly what it would write and exits 0
 * having touched nothing. Hand-editing prod rows is what Q84 exists to clean up after.
 *
 * IDEMPOTENT. An identical row already present is a no-op that says so. A row present and
 * DIFFERENT is never silently overwritten — it prints which columns differ and requires
 * `--force` on top of `--apply`, because "the driver quietly rewrote a meeting record" is
 * a sentence nobody should have to read.
 *
 * TOUCHES NOTHING ELSE. Only `activities`, only the one id in the payload. No deal, no
 * money field, no signed/quoted column, no delete — ever, in any mode.
 *
 * Usage:
 *   node scripts/publish-meeting-activity.mjs data/meetings/2026-07-28-omega.activity.json
 *   node scripts/publish-meeting-activity.mjs <file> --apply
 *   node scripts/publish-meeting-activity.mjs <file> --apply --force
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");

if (!file) {
  console.error("usage: publish-meeting-activity.mjs <activity.json> [--apply] [--force]");
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
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

/* ── the verbatim rule, re-implemented ───────────────────────────────────────────────── */

/**
 * Deliberately a second implementation of `isVerbatim` in `lib/meetings/meetingIntel.ts`.
 * Same normalization — whitespace collapsed, case folded, smart quotes flattened — and
 * nothing else. It must never grow a cleverer match: every allowance added here is a
 * sentence of ours that can pass as a sentence of theirs.
 */
function normalize(s) {
  return String(s)
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isVerbatim(text, excerpt) {
  const t = normalize(text);
  const e = normalize(excerpt);
  return t.length > 0 && e.length > 0 && e.includes(t);
}

const KINDS = ["action-items", "talking-points", "pain-points", "benefits-us"];

/**
 * Structural refusals. Each one is a claim that would otherwise reach the table unproven.
 * A refusal returns a REASON string; the caller prints every reason and writes nothing.
 */
function auditActivity(a) {
  const problems = [];
  if (a?.type !== "meeting") problems.push(`type is "${a?.type}" — only meeting rows carry intel`);
  if (!a?.id) problems.push("no id");
  if (!a?.orgId && !a?.personId) problems.push("neither orgId nor personId — nothing could ever surface it");
  if (!a?.occurredAt) problems.push("no occurredAt — the timeline could not place it");

  const intel = a?.sourceContext?.intel;
  if (!Array.isArray(intel) || intel.length === 0) {
    problems.push("sourceContext.intel is empty — writing this row would add a meeting with nothing to render");
    return problems;
  }

  intel.forEach((e, i) => {
    const at = `intel[${i}]`;
    if (!KINDS.includes(e?.kind)) problems.push(`${at}: kind "${e?.kind}" names no block`);
    if (!e?.text || !String(e.text).trim()) problems.push(`${at}: no text`);
    if (!e?.sourceRef || !String(e.sourceRef).trim())
      problems.push(`${at}: no sourceRef — "somewhere in the transcript" is not traceability`);
    if (e?.kind === "pain-points") {
      if (!e?.excerpt || !String(e.excerpt).trim()) {
        problems.push(`${at}: pain point with no excerpt — unchecked is not shown`);
      } else if (!isVerbatim(e.text, e.excerpt)) {
        problems.push(
          `${at}: PAIN POINT IS NOT VERBATIM — text is not a substring of its own excerpt. ` +
            `text=${JSON.stringify(String(e.text).slice(0, 120))}`,
        );
      }
    }
  });
  return problems;
}

/* ── row mapping (mirrors fromActivity in lib/crm.ts) ────────────────────────────────── */

function toRow(a) {
  return {
    id: a.id,
    person_id: a.personId ?? null,
    org_id: a.orgId ?? null,
    deal_id: a.dealId ?? null,
    created_by: a.createdBy ?? null,
    type: a.type,
    source: a.source,
    source_context: a.sourceContext ?? {},
    summary: a.summary ?? null,
    action_items: a.actionItems ?? null,
    buying_signals: a.buyingSignals ?? null,
    recording_url: a.recordingUrl ?? null,
    transcript_url: a.transcriptUrl ?? null,
    book_protected: a.bookProtected ?? false,
    occurred_at: a.occurredAt,
    created_at: a.createdAt ?? null,
  };
}

/**
 * Key order and timestamp SPELLING are not differences, and the first live run proved it:
 * immediately after a successful write, a naive `JSON.stringify` compare called
 * `source_context` and `occurred_at` changed — Postgres returns jsonb with its own key
 * order and a timestamptz as `+00:00` where we sent `Z`. A no-op that reports a diff
 * trains the reader to reach for `--force`, which is the exact habit this script exists
 * to prevent. So: objects compare with sorted keys, timestamps compare as instants.
 */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical(v[k])]),
    );
  }
  return v ?? null;
}

const TIMESTAMP_COLUMNS = new Set(["occurred_at", "created_at"]);

function sameInstant(a, b) {
  if (a == null || b == null) return a == null && b == null;
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) ? x === y : String(a) === String(b);
}

function diffColumns(existing, next) {
  const changed = [];
  for (const k of Object.keys(next)) {
    if (k === "created_at") continue; // storage stamps this; not ours to argue with
    if (TIMESTAMP_COLUMNS.has(k)) {
      if (!sameInstant(existing?.[k], next[k])) changed.push(k);
      continue;
    }
    if (JSON.stringify(canonical(existing?.[k])) !== JSON.stringify(canonical(next[k]))) changed.push(k);
  }
  return changed;
}

/* ── run ─────────────────────────────────────────────────────────────────────────────── */

const payload = JSON.parse(readFileSync(file, "utf8"));
const activity = payload.activity ?? payload;

const problems = auditActivity(activity);
if (problems.length > 0) {
  console.error(`REFUSED — ${file} did not pass the write-boundary check:`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error("\nNothing was written. Fix the payload, not this check.");
  process.exit(1);
}

const intel = activity.sourceContext.intel;
const byKind = Object.fromEntries(KINDS.map((k) => [k, intel.filter((e) => e.kind === k).length]));

console.log(`payload   ${file}`);
console.log(`activity  ${activity.id}  ${activity.type}  org=${activity.orgId ?? "—"}  occurred=${activity.occurredAt}`);
console.log(`intel     ${intel.length} entries — ` + KINDS.map((k) => `${k}:${byKind[k]}`).join("  "));
console.log(`verbatim  ${byKind["pain-points"]}/${byKind["pain-points"]} pain points re-checked against their own excerpt at the write boundary`);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("\nno SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — cannot reach the table.");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const getRes = await fetch(
  `${SUPABASE_URL}/rest/v1/activities?id=eq.${encodeURIComponent(activity.id)}&select=*`,
  { headers },
);
if (!getRes.ok) {
  console.error(`\nread failed: ${getRes.status} ${await getRes.text()}`);
  process.exit(1);
}
const existing = (await getRes.json())[0] ?? null;
const row = toRow(activity);

if (existing) {
  const changed = diffColumns(existing, row);
  if (changed.length === 0) {
    console.log(`\nalready present and identical — no-op.`);
    process.exit(0);
  }
  console.log(`\nALREADY PRESENT AND DIFFERENT. columns that would change: ${changed.join(", ")}`);
  if (!(APPLY && FORCE)) {
    console.log("refusing to overwrite an existing meeting row without --apply --force.");
    process.exit(0);
  }
}

if (!APPLY) {
  console.log(`\nPLAN ONLY — would INSERT ${activity.id} into activities. Re-run with --apply to write.`);
  process.exit(0);
}

const upRes = await fetch(`${SUPABASE_URL}/rest/v1/activities`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify([row]),
});
if (!upRes.ok) {
  console.error(`\nwrite failed: ${upRes.status} ${await upRes.text()}`);
  process.exit(1);
}
const written = (await upRes.json())[0];
console.log(`\nWROTE ${written.id} — type=${written.type} org=${written.org_id} intel=${written.source_context?.intel?.length ?? 0}`);

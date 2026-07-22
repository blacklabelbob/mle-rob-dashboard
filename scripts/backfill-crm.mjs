#!/usr/bin/env node
// Task 2.7 (PRD Phase 2 / BUILD-QUEUE Q9): backfill deals/activities from the
// money fields already living on people/orgs — D-002 migration-path steps 7-10
// (docs/plans/sources/DATA-MODEL-crm-erd-2026-07-17.md §3).
//   step 7: one deals row per person/org carrying quoted/signed data
//           (stage derived from signed/key_dates, value = quoted_amount)
//   step 8: meeting_video_url / transcript_url → one activities row (type=meeting;
//           transcript stays a URL until Task 7.4's transcripts table)
//   step 9: assigned_rep → deals.owner_id free text (FK-resolved in Task 4.6)
//   step 10: people.estimate jsonb carried as deals.estimate
//
// Deviations from a literal "one row per person" reading, both truth-gate driven:
// * MERGE: post-0003, one real engagement can sit mirrored on a person AND their
//   org (caleb-green + cg-roofing-group share the same signed/invoiced dates).
//   Blind per-row synthesis would double-count that money on any deals rollup —
//   so an eligible person whose org_id points at an eligible org folds into ONE
//   deal anchored to both, org data winning conflicts. Rob cites these numbers.
// * DEMO SKIP: demo-* rows (rep-cockpit fixtures, filtered from the live graph)
//   are excluded — $39.5k of fiction must not enter the deals table. Reported,
//   never silently dropped.
//
// Idempotent: deal/activity ids are deterministic (deal-<rowId>); existing ids
// are fetched first and only missing rows insert — re-run = 0 writes.
// Reads people/orgs only; NEVER writes back to them (quoted/signed/paid fields
// untouched, per the driver's hard limits).
// Usage: node scripts/backfill-crm.mjs           (dry-run report)
//        node scripts/backfill-crm.mjs --apply   (insert missing rows)

import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const isDemo = (row) => row.id.startsWith("demo-");

// D-002 step 7 eligibility: the row carries quoted/signed data.
export function isEligible(row) {
  return (
    row.quoted_amount != null ||
    row.signed === true ||
    Object.keys(row.key_dates ?? {}).length > 0
  );
}

// Stage ladder off signed/key_dates — Task 1.6 DRAFT list (0005 check constraint).
// Furthest milestone wins; explicit dates outrank the bare boolean.
export function deriveStage(row) {
  const kd = row.key_dates ?? {};
  if (kd.paid) return "paid";
  if (kd.invoiced) return "invoiced";
  if (kd.signed || row.signed) return "signed";
  if (kd.quoted || row.quoted_amount != null) return "quote_sent";
  if (kd.met) return "meeting_held";
  return "new_lead";
}

function toDeal(row, { personId = null, orgId = null, mergedFrom = null }) {
  return {
    id: `deal-${row.id}`,
    person_id: personId,
    org_id: orgId,
    vertical_id: row.vertical_id ?? null,
    owner_id: row.assigned_rep ?? null, // step 9
    name: row.name,
    stage: deriveStage(row),
    value: row.quoted_amount, // step 7: verbatim, never invented
    referral_sourced: row.referred_by_id != null || row.referred_by_org_id != null,
    key_dates: row.key_dates ?? {},
    estimate: row.estimate ?? null, // step 10
    book_protected: false,
    notes: `Backfilled from ${orgId && personId ? "org+person rows" : orgId ? "org row" : "person row"} by scripts/backfill-crm.mjs (D-002 steps 7-10)${mergedFrom ? `; merged mirror row ${mergedFrom}` : ""}`,
    _source: row.id,
  };
}

// Step 8: one meeting activity per non-null meeting_video_url/transcript_url.
// Anchor rule per 0005 checks: at most one of person/org, deal always linked.
function toMeetingActivity(row, dealId, { personId = null, orgId = null }) {
  return {
    id: `act-meeting-${row.id}`,
    person_id: personId,
    org_id: personId ? null : orgId,
    deal_id: dealId,
    type: "meeting",
    source: "manual",
    source_context: { backfill: "scripts/backfill-crm.mjs", from_row: row.id },
    recording_url: row.meeting_video_url ?? null,
    transcript_url: row.transcript_url ?? null,
    occurred_at: row.key_dates?.met
      ? new Date(`${row.key_dates.met}T12:00:00Z`).toISOString()
      : undefined, // column default (now) when no met date exists
    _source: row.id,
  };
}

// A person folds into their org's deal only when nothing would be lost:
// same/no quoted amount and no key_dates the org doesn't already carry.
export function canMerge(person, org) {
  if (person.org_id !== org.id) return false;
  if (
    person.quoted_amount != null &&
    org.quoted_amount != null &&
    person.quoted_amount !== org.quoted_amount
  )
    return false;
  const orgKd = org.key_dates ?? {};
  return Object.entries(person.key_dates ?? {}).every(([k, v]) => orgKd[k] === v);
}

export function planBackfill({ people, orgs }) {
  const demoSkipped = [...people, ...orgs].filter((r) => isDemo(r) && isEligible(r));
  const livePeople = people.filter((r) => !isDemo(r));
  const liveOrgs = orgs.filter((r) => !isDemo(r));
  const orgById = new Map(liveOrgs.map((o) => [o.id, o]));

  const deals = [];
  const conflicts = [];
  const mergedPersonIds = new Set();

  for (const org of liveOrgs.filter(isEligible)) {
    const linked = livePeople.filter((p) => p.org_id === org.id && isEligible(p));
    const mergeable = linked.filter((p) => canMerge(p, org));
    for (const p of linked.filter((p) => !canMerge(p, org)))
      conflicts.push({ person: p.id, org: org.id, reason: "divergent quoted_amount/key_dates — separate deals kept" });
    // ≥2 mergeable people on one org would be ambiguous — anchor org-only then.
    const personAnchor = mergeable.length === 1 ? mergeable[0] : null;
    if (personAnchor) mergedPersonIds.add(personAnchor.id);
    deals.push(
      toDeal(
        { ...org, quoted_amount: org.quoted_amount ?? personAnchor?.quoted_amount ?? null },
        { personId: personAnchor?.id ?? null, orgId: org.id, mergedFrom: personAnchor?.id ?? null },
      ),
    );
  }

  for (const p of livePeople.filter(isEligible)) {
    if (mergedPersonIds.has(p.id)) continue;
    // Person-rooted deal; org anchored too when known (allowed by 0005).
    deals.push(toDeal(p, { personId: p.id, orgId: p.org_id ?? null }));
  }

  const activities = [];
  for (const row of [...livePeople, ...liveOrgs]) {
    if (row.meeting_video_url == null && row.transcript_url == null) continue;
    const isPerson = livePeople.includes(row);
    const dealId =
      deals.find((d) => d._source === row.id)?.id ??
      (isPerson && mergedPersonIds.has(row.id)
        ? deals.find((d) => d.person_id === row.id)?.id
        : undefined) ??
      null;
    activities.push(
      toMeetingActivity(row, dealId, {
        personId: isPerson ? row.id : null,
        orgId: isPerson ? null : row.id,
      }),
    );
  }

  return { deals, activities, demoSkipped, conflicts };
}

// Existing-id filter = the idempotency mechanism (re-run inserts nothing).
export function filterExisting(planned, existingIds) {
  const existing = new Set(existingIds);
  return planned.filter((r) => !existing.has(r.id));
}

async function main() {
  const envPath = new URL("../.env.local", import.meta.url);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
  const URL_ = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const get = async (path) => {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json();
  };

  const [people, orgs, existingDeals, existingActs] = await Promise.all([
    get("people?select=*"),
    get("orgs?select=*"),
    get("deals?select=id"),
    get("activities?select=id"),
  ]);

  const plan = planBackfill({ people, orgs });
  const newDeals = filterExisting(plan.deals, existingDeals.map((d) => d.id));
  const newActs = filterExisting(plan.activities, existingActs.map((a) => a.id));

  console.log(`Backfill plan (people=${people.length}, orgs=${orgs.length}):`);
  for (const d of plan.deals) {
    const anchors = [d.person_id && `person:${d.person_id}`, d.org_id && `org:${d.org_id}`].filter(Boolean).join(" + ");
    console.log(
      `  ${newDeals.includes(d) ? "NEW " : "SKIP"} ${d.id}  stage=${d.stage}  value=${d.value ?? "—"}  ${anchors}${d.referral_sourced ? "  [referral]" : ""}`,
    );
  }
  console.log(`  activities: ${plan.activities.length} planned, ${newActs.length} new (meeting_video/transcript rows)`);
  for (const s of plan.demoSkipped) console.log(`  DEMO-SKIP ${s.id} (quoted=${s.quoted_amount ?? "—"}) — fixture, kept out of money tables`);
  for (const c of plan.conflicts) console.log(`  ⚠ CONFLICT ${c.person} vs ${c.org}: ${c.reason}`);
  console.log(`Totals: ${plan.deals.length} deals planned, ${newDeals.length} to insert; existing untouched.`);

  if (!process.argv.includes("--apply")) {
    console.log("Dry-run only. Re-run with --apply to insert.");
    return;
  }
  const strip = ({ _source, ...row }) => JSON.parse(JSON.stringify(row)); // drops undefined occurred_at
  const post = async (path, rows) => {
    if (rows.length === 0) return;
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(rows.map(strip)),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  };
  await post("deals", newDeals);
  await post("activities", newActs);
  console.log(`APPLIED: ${newDeals.length} deals, ${newActs.length} activities inserted.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

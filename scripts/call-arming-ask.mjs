#!/usr/bin/env node
// BUILD-QUEUE Q68 (c) inc.44 — WHAT TO ACTUALLY ASK ROB FOR, read from the deployment
// instead of from a document.
//
// WHY THIS EXISTS: inc.22 built an arming report that answers this exactly, and every
// increment since has still quoted a HAND-COPIED key list — "all three keys are Rob's
// (PING-INBOX)". That list went stale without anyone noticing: on 2026-07-28 prod reported
// `ANTHROPIC_API_KEY` **armed** (already added), while `TWILIO_AUTH_TOKEN` — the FIRST
// blocker, the one that makes the webhook answer 503 before it reads a body — had never
// appeared on any ask at all. Rob was being asked for a key he had already set and not
// asked for the one blocking everything.
//
// A copied list is what went stale, so this copies nothing and derives nothing: it prints
// the live report's own `missing` / `nextStep` / `repair` fields verbatim. If this script
// and the endpoint ever disagree, the endpoint is right — that is the whole design.
//
//   node scripts/call-arming-ask.mjs [baseUrl]
//
// Default base is prod, because the ask is always about the deployment Rob would place a
// real call into — never a localhost that has the keys in `.env.local`.
//
// NO KEYS ARE READ OR PRINTED. The endpoint's body is env var NAMES and booleans (inc.22
// rule: keys never reach the pure layer), and this only reprints what it answered.

const BASE = process.argv[2] ?? "https://mle-rob-dashboard.vercel.app";
const URL_ = `${BASE.replace(/\/$/, "")}/api/admin/call-readiness`;

const res = await fetch(URL_, { headers: { "Cache-Control": "no-store" } });
if (!res.ok) {
  console.error(`call-arming-ask: ${URL_} answered ${res.status}`);
  process.exit(1);
}
const r = await res.json();

console.log(`ARMING ASK — ${BASE}`);
console.log(`checked:  ${r.checkedAt}`);
console.log(`verdict:  ${r.verdict} (reached: ${r.reached})`);
console.log(`headline: ${r.headline}`);
console.log("");
console.log("LIVE CHAIN — a call cannot complete without these:");
for (const s of r.stages ?? []) {
  console.log(`  [${s.state === "armed" ? "SET " : "MISS"}] ${s.env.padEnd(20)} ${s.stage}`);
}
console.log("");
console.log(`ASK ROB FOR (in this order): ${(r.missing ?? []).join(", ") || "(nothing — chain is armed)"}`);
console.log(`NEXT STEP: ${r.nextStep}`);

for (const w of r.warnings ?? []) console.log(`WARNING: ${w}`);

// inc.43's section. Absent on a deployment older than inc.43 — reported as unknown rather
// than as "no doors", because an older prod silently missing this section is precisely how
// a fourth key (CRON_SECRET) stays invisible.
if (!r.repair) {
  console.log("");
  console.log("REPAIR DOORS: not reported — this deployment predates inc.43. Redeploy to see them.");
} else {
  console.log("");
  console.log("REPAIR DOORS (for calls ALREADY filed — never a reason to delay the chain keys):");
  for (const d of r.repair.doors ?? []) {
    console.log(`  [${d.state === "open" ? "OPEN" : "INRT"}] ${d.door}: needs ${d.missing.join(", ") || "nothing"}`);
  }
}

console.log("");
console.log(r.configNote);

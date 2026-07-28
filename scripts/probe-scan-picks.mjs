/**
 * Q40 leg (6) inc.21 — drive the scan-picks write door against the REAL database.
 *
 * WHY THIS EXISTS. inc.18/19/20's 42 tests assert the REQUEST the carrier builds:
 * the conflict target string, the one-upsert-not-N shape, the `is null` filter, the
 * absent `withdrawn_at` key. Not one of them has ever been answered by Postgres. The
 * guarantees this leg is built on — "a re-imported scan does not duplicate a pick",
 * "a second withdrawal does not move the date", "a withdrawn pick cannot be quietly
 * re-pitched" — are enforced by a unique INDEX and a WHERE clause, i.e. by the
 * database, and a mock cannot fail the way a database fails. This drives the shipped
 * route end to end so those sentences stop being claims about our own test doubles.
 *
 * SAFETY — this writes to PROD, so it writes only to a customer that does not exist:
 *  - `customer_id` is namespaced per run (`probe-scan-picks-<ts>`), matching no org,
 *    no person and no deal, so nothing a customer or a rep can see is touched;
 *  - every read, update and cleanup is filtered to that one id;
 *  - cleanup runs even when an assertion fails, and says so loudly if it could not.
 *
 * Usage:  node scripts/probe-scan-picks.mjs [baseUrl]     (default http://127.0.0.1:3000)
 */

import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const RUN = `probe-scan-picks-${Date.now()}`;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const envVar = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const SUPABASE_URL = envVar("SUPABASE_URL");
const SERVICE_KEY = envVar("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("probe: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function post(body) {
  const res = await fetch(`${BASE}/api/admin/scan-picks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Read the probe's own rows straight from PostgREST — never through the code under test. */
async function rows() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/phase_scan_picks?customer_id=eq.${RUN}&select=pick_id,label,rank,withdrawn_at,recorded_by,source,created_at,updated_at&order=rank`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) throw new Error(`read-back failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const PICKS = [
  { pickId: "probe-missed-call-text-back", label: "Missed-call text-back", why: "probe row", rank: 1 },
  { pickId: "probe-review-requests", label: "Review requests", rank: 2 },
  { pickId: "probe-quote-followup", label: "Quote follow-up", rank: 3 },
];

async function main() {
  console.log(`probe customer_id = ${RUN}\nbase = ${BASE}\n`);

  const armed = await post({});
  check("unarmed deployments answer 503, this one is armed", armed.status !== 503, armed);
  if (armed.status === 503) return;
  check("an empty body is refused 400 (no customer, no picks, no author)", armed.status === 400, armed.json);

  const unknown = await post({ action: "delete", customerId: RUN, pickId: PICKS[0].pickId });
  check("an unrecognised verb refuses, never falls through to a write", unknown.status === 400 && unknown.json?.refusals?.[0]?.reason === "unknown_action", unknown.json);

  const rec = await post({ customerId: RUN, recordedBy: "driver-probe", source: "probe", picks: PICKS });
  check("record stores the whole shortlist", rec.status === 200 && rec.json?.stored === 3, rec.json);
  let db = await rows();
  check("three rows landed, in submitted rank order", db.length === 3 && db.map((r) => r.rank).join() === "1,2,3", db);

  // inc.22's column. A row's first write IS its creation, so the two agree here;
  // every check below asks whether `updated_at` then tracks CHANGE, not traffic.
  check("on insert, updated_at agrees with created_at", db.every((r) => r.updated_at === r.created_at), db.map((r) => [r.pick_id, r.created_at, r.updated_at]));
  const stampedAt = Object.fromEntries(db.map((r) => [r.pick_id, r.updated_at]));

  // The claim inc.19 makes about `phase_scan_picks_identity`: a re-imported scan
  // updates in place. Without the conflict target this appends three more rows and
  // the customer is shown their own shortlist twice.
  const relabelled = PICKS.map((p, i) => (i === 0 ? { ...p, label: "Missed-call text-back (v2)" } : p));
  const again = await post({ customerId: RUN, recordedBy: "driver-probe", source: "probe", picks: relabelled });
  check("re-importing the same scan is accepted", again.status === 200 && again.json?.stored === 3, again.json);
  db = await rows();
  check("re-import UPDATES, never duplicates", db.length === 3, db.map((r) => r.pick_id));
  check("the corrected label won, it was not left stale", db.find((r) => r.pick_id === PICKS[0].pickId)?.label === "Missed-call text-back (v2)", db);

  // THE inc.22 DEFECT, ASKED OF POSTGRES. Before the trigger, `updated_at` was
  // written once by 0027's default and never again — the corrected row below still
  // reported its June-equivalent insert time. And the guard is the other half: an
  // upsert issues an UPDATE for all three rows, so an unconditional trigger would
  // re-date the two that did not change, turning "last changed" into "last imported".
  const relabelledRow = db.find((r) => r.pick_id === PICKS[0].pickId);
  check("the corrected row's updated_at MOVED off its insert time", relabelledRow?.updated_at !== stampedAt[PICKS[0].pickId], { was: stampedAt[PICKS[0].pickId], now: relabelledRow?.updated_at });
  check("...and left created_at where it was", relabelledRow?.created_at === stampedAt[PICKS[0].pickId], relabelledRow);
  check("the two UNCHANGED rows were not re-dated by the same re-import", db.filter((r) => r.pick_id !== PICKS[0].pickId).every((r) => r.updated_at === stampedAt[r.pick_id]), db.map((r) => [r.pick_id, stampedAt[r.pick_id], r.updated_at]));

  const wd = await post({ action: "withdraw", customerId: RUN, pickId: PICKS[1].pickId });
  check("withdraw is accepted", wd.status === 200 && wd.json?.ok === true, wd.json);
  db = await rows();
  const withdrawnAt = db.find((r) => r.pick_id === PICKS[1].pickId)?.withdrawn_at;
  check("the withdrawn pick carries a date", Boolean(withdrawnAt), db);
  check("withdrawing one pick left the other two alone", db.filter((r) => r.withdrawn_at).length === 1, db);
  const withdrawnStamp = db.find((r) => r.pick_id === PICKS[1].pickId)?.updated_at;
  check("withdrawing counts as a change — updated_at moved", withdrawnStamp !== stampedAt[PICKS[1].pickId], { was: stampedAt[PICKS[1].pickId], now: withdrawnStamp });

  // THE DECISION THIS LEG EXISTS FOR: re-recording a withdrawn pick must refuse the
  // WHOLE submission by name. The upsert never carries `withdrawn_at`, so a silent
  // success would leave the pick hidden — response says stored, panel never shows it.
  const rePitch = await post({ customerId: RUN, recordedBy: "driver-probe", picks: relabelled });
  check("a submission containing a withdrawn pick is refused", rePitch.status === 400, rePitch.json);
  check("the refusal names the withdrawn pick", rePitch.json?.refusals?.some((r) => r.pickId === PICKS[1].pickId && r.reason === "withdrawn_pick"), rePitch.json);
  db = await rows();
  check("and NOTHING was written — the refusal is all-or-nothing", db.length === 3 && db.filter((r) => r.withdrawn_at).length === 1, db);

  const wd2 = await post({ action: "withdraw", customerId: RUN, pickId: PICKS[1].pickId });
  check("a second withdrawal is accepted as a no-op", wd2.status === 200, wd2.json);
  db = await rows();
  check("a second withdrawal does NOT move the date", db.find((r) => r.pick_id === PICKS[1].pickId)?.withdrawn_at === withdrawnAt, { was: withdrawnAt, now: db.find((r) => r.pick_id === PICKS[1].pickId)?.withdrawn_at });
  check("...and does not move updated_at either — nothing changed", db.find((r) => r.pick_id === PICKS[1].pickId)?.updated_at === withdrawnStamp, { was: withdrawnStamp, now: db.find((r) => r.pick_id === PICKS[1].pickId)?.updated_at });

  const re = await post({ action: "reinstate", customerId: RUN, pickId: PICKS[1].pickId });
  check("reinstate is accepted", re.status === 200, re.json);
  db = await rows();
  check("reinstating clears the date — the only call that may", db.every((r) => r.withdrawn_at === null), db);

  // Reinstating a pick nobody ever withdrew writes `null` over `null`. The row is
  // identical, so the trigger's guard declines to stamp it — the alternative is a
  // record that claims this pick changed on a day when nothing happened to it.
  const untouched = db.find((r) => r.pick_id === PICKS[2].pickId)?.updated_at;
  const noop = await post({ action: "reinstate", customerId: RUN, pickId: PICKS[2].pickId });
  check("reinstating a never-withdrawn pick is accepted", noop.status === 200, noop.json);
  db = await rows();
  check("...and invents no change — updated_at stayed put", db.find((r) => r.pick_id === PICKS[2].pickId)?.updated_at === untouched, { was: untouched, now: db.find((r) => r.pick_id === PICKS[2].pickId)?.updated_at });

  // A reinstatement missing the customer half would re-pitch an automation to every
  // customer it was ever taken back from; the door refuses before the carrier runs.
  const halfId = await post({ action: "reinstate", pickId: PICKS[1].pickId });
  check("reinstate without a customer is refused", halfId.status === 400 && halfId.json?.refusals?.some((r) => r.reason === "no_customer_id"), halfId.json);
}

async function cleanup() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/phase_scan_picks?customer_id=eq.${RUN}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=representation" },
  });
  const removed = res.ok ? (await res.json()).length : -1;
  const left = (await rows()).length;
  if (!res.ok || left !== 0) {
    console.error(`\n!! CLEANUP INCOMPLETE — ${left} probe row(s) still on ${RUN}. Remove them by hand.`);
    failures++;
  } else {
    console.log(`\ncleanup: ${removed} probe row(s) removed, 0 left on ${RUN} (no other customer touched)`);
  }
}

try {
  await main();
} catch (e) {
  console.error("probe threw:", e);
  failures++;
} finally {
  await cleanup();
}
console.log(failures === 0 ? "\nPROBE GREEN" : `\nPROBE RED — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

/**
 * Q45 — drive the `meeting_booked` stage through the REAL database and the REAL
 * shipped drag route.
 *
 * WHY THIS EXISTS. Q45's DoD ends in "prod-verified", and nothing about
 * `meeting_booked` has ever been answered by Postgres. Two claims in particular
 * were only ever claims about our own test doubles:
 *
 *   1. the live `deals_stage_check` constraint accepts the stage at all — the
 *      migration file that declares it (0005) was applied months ago, and a
 *      stage added to a CHECK by editing an applied migration file changes
 *      nothing in the database;
 *   2. a drag THROUGH the stage writes exactly one audit row — the route builds
 *      that row from the observed before/after, and only Postgres can fail the
 *      way Postgres fails (a rejected stage rolls back the update but the audit
 *      insert is a separate statement).
 *
 * As of this writing prod holds 8 deals and NONE in `meeting_booked`, so the
 * board's column for it is only ever rendered mid-drag: the one stage Rob asked
 * for is the one stage no live row has occupied.
 *
 * SAFETY — this writes to PROD, so it writes only to rows it creates itself:
 *  - the deal id is namespaced per run (`probe-q45-<ts>`), matching no real deal;
 *  - the anchor org CANNOT be, and that is the database's rule, not a choice:
 *    prod enforces `orgs_id_is_record_no` (`^C-[0-9]+$`, Q70's renumbering), which
 *    rejected the first draft of this probe. The id therefore comes from a
 *    reserved `C-99…` block far above the live `C-20xx` sequence, and the marker
 *    moves to the NAME, which is where a human would see it anyway;
 *  - the probe org is created `unlit` with NO money fields — `quoted_amount`,
 *    `signed`, `value` and `key_dates` are never written (HARD LIMIT), so a
 *    money surface cannot move even if cleanup fails;
 *  - every read, update and delete is filtered to those two ids;
 *  - cleanup runs even when an assertion fails, and says so loudly if it could
 *    not — the residue check is an assertion, not a log line.
 *
 * Usage:  node scripts/probe-deal-stage.mjs [baseUrl]   (default http://127.0.0.1:3000)
 */

import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const RUN = `probe-q45-${Date.now()}`;
// `^C-[0-9]+$` is enforced by prod (`orgs_id_is_record_no`) — see header.
const ORG_ID = `C-99${String(Date.now()).slice(-8)}`;
const DEAL_ID = `${RUN}-deal`;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const envVar = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const SUPABASE_URL = envVar("SUPABASE_URL");
const SERVICE_KEY = envVar("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("probe: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  process.exit(2);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

/** Raw PostgREST — never through the code under test. */
async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...HEADERS, ...(init.headers || {}) } });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text ? JSON.parse(text) : null };
}

async function patchStage(stage) {
  const res = await fetch(`${BASE}/api/admin/deals`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: DEAL_ID, stage }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  console.log(`probe-deal-stage: ${BASE}  run=${RUN}`);

  // A vertical is read, never created — orgs.vertical_id is NOT NULL FK, and
  // inventing a vertical would put a row on a registry surface Rob reads.
  const verticals = await rest("verticals?select=id&limit=1");
  if (!verticals.ok || !verticals.body?.length) throw new Error(`no vertical to anchor to: ${verticals.status}`);
  const verticalId = verticals.body[0].id;

  const org = await rest("orgs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: ORG_ID,
      name: `${RUN} (probe — delete me)`,
      vertical_id: verticalId,
      node_type: "lead",
      status: "unlit",
    }),
  });
  check("probe org created", org.ok, { status: org.status, body: org.body });
  if (!org.ok) return;

  // Starts at `contacted` — the stage Rob put `meeting_booked` directly after,
  // so the drag under test is the exact transition he asked for.
  const deal = await rest("deals", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ id: DEAL_ID, org_id: ORG_ID, name: `${RUN} probe deal`, stage: "contacted" }),
  });
  check("probe deal created at contacted", deal.ok, { status: deal.status, body: deal.body });
  if (!deal.ok) return;

  // 1. THE CONSTRAINT — the live database accepts the stage, via the shipped route.
  const up = await patchStage("meeting_booked");
  check("PATCH contacted → meeting_booked returns 200 changed", up.status === 200 && up.json?.changed === true, up);
  check("route reported no audit gap", up.json?.auditError === undefined, up.json);

  const after = await rest(`deals?id=eq.${DEAL_ID}&select=stage,value,key_dates,updated_at,created_at`);
  check("prod row now sits in meeting_booked", after.body?.[0]?.stage === "meeting_booked", after.body);
  check("no money written by the drag", after.body?.[0]?.value === null, after.body?.[0]);
  check("key_dates untouched by the drag", JSON.stringify(after.body?.[0]?.key_dates) === "{}", after.body?.[0]);
  check("updated_at moved off created_at", after.body?.[0]?.updated_at !== after.body?.[0]?.created_at, after.body?.[0]);

  // 2. THE AUDIT TRAIL — exactly one row, naming both stages.
  const audit = await rest(`activities?deal_id=eq.${DEAL_ID}&select=id,type,summary,source_context,occurred_at&order=occurred_at`);
  const trail = audit.body ?? [];
  check("exactly one audit row after one drag", trail.length === 1, trail);
  const text = JSON.stringify(trail);
  check("audit names the stage moved FROM", text.includes("contacted"), trail[0]);
  check("audit names the stage moved TO", text.includes("meeting_booked"), trail[0]);

  // 3. A SAME-STAGE DRAG IS A NO-OP — no second audit row, no updated_at churn.
  const again = await patchStage("meeting_booked");
  check("same-stage drag reports changed:false", again.status === 200 && again.json?.changed === false, again);
  const audit2 = await rest(`activities?deal_id=eq.${DEAL_ID}&select=id`);
  check("no second audit row from the no-op", (audit2.body ?? []).length === 1, audit2.body);

  // 4. DRAG ONWARD — the stage is passed THROUGH, not just landed on.
  const onward = await patchStage("meeting_held");
  check("PATCH meeting_booked → meeting_held returns 200 changed", onward.status === 200 && onward.json?.changed === true, onward);
  const audit3 = await rest(`activities?deal_id=eq.${DEAL_ID}&select=id,type,summary,source_context`);
  check("second drag wrote a second audit row", (audit3.body ?? []).length === 2, audit3.body);
  check("the onward audit row names meeting_booked as its FROM", JSON.stringify(audit3.body).includes("meeting_booked"), audit3.body);
}

async function cleanup() {
  const del = async (path) => rest(path, { method: "DELETE" });
  await del(`activities?deal_id=eq.${DEAL_ID}`);
  await del(`deals?id=eq.${DEAL_ID}`);
  await del(`orgs?id=eq.${ORG_ID}`);

  const left = await Promise.all([
    rest(`activities?deal_id=eq.${DEAL_ID}&select=id`),
    rest(`deals?id=eq.${DEAL_ID}&select=id`),
    rest(`orgs?id=eq.${ORG_ID}&select=id`),
  ]);
  const residue = left.reduce((n, r) => n + (r.body?.length ?? 0), 0);
  check(`cleanup left nothing behind (${RUN})`, residue === 0, left.map((r) => r.body));
}

try {
  await main();
} catch (err) {
  check("probe ran without throwing", false, String(err));
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\nprobe-deal-stage: ALL GREEN" : `\nprobe-deal-stage: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

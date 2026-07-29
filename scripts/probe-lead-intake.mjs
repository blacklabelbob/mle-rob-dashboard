#!/usr/bin/env node
// Q70 inc.11 — EVIDENCE for the renumber, taken from the LIVE inbound path.
//
// inc.9 converted `lib/leads/intakePlan.ts` off `slugify(name)` ids and onto
// `nextPersonId` + `handleFor`. Tests pin that on fixtures. What no test can
// prove is the thing Q70's DoD actually asks for: that the identity minted
// against the REAL prod ledger — 22 people, every id `P-####`, every
// `legacy_slug` present and unique — is a record number and a handle, not a
// slug. Reading prod proves the past; this probe proves the NEXT row.
//
// DEFAULT IS PLAN-ONLY, and here that default is not caution, it is the
// correct end state. `planLeadIntake` also mints a Deal at stage `new_lead`,
// and prod's Pipeline panel is a money surface Rob shows to people ("$17,000
// in play"). Applying a probe lead would put a FABRICATED deal on that panel,
// and nothing in this repo may delete it afterwards (driver hard limit). So
// the probe reads prod, runs the real planner over the real ledger, prints
// exactly what would be written — and writes nothing.
//
//   node scripts/probe-lead-intake.mjs            # preview vs live prod ledger
//   node scripts/probe-lead-intake.mjs --json     # same, machine-readable
//
// There is deliberately NO --apply. The live end-to-end row is Rob's call
// (asked in PING-INBOX 2026-07-29) precisely because it is undeletable and
// lands on a money panel; when he says go, it is one authenticated POST to
// /api/leads with the same payload this prints.
//
// Exit codes: 0 = minted identity is record-shaped (P-#### + a handle that is
// not the id); 1 = anything else, which would mean the renumber is leaking.
//
// TS modules load through Vite's SSR loader — already installed via vitest, so
// no new dependency and the probe runs the SAME modules the 2896 tests cover.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function loadModules() {
  const server = await createServer({
    configFile: false,
    root: repoRoot,
    logLevel: "warn",
    server: { middlewareMode: true },
    appType: "custom",
    // The intake chain imports through the `@/` alias (the ledger sync's
    // modules happen not to). Without this the loader fails on `@/lib/stats`.
    resolve: { alias: { "@": repoRoot.replace(/\/$/, "") } },
  });
  try {
    const [plan, payload, recordId] = await Promise.all([
      server.ssrLoadModule("/lib/leads/intakePlan.ts"),
      server.ssrLoadModule("/lib/leads/intakePayload.ts"),
      server.ssrLoadModule("/lib/recordId.ts"),
    ]);
    return { plan, payload, recordId };
  } finally {
    await server.close();
  }
}

async function rest(url, key, query) {
  const res = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`prod read failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Prod rows → the `Person` shape the planner expects. Only the fields the
 *  planner reads are mapped; `legacy_slug` → `legacySlug` is the one that
 *  matters, because it seeds the handle set (inc.9's `legacySlug ?? id`). */
function toPeople(rows) {
  return rows.map((r) => ({
    id: r.id,
    legacySlug: r.legacy_slug ?? undefined,
    name: r.name,
    entityKind: "person",
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    status: r.status ?? "unlit",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
  }));
}

async function main() {
  const asJson = process.argv.includes("--json");
  if (process.argv.includes("--apply")) {
    throw new Error(
      "--apply does not exist. An applied probe lead is an undeletable fabricated deal on the live Pipeline money panel; see the header."
    );
  }
  loadEnvLocal();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");

  const { plan, payload, recordId } = await loadModules();

  const peopleRows = await rest(url, key, "people?select=id,name,email,phone,status,legacy_slug&limit=1000");
  const people = toPeople(peopleRows);
  // Verticals are a registry read; an empty/absent table is not a probe
  // failure, it just means the vertical reports as unmatched (honestly).
  let verticals = [];
  try {
    verticals = await rest(url, key, "verticals?select=id,name&limit=200");
  } catch {
    verticals = [];
  }

  // A payload that can never be mistaken for a real lead if it is ever POSTed:
  // the worked example, re-contacted so no email/phone can strong-match a real
  // person and silently turn a CREATE probe into a MATCH.
  const example = payload.INTAKE_WORKED_EXAMPLES.aidre;
  const probePayload = {
    ...example,
    contact: {
      name: "Q70 Probe (NOT A REAL LEAD)",
      email: "q70-probe@example.invalid",
      role: example.contact.role,
    },
    company: "Q70 Probe Co (NOT A REAL COMPANY)",
  };

  const result = plan.planLeadIntake(probePayload, people, verticals, new Date().toISOString());

  if (result.person.action !== "create") {
    throw new Error(
      `probe matched an existing person (${result.person.match.personId}) — it must exercise the CREATE path`
    );
  }
  const record = result.person.record;

  const idIsRecordShaped = recordId.isPersonId(record.id);
  const handlePresent = typeof record.legacySlug === "string" && record.legacySlug.length > 0;
  const handleIsNotId = handlePresent && record.legacySlug !== record.id;
  const idNotASlug = !/[a-z]/.test(record.id);
  const ok = idIsRecordShaped && handlePresent && handleIsNotId && idNotASlug;

  const report = {
    ledger: {
      people: people.length,
      allRecordIds: people.every((p) => recordId.isPersonId(p.id)),
      allHandlesPresent: people.every((p) => !!p.legacySlug),
      highestId: people.map((p) => p.id).sort().at(-1),
    },
    wouldWrite: {
      id: record.id,
      legacySlug: record.legacySlug,
      name: record.name,
      dealId: result.deal.id,
      dealStage: result.deal.stage,
    },
    checks: { idIsRecordShaped, handlePresent, handleIsNotId, idNotASlug },
    ok,
    wrote: "nothing",
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("PLAN ONLY · live prod ledger · nothing was written");
    console.log(
      `ledger: ${report.ledger.people} people · all P-#### ${report.ledger.allRecordIds} · all handles present ${report.ledger.allHandlesPresent} · highest ${report.ledger.highestId}`
    );
    console.log(`next inbound lead would be created as:`);
    console.log(`  id          ${record.id}`);
    console.log(`  legacy_slug ${record.legacySlug}`);
    console.log(`  deal        ${result.deal.id} (stage ${result.deal.stage}) — NOT written`);
    console.log(ok ? "OK — record number minted, handle carried separately." : "FAIL — see checks:");
    if (!ok) console.log(JSON.stringify(report.checks, null, 2));
  }
  return ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
);

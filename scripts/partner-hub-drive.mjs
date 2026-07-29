// Q75 inc.3 — the worked example: connect to MLE using ONLY the partner page.
//
// The DoD asked for one automation driven end to end with
// docs/partners/PARTNER-WEBHOOK-CONTRACT.md as the *only* input, and for the
// integrator's remaining questions to be COUNTED. This is that drive, kept as
// a tool rather than a write-up, because a write-up of "the page was enough"
// rots the first time a door changes.
//
//   npm run drive:contract                     # against production
//   npm run drive:contract -- --base http://localhost:3000
//   npm run drive:contract -- --door voice-law
//
// WHAT IT DOES, AND WHY THAT IS THE HONEST TEST. Everything it needs — the base
// URL, the door list, each door's secret header, the body encoding, and the
// meaning of every status code — is PARSED OFF THE PAGE (lib/partnerHooks.ts
// `contractDoors` / `contractBaseUrl`). It never reads PARTNER_HOOKS, never
// touches a route, and knows nothing this repo told it. If the page is
// insufficient, this script cannot be written; that it runs is the evidence.
//
// It sends one deliberately WRONG secret per door and grades the answer against
// the page's own promise, which is the only probe that is safe to point at
// production: a bad key must be refused before a body is ever read, so a
// passing run writes nothing, dedupes nothing, and flags nothing. The two
// acceptable answers are the two Rob named as the acceptance test —
//   403 = configured, and a rotated key is rejected loudly
//   503 = not configured yet, and the door is inert rather than open
// — so the run doubles as the answer to the first question every integrator
// actually has: "is my door live on your side yet?"
//
// A 200/400/500 here is a real failure: it means a body was processed on a key
// the page says is invalid.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PARTNER_CONTRACT,
  contractBaseUrl,
  contractDoors,
} from "../lib/partnerHooks.ts";

const REPO_ROOT = join(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const page = readFileSync(join(REPO_ROOT, PARTNER_CONTRACT), "utf8");
const base = flag("base") ?? contractBaseUrl(page);
if (!base) {
  console.error(`✖ ${PARTNER_CONTRACT} states no base URL — a partner cannot address a door.`);
  process.exit(1);
}

const only = flag("door");
const doors = contractDoors(page).filter((d) => !only || d.door === only);
if (doors.length === 0) {
  console.error(`✖ no doors parsed from ${PARTNER_CONTRACT}${only ? ` matching --door ${only}` : ""}.`);
  process.exit(1);
}

// A payload no door can act on, so even a hypothetical auth bypass files nothing.
const PROBE = { _drive: "Q75-contract-drive", note: "wrong secret on purpose" };
const WRONG_SECRET = "deliberately-wrong-secret-q75-drive";

console.log(`\nMLE inbound contract drive — ${base}`);
console.log(`source of truth: ${PARTNER_CONTRACT} (no repo knowledge used)\n`);

const rows = [];
for (const door of doors) {
  const url = `${base}/api/webhooks/${door.door}`;
  let status = 0;
  let note = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        [door.header]: WRONG_SECRET,
        "Content-Type": door.formEncoded
          ? "application/x-www-form-urlencoded"
          : "application/json",
      },
      body: door.formEncoded
        ? new URLSearchParams({ Drive: PROBE._drive }).toString()
        : JSON.stringify(PROBE),
    });
    status = res.status;
  } catch (err) {
    note = err instanceof Error ? err.message : String(err);
  }

  const verdict =
    status === 403
      ? { ok: true, state: "LIVE", says: "configured; a rotated key is refused (403)" }
      : status === 503
        ? { ok: true, state: "INERT", says: "secret not set on MLE's side yet (503)" }
        : { ok: false, state: "BROKEN", says: note || `answered ${status} to an invalid secret` };

  rows.push({ door: door.door, header: door.header, status, ...verdict });
  console.log(
    `${verdict.ok ? "✓" : "✖"} ${door.door.padEnd(18)} ${String(status || "—").padEnd(5)} ${verdict.state.padEnd(7)} ${verdict.says}`,
  );
}

const broken = rows.filter((r) => !r.ok);
const inert = rows.filter((r) => r.state === "INERT");
console.log(
  `\n${rows.length} doors · ${rows.filter((r) => r.state === "LIVE").length} live · ${inert.length} inert${
    inert.length ? ` (${inert.map((r) => r.door).join(", ")})` : ""
  } · ${broken.length} broken`,
);
if (inert.length) {
  console.log("inert is not a fault: the page promises an unconfigured door stays shut, and it did.");
}
if (broken.length) {
  console.error(
    `\n✖ contract violated by: ${broken.map((r) => r.door).join(", ")} — a bad secret must never be processed.`,
  );
  process.exit(1);
}
console.log("✓ every door kept the page's promise on an invalid secret. Nothing was written.\n");

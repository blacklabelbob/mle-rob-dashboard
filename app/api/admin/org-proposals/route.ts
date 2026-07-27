import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStore } from "@/lib/storage";
import { buildGraphIndex } from "@/lib/comms/emailGraphIndex";
import { proposalTitle } from "@/lib/comms/orgProposal";
import { createdFromProposalNote } from "@/lib/comms/proposalFlag";
import {
  domainRaceDetail,
  isOrgDomainConflict,
  newOrgToPerson,
  planOrgFromProposal,
} from "@/lib/comms/orgFromProposal";

// Q69 increment 5: the reviewer's click, executed.
//
// inc.3 queued the proposal on the ledger; inc.4 planned the exact row behind
// it. This route is the only thing between them and a company existing — and
// it invents nothing: it loads the CRM, asks `planOrgFromProposal` for a plan,
// and either writes that plan verbatim or returns the refusal the reviewer
// needs to read. Every guard (generic domain, already-known domain, missing
// name, missing/unknown vertical) lives in the pure planner, so this file
// cannot drift away from the rules or the tests that pin them.
//
// The flag is resolved only AFTER the org write succeeds. Resolving first
// would, on a failed insert, leave the ledger saying "handled" with no company
// anywhere — the one outcome worse than the proposal sitting there unactioned.

export const dynamic = "force-dynamic";

// The reviewer has to pick a vertical (inc.4: `orgs.vertical_id` is a NOT NULL
// FK, so a free-text vertical is a Postgres error wearing a broken button).
// This is the list they pick FROM — served here rather than making the ledger
// pull the whole graph payload just to fill one select.
export async function GET() {
  const data = await getStore().getNetwork();
  return NextResponse.json({
    verticals: data.verticals.map((v) => ({ id: v.id, name: v.name })),
  });
}

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  let body: { domain?: unknown; name?: unknown; verticalId?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const domain = typeof body.domain === "string" ? body.domain : "";
  const name = typeof body.name === "string" ? body.name : "";
  const verticalId = typeof body.verticalId === "string" ? body.verticalId : "";
  const address = typeof body.address === "string" ? body.address : undefined;
  if (!domain) {
    return NextResponse.json({ error: "need { domain, name, verticalId }" }, { status: 400 });
  }

  const store = getStore();
  const data = await store.getNetwork();
  const plan = planOrgFromProposal(
    { domain, name, verticalId, address },
    buildGraphIndex(data),
    data.people.map((p) => p.id),
    data.verticals.map((v) => v.id),
    new Date().toISOString().slice(0, 10)
  );

  if (plan.kind === "refused") {
    // 409 for "the world moved" (the company now exists, the domain can never
    // be owned); 422 for "the reviewer still has to tell us something". Both
    // carry the planner's own sentence — it is written to be read by a human.
    const status = plan.reason === "domain-already-known" || plan.reason === "generic-domain" ? 409 : 422;
    return NextResponse.json({ ok: false, refused: plan.reason, detail: plan.detail }, { status });
  }

  try {
    await store.upsertPerson(newOrgToPerson(plan.org));
  } catch (err) {
    // inc.9: the planner's `domain-already-known` read an index built before
    // this click. When the race is real, `orgs_domain_unique` (0022) is what
    // refuses — and the reviewer must read the same thing they would have read
    // a second earlier, not a 500. The flag is deliberately NOT resolved here:
    // the click that won already resolved it.
    if (isOrgDomainConflict(err)) {
      return NextResponse.json(
        {
          ok: false,
          refused: "domain-already-known",
          detail: domainRaceDetail(plan.org.domain),
        },
        { status: 409 }
      );
    }
    throw err; // any other write failure is a real failure — never swallowed.
  }

  // Close the loop on the ledger. A missing/failed resolve is reported, never
  // thrown: the company exists either way, and telling the reviewer the flag
  // is still open beats a 500 that makes a successful create look failed.
  let flagResolved = false;
  const s = db();
  if (s) {
    const { error } = await s
      .from("flags")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString().slice(0, 10),
        // inc.21: shared with the archive reader — a created row must never be
        // mistaken for a dismissal and shown the "add it by hand" warning.
        resolution_note: createdFromProposalNote(plan.org.id, plan.org.name),
      })
      .eq("title", proposalTitle(plan.org.domain))
      .eq("status", "open");
    flagResolved = !error;
    if (error) console.error("[org-proposals] flag resolve failed", plan.org.domain, error.message);
  }

  return NextResponse.json({ ok: true, org: plan.org, flagResolved });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GENERIC_EMAIL_DOMAINS, genericDomainSet } from "@/lib/comms/genericDomains";
import { planGenericDomainAdd, planGenericDomainRemove } from "@/lib/comms/genericDomainWrite";
import {
  describeDomainClaim,
  unknownDomainClaim,
  claimLinks,
  type ClaimingOrg,
  type DomainClaim,
} from "@/lib/comms/genericDomainClaims";
import {
  auditBlockedDomains,
  emptyBlocklistAudit,
  uncheckedBlocklistAudit,
} from "@/lib/comms/genericDomainAudit";

// Q69 inc.25 — the write door on migration 0023's `generic_email_domains`.
//
// inc.24 shipped the table and the read path and said plainly what was still
// missing: nothing let Rob ADD a domain, because the table was writable only by
// the service key. Without this route "block a bulk sender without a deploy" is
// half a promise — a deploy was still required, just for a different file.
//
// Every rule lives in the pure planner (`genericDomainWrite`), so a wrong row
// is refused with its reason instead of guessed into shape, and a removal that
// cannot work is refused instead of reported done.
//
// WHAT THIS ROUTE WILL NOT DO:
//  • Report success it did not achieve. A duplicate is reported as
//    already-blocked (true), a missing row as not-removed (true), and any other
//    Supabase failure as a failure — never a fake ok. inc.22/23's "200 so n8n
//    never retry-loops" contract is about the WEBHOOK; this is a human clicking
//    a button and needing to know whether the thing happened.
//  • Touch the floor. `GENERIC_EMAIL_DOMAINS` is unioned in on every read; a
//    row can only ever add to it.

export const dynamic = "force-dynamic";

interface Row {
  domain: string;
  note: string | null;
  added_by: string | null;
  created_at: string;
}

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type Db = NonNullable<ReturnType<typeof db>>;

/**
 * Q69 inc.27 — READ-ONLY. Blocking a domain is forward-only; it does not undo
 * the org an earlier email already created. This answers the reviewer's next
 * question ("is that company still in my CRM?") without touching a record.
 *
 * Any failure returns `unknown`, never `none`: reporting "nothing holds it"
 * off a query that errored would be a claim about the database we did not get
 * to make, and it is the exact way a stale company row goes unnoticed.
 */
async function claimFor(s: Db, domain: string): Promise<DomainClaim> {
  try {
    const { data, error } = await s.from("orgs").select("id, name, domain").ilike("domain", domain);
    if (error) {
      console.error("[generic-domains] claim lookup failed", domain, error.message);
      return unknownDomainClaim(domain, error.message);
    }
    const orgs = (data ?? []) as ClaimingOrg[];
    if (orgs.length === 0) return describeDomainClaim(domain, [], 0);

    // Contacts are counted separately, and a failed count degrades to "no
    // number" rather than zero — the claim itself is already established.
    const { count, error: countError } = await s
      .from("org_memberships")
      .select("person_id", { count: "exact", head: true })
      .in(
        "org_id",
        orgs.map((o) => o.id)
      );
    return describeDomainClaim(domain, orgs, countError ? null : count ?? null);
  } catch (e) {
    return unknownDomainClaim(domain, e instanceof Error ? e.message : "lookup error");
  }
}

/** The claim is advisory: it is attached to a response, never allowed to fail one. */
function withClaim(payload: Record<string, unknown>, claim: DomainClaim) {
  if (claim.kind === "none") return payload;
  return { ...payload, claim: { kind: claim.kind, text: claim.text, links: claimLinks(claim) } };
}

/** No Supabase env = file-store dev. Say so; do not pretend a row landed. */
const NO_STORE = NextResponse.json(
  {
    ok: false,
    error: "no-database",
    detail:
      "The editable blocklist lives in Supabase; this environment has no Supabase credentials. The built-in list still applies.",
  },
  { status: 503 }
);

export async function GET() {
  const s = db();
  const floorCount = GENERIC_EMAIL_DOMAINS.length;
  if (!s) return NextResponse.json({ ok: true, added: [], floorCount, readable: false });
  const { data, error } = await s
    .from("generic_email_domains")
    .select("domain, note, added_by, created_at")
    .order("domain");
  if (error) {
    // A failed read is reported, never thrown — same reasoning as inc.24's
    // loader. The reviewer sees "couldn't read the extras", not a 500 page,
    // and the built-in floor is unaffected either way.
    console.error("[generic-domains] read failed", error.message);
    return NextResponse.json(
      { ok: false, error: "read-failed", detail: error.message, floorCount, readable: false },
      { status: 502 }
    );
  }
  const rows = (data ?? []) as Row[];
  return NextResponse.json({
    ok: true,
    added: rows,
    floorCount,
    readable: true,
    audit: await auditFor(s, rows.map((r) => r.domain)),
  });
}

/**
 * Q69 inc.28 — the standing sweep. READ-ONLY, same as inc.27's add-time check;
 * it names records and never touches one.
 *
 * A failed read degrades to `unchecked`, never to an empty `checked`: the whole
 * point of the row is to surface an org that nobody would otherwise re-examine,
 * and a green "nothing held" printed off an errored query buries exactly that.
 */
async function auditFor(s: Db, domains: string[]) {
  if (domains.length === 0) return emptyBlocklistAudit();
  try {
    // `or` + ilike mirrors 0022's lower(domain) index, so a `BigMailer.com` org
    // row cannot read as unclaimed on capitalization alone. The values are
    // already constraint-normalized ([a-z0-9.-] only), so there is nothing to
    // escape here.
    const { data, error } = await s
      .from("orgs")
      .select("id, name, domain")
      .or(domains.map((d) => `domain.ilike.${d}`).join(","));
    if (error) {
      console.error("[generic-domains] audit lookup failed", error.message);
      return uncheckedBlocklistAudit(domains.length, error.message);
    }
    return auditBlockedDomains(domains, (data ?? []) as ClaimingOrg[]);
  } catch (e) {
    return uncheckedBlocklistAudit(domains.length, e instanceof Error ? e.message : "lookup error");
  }
}

export async function POST(req: NextRequest) {
  let body: { domain?: unknown; note?: unknown; addedBy?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "expected JSON body" }, { status: 400 });
  }

  const plan = planGenericDomainAdd(body.domain, genericDomainSet());
  if (plan.kind === "refused") {
    return NextResponse.json(
      { ok: false, refused: plan.reason, value: plan.value, detail: plan.detail },
      { status: 422 }
    );
  }
  if (plan.kind === "already-in-floor") {
    // 200, not an error: the reviewer asked for an outcome that is already true.
    return NextResponse.json({
      ok: true,
      domain: plan.domain,
      added: false,
      alreadyBlocked: "built-in",
      detail: plan.detail,
    });
  }

  const s = db();
  if (!s) return NO_STORE;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const addedBy = typeof body.addedBy === "string" && body.addedBy.trim() ? body.addedBy.trim() : null;
  const { error } = await s
    .from("generic_email_domains")
    .insert({ domain: plan.domain, note, added_by: addedBy });

  if (error) {
    // 23505 = unique violation: the row is already there, which is the outcome
    // asked for. Anything else is a real failure and is returned as one.
    if (error.code === "23505") {
      return NextResponse.json(
        withClaim(
          {
            ok: true,
            domain: plan.domain,
            added: false,
            alreadyBlocked: "row",
            detail: `${plan.domain} was already on your blocklist.`,
          },
          await claimFor(s, plan.domain)
        )
      );
    }
    console.error("[generic-domains] insert failed", plan.domain, error.message);
    return NextResponse.json(
      { ok: false, error: "write-failed", domain: plan.domain, detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    withClaim({ ok: true, domain: plan.domain, added: true }, await claimFor(s, plan.domain))
  );
}

export async function DELETE(req: NextRequest) {
  const domainParam = new URL(req.url).searchParams.get("domain");
  const plan = planGenericDomainRemove(domainParam, genericDomainSet());
  if (plan.kind === "refused") {
    // 422 for a malformed value, 409 for "the built-in floor owns this" — the
    // reviewer cannot fix the second one by retyping.
    const status = plan.reason === "in-code-floor" ? 409 : 422;
    return NextResponse.json(
      { ok: false, refused: plan.reason, value: plan.value, detail: plan.detail },
      { status }
    );
  }

  const s = db();
  if (!s) return NO_STORE;
  const { data, error } = await s
    .from("generic_email_domains")
    .delete()
    .eq("domain", plan.domain)
    .select("domain");
  if (error) {
    console.error("[generic-domains] delete failed", plan.domain, error.message);
    return NextResponse.json(
      { ok: false, error: "write-failed", domain: plan.domain, detail: error.message },
      { status: 500 }
    );
  }
  const removed = (data ?? []).length > 0;
  // Truthful either way: an unblock that removed nothing says so, because the
  // reviewer's next move (it's still blocked — why?) depends on knowing that.
  return NextResponse.json({
    ok: true,
    domain: plan.domain,
    removed,
    ...(removed ? {} : { detail: `${plan.domain} was not on your blocklist — nothing to remove.` }),
  });
}

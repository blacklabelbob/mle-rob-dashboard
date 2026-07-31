import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { planFlagWrite, planFlagReopen, supersededNote, type ExistingFlag } from "@/lib/flags/supersede";
import { buildSlugIndex, expandEntityFilter, resolveFlagEntityId } from "@/lib/flags/recordLinks";

// Things to Address (Rob 2026-07-22): findings surfaced to Rob live on the
// ledger — resolve with optional note, never deleted, archive keeps both dates.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("flags api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const entities = req.nextUrl.searchParams.get("entities");
  const person = req.nextUrl.searchParams.get("person");
  let ids = entities ? entities.split(",") : null;
  if (person) {
    const { data: mem } = await db().from("org_memberships").select("org_id").eq("person_id", person);
    ids = [person, ...(mem ?? []).map((m) => m.org_id)];
  }
  let q = db()
    .from("flags")
    .select("*");
  if (ids) q = q.in("entity_id", await withLegacySlugs(ids));
  const { data, error } = await q
    .order("status", { ascending: false }) // open first
    .order("severity", { ascending: true })
    .order("notified_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flags = await withEntityRefs(data ?? []);
  return NextResponse.json({ flags });
}

/**
 * Q84 inc.24 — widen a record page's filter to the slug that record was renumbered FROM.
 *
 * Every flag on prod that carries an `entity_id` carries the pre-Q70 slug, so filtering on
 * the minted id alone matched none of them and every one of those findings rendered on no
 * record page. See lib/flags/recordLinks.ts for why this direction of the lookup is the
 * safe one. Failure is non-fatal and degrades to the pre-inc.24 filter: the record page
 * shows what it showed yesterday rather than 500-ing, and never someone else's finding.
 */
async function withLegacySlugs(ids: string[]): Promise<string[]> {
  const [orgs, people] = await Promise.all([
    db().from("orgs").select("id,legacy_slug").in("id", ids),
    db().from("people").select("id,legacy_slug").in("id", ids),
  ]);
  if (orgs.error || people.error) return ids;
  return expandEntityFilter(ids, [...(orgs.data ?? []), ...(people.data ?? [])]);
}

/**
 * Q84 inc.23 — attach `entity_ref`: the record id a flag's `entity_id` actually addresses.
 *
 * 16 flags on prod carry a legacy SLUG (`cg-roofing-group`, `will`), not a minted id, and
 * the ledger renders those as plain text because the slug alone proves nothing. The CRM
 * kept the mapping when it renumbered (`legacy_slug`), so the resolution is a lookup, not
 * a guess — see lib/flags/recordLinks.ts. Only the slugs this response actually contains
 * are queried; a slug no record claims stays unresolved and the row stays plain text.
 *
 * Failure is non-fatal by design: this section is decoration on top of the finding. A
 * degraded lookup must leave Rob reading the same ledger he read yesterday, never a 500.
 */
async function withEntityRefs<T extends { entity_id: string | null }>(rows: T[]) {
  const slugs = [
    ...new Set(rows.map((r) => r.entity_id).filter((id): id is string => Boolean(id) && !resolveFlagEntityId(id, null))),
  ];
  let index = {};
  if (slugs.length) {
    const [orgs, people] = await Promise.all([
      db().from("orgs").select("id,legacy_slug").in("legacy_slug", slugs),
      db().from("people").select("id,legacy_slug").in("legacy_slug", slugs),
    ]);
    if (!orgs.error && !people.error) {
      index = buildSlugIndex([...(orgs.data ?? []), ...(people.data ?? [])]);
    }
  }
  return rows.map((r) => ({ ...r, entity_ref: resolveFlagEntityId(r.entity_id, index) }));
}

// resolve (with optional note) — or reopen if Rob changes his mind
export async function PATCH(req: NextRequest) {
  const { id, action, note } = await req.json();
  if (typeof id !== "number" || !["resolve", "reopen", "read", "unread"].includes(action)) {
    return NextResponse.json({ error: "need { id, action: resolve|reopen, note? }" }, { status: 400 });
  }
  if (action === "read" || action === "unread") {
    const { error } = await db().from("flags").update({ read_at: action === "read" ? new Date().toISOString().slice(0, 10) : null }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (action === "reopen") {
    // A keyed row cannot be reopened while its twin is open — the partial unique index from
    // 0033 would reject it, and Rob would get a 500 on his ledger instead of an answer.
    const { data: self, error: selfErr } = await db().from("flags").select("dedupe_key").eq("id", id).maybeSingle();
    if (selfErr) return NextResponse.json({ error: `reopen read failed: ${selfErr.message}` }, { status: 500 });
    if (!self) return NextResponse.json({ error: `no flag #${id}` }, { status: 404 });
    let siblings: ExistingFlag[] = [];
    if (self.dedupe_key) {
      const { data, error } = await db().from("flags").select("id,status").eq("dedupe_key", self.dedupe_key).neq("id", id);
      if (error) return NextResponse.json({ error: `reopen read failed: ${error.message}` }, { status: 500 });
      siblings = (data ?? []) as ExistingFlag[];
    }
    const plan = planFlagReopen(self.dedupe_key, siblings);
    if (!plan.ok) {
      return NextResponse.json({ error: plan.message, blockedBy: plan.blockedBy }, { status: 409 });
    }
  }

  const row =
    action === "resolve"
      ? { status: "resolved", resolved_at: new Date().toISOString().slice(0, 10), resolution_note: typeof note === "string" && note.trim() ? note.trim() : null }
      : { status: "open", resolved_at: null, resolution_note: null };
  const { error } = await db().from("flags").update(row).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// agents/driver create new flags through here.
//
// Optional `dedupeKey` (Q84 inc.8): a finding that is re-run on a schedule sends the
// same key every time and CORRECTS its row instead of stacking a contradicting copy.
// Without it the behaviour is exactly what it always was — insert. See
// lib/flags/supersede.ts for why: three open rows once claimed 26, 25 and a third
// count for the same meeting-archive finding.
export async function POST(req: NextRequest) {
  const { entityId, entityName, title, detail, severity, dedupeKey } = await req.json();
  if (!entityName || !title || !detail) {
    return NextResponse.json({ error: "need entityName, title, detail" }, { status: 400 });
  }
  const key = typeof dedupeKey === "string" && dedupeKey.trim() ? dedupeKey.trim() : null;
  const row = {
    entity_id: entityId ?? null,
    entity_name: entityName,
    title,
    detail,
    severity: ["high", "medium", "low"].includes(severity) ? severity : "medium",
  };

  let existing: ExistingFlag[] = [];
  if (key) {
    // Content comes back too (Q84 inc.12) so a scheduled re-run that says nothing new
    // can decline to re-date Rob's row.
    const { data, error } = await db().from("flags").select("id,status,title,detail,severity").eq("dedupe_key", key);
    // A failed read must not become an insert: that is the stacking bug, reached by a
    // different door. Refuse loudly and let the caller retry.
    if (error) return NextResponse.json({ error: `dedupe read failed: ${error.message}` }, { status: 500 });
    existing = (data ?? []) as ExistingFlag[];
  }

  const plan = planFlagWrite(key, existing, row);

  if (plan.action === "unchanged") {
    // Nothing written on purpose — see lib/flags/supersede.ts. The response still says
    // which row carries the finding, so the caller can log a real answer.
  } else if (plan.action === "update") {
    // notified_at moves to today — the row is being re-asserted, and a stale date reads
    // as "nobody has looked at this since".
    const { error } = await db()
      .from("flags")
      .update({ ...row, notified_at: new Date().toISOString().slice(0, 10) })
      .eq("id", plan.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db().from("flags").insert({ ...row, dedupe_key: key });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Older open twins are resolved with a note pointing at the survivor — never deleted,
  // and `PATCH { action: "reopen" }` undoes it.
  for (const staleId of plan.supersede) {
    await db()
      .from("flags")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString().slice(0, 10),
        resolution_note: supersededNote(plan.action === "update" ? plan.id : staleId),
      })
      .eq("id", staleId);
  }

  return NextResponse.json({
    ok: true,
    action: plan.action,
    reason: plan.reason,
    superseded: plan.supersede,
    id: plan.action === "insert" ? undefined : plan.id,
  });
}

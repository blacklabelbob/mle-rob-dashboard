import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { planFlagWrite, planFlagReopen, reopenNote, flagReopenRefusal, supersededNote, type ExistingFlag } from "@/lib/flags/supersede";
import { canonicalHostConfirmPayload, readHostConfirmPayload } from "@/lib/flags/hostConfirm";
import { isMissingColumn, payloadNote, type DbError } from "@/lib/flags/payloadColumn";
import {
  buildSlugIndex,
  entityOrFilter,
  expandEntityFilter,
  flagEntityHref,
  flagNamedRecordIds,
  flagTitleHref,
  resolveFlagEntityId,
  selectRecordFlags,
} from "@/lib/flags/recordLinks";

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
  // Q84 inc.26 — a record page also wants the findings that NAME it. 115 of the 131 flags
  // on prod carry no `entity_id`, and six of those print minted ids in their text (#137,
  // #133, #129, #128, #101, #99 → 18 distinct records) while rendering on no record page.
  // The `or` arm is only the coarse pull; `selectRecordFlags` decides, on ids the CRM
  // minted and the flag itself printed — never on a name. See lib/flags/recordLinks.ts.
  const entityFilter = ids ? await withLegacySlugs(ids) : null;
  let q = db()
    .from("flags")
    .select("*");
  if (entityFilter) q = q.or(entityOrFilter(entityFilter));
  const { data, error } = await q
    .order("status", { ascending: false }) // open first
    .order("severity", { ascending: true })
    .order("notified_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = entityFilter ? selectRecordFlags(data ?? [], entityFilter, ids ?? []) : (data ?? []);
  const flags = await withNamedRefs(await withEntityRefs(rows));
  return NextResponse.json({ flags });
}

/**
 * Q84 inc.37 — attach `named_ref`: of the minted ids a flag PRINTS, the ones the CRM holds.
 *
 * inc.26 taught the ledger that an id a finding prints is an address, and every increment
 * since has rendered sentences off that set — "it names C-2018 as well as this record", "one
 * ledger row on every one of those pages", "Resolving clears it from …". None of them ever
 * asked whether the id is a record. Prod #101 is why that matters: its detail quotes Rob's
 * own instruction, `("pull up P-1043")`, as an EXAMPLE of how to say a record number out
 * loud. There is no P-1043 — people run P-1001..P-1022 — so on /people/P-1001 the marker
 * named a dead-end page and the Resolve button promised to clear the finding from it.
 * (Precisely: `/people/P-1043` answers 200 and renders Next's "This page could not be
 * found." screen — a dead end for the reader, not an HTTP 404. Checked, not assumed.)
 *
 * Same confirm-don't-infer rule as inc.25's deal lookup one function above, and the same
 * non-fatal contract: a failed lookup attaches `null`, which the client reads as "not asked"
 * and renders exactly what it rendered yesterday. Dropping a real record because a query
 * blipped is the worse failure, so absence of proof is never proof of absence here.
 */
async function withNamedRefs<T extends { title: string | null; detail: string | null }>(rows: T[]) {
  const wanted = [...new Set(rows.flatMap((r) => flagNamedRecordIds(r.title, r.detail)))];
  if (!wanted.length) return rows.map((r) => ({ ...r, named_ref: [] as string[] | null }));
  const [orgs, people] = await Promise.all([
    db().from("orgs").select("id").in("id", wanted.filter((id) => id.startsWith("C-"))),
    db().from("people").select("id").in("id", wanted.filter((id) => id.startsWith("P-"))),
  ]);
  if (orgs.error || people.error) return rows.map((r) => ({ ...r, named_ref: null as string[] | null }));
  const held = new Set([...(orgs.data ?? []), ...(people.data ?? [])].map((r) => r.id as string));
  return rows.map((r) => ({
    ...r,
    named_ref: flagNamedRecordIds(r.title, r.detail).filter((id) => held.has(id)) as string[] | null,
  }));
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

  // Q84 inc.25 — an `entity_id` no org or person claims may still be a DEAL's primary key
  // (`deal-gulf-coast-equity-phase4`, flag #83), and `/deals/<id>` is a real page. Confirmed
  // against the rows the CRM holds, never inferred from the `deal-` prefix: an id the table
  // does not have stays plain text. Same non-fatal contract as the slug lookup above.
  const unresolved = [...new Set(rows.map((r) => r.entity_id).filter((id): id is string => Boolean(id) && !resolveFlagEntityId(id, index)))];
  let dealIds = new Set<string>();
  if (unresolved.length) {
    const { data, error } = await db().from("deals").select("id").in("id", unresolved);
    if (!error) dealIds = new Set((data ?? []).map((d) => d.id as string));
  }

  // Q84 inc.82 — the title link asked whether the id was SHAPED like a record, never whether
  // the CRM holds one. inc.37 fixed that for every id a flag PRINTS (`named_ref`); the id a
  // flag is FILED ON kept inferring from the pattern, so `entity_id: "P-1043"` would render a
  // title link into the same dead end inc.81 took out of the chips. Confirmed here, off the
  // same two tables, with the same non-fatal contract as the two lookups above: a failed read
  // passes `null` — "not asked" — and every row links exactly as it linked yesterday.
  const refs = [...new Set(rows.map((r) => resolveFlagEntityId(r.entity_id, index)).filter((id): id is string => Boolean(id) && Boolean(flagEntityHref(id))))];
  let held: Set<string> | null = null;
  if (refs.length) {
    const [orgs, people] = await Promise.all([
      db().from("orgs").select("id").in("id", refs.filter((id) => id.startsWith("C-"))),
      db().from("people").select("id").in("id", refs.filter((id) => id.startsWith("P-"))),
    ]);
    if (!orgs.error && !people.error) held = new Set([...(orgs.data ?? []), ...(people.data ?? [])].map((r) => r.id as string));
  } else {
    held = new Set<string>();
  }

  return rows.map((r) => {
    const entity_ref = resolveFlagEntityId(r.entity_id, index);
    return { ...r, entity_ref, entity_href: flagTitleHref(entity_ref, r.entity_id, dealIds, held) };
  });
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
  // Q84 inc.92: what a reopen leaves behind in `resolution_note`. Null until the row is read,
  // and the read only happens on the reopen branch — a resolve never consults it (inc.91: the
  // resolve path is handed what the reviewer typed FRESH, never the stored note).
  let keptNote: string | null = null;
  if (action === "reopen") {
    // A keyed row cannot be reopened while its twin is open — the partial unique index from
    // 0033 would reject it, and Rob would get a 500 on his ledger instead of an answer.
    const { data: self, error: selfErr } = await db().from("flags").select("dedupe_key,resolution_note,status").eq("id", id).maybeSingle();
    if (selfErr) return NextResponse.json({ error: `reopen read failed: ${selfErr.message}` }, { status: 500 });
    if (!self) return NextResponse.json({ error: `no flag #${id}` }, { status: 404 });
    // Q84 inc.93: a row ROB closed is not the endpoint's to undo (inc.10's rule, which until
    // now lived only in a React conditional). Checked BEFORE the sibling query — a refusal
    // about this row alone needs no read of any other, and the twin-blocker message would be
    // the less useful answer on a row that should not be reopening at all.
    const refusal = flagReopenRefusal((self as { status?: string | null }).status, (self as { resolution_note?: string | null }).resolution_note);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
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
    // The machine's closure sentence goes; a sentence a human typed stays. Computed AFTER the
    // 409 so a refused reopen writes nothing at all.
    keptNote = reopenNote((self as { resolution_note?: string | null }).resolution_note);
  }

  const row =
    action === "resolve"
      ? { status: "resolved", resolved_at: new Date().toISOString().slice(0, 10), resolution_note: typeof note === "string" && note.trim() ? note.trim() : null }
      : { status: "open", resolved_at: null, resolution_note: keptNote };
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
  const { entityId, entityName, title, detail, severity, dedupeKey, payload } = await req.json();
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

  // Q84 inc.74 — the caller's payload is RE-GRADED here, never stored as sent. This route is
  // reachable by any agent or script in the fleet, and what it writes becomes a button that
  // PATCHes a CRM record; the codec is the only thing allowed to say what a valid action is.
  // Anything it refuses becomes `null` — no payload, therefore no button — which is inc.71's
  // pinned failure direction: Rob sees the finding without the shortcut, never a control
  // pointing somewhere unverified.
  const graded = readHostConfirmPayload(payload);
  const payloadJson = canonicalHostConfirmPayload(graded);

  let existing: ExistingFlag[] = [];
  // Unknown until a database answers. On the pre-0035 prod every payload path below is a
  // no-op and this route behaves byte-for-byte as it did yesterday.
  let hasPayloadColumn = true;
  if (key) {
    // Content comes back too (Q84 inc.12) so a scheduled re-run that says nothing new
    // can decline to re-date Rob's row.
    const read = async (columns: string) =>
      (await db().from("flags").select(columns).eq("dedupe_key", key)) as {
        data: Array<Record<string, unknown>> | null;
        error: DbError;
      };
    let { data, error } = await read("id,status,title,detail,severity,payload");
    if (isMissingColumn(error, "payload")) {
      // Pre-0035. Read what the table actually has — the dedupe decision must still be made,
      // and making it off no read at all is the stacking bug this whole mechanism exists for.
      hasPayloadColumn = false;
      ({ data, error } = await read("id,status,title,detail,severity"));
    }
    // A failed read must not become an insert: that is the stacking bug, reached by a
    // different door. Refuse loudly and let the caller retry.
    if (error) return NextResponse.json({ error: `dedupe read failed: ${error.message}` }, { status: 500 });
    existing = (data ?? []).map((r) => ({
      id: r.id as number,
      status: r.status as ExistingFlag["status"],
      title: r.title as string | null,
      detail: r.detail as string | null,
      severity: r.severity as string | null,
      // Graded on the way out through the same codec as the way in, so a row written by hand —
      // or before a rule tightened — is not counted as equal just because its bytes match.
      // Left `undefined` when the column was not read: unproven, therefore not compared.
      ...(hasPayloadColumn
        ? { payloadJson: canonicalHostConfirmPayload(r.payload) }
        : {}),
    }));
  }

  const plan = planFlagWrite(key, existing, hasPayloadColumn ? { ...row, payloadJson } : row);

  // Q84 inc.74 — one write, attempted WITH the payload and retried without it on the single
  // error that means "this database is pre-0035". The retry is what keeps prod #133 — Rob's
  // highest-severity row, re-asserted every 30 minutes — landing exactly as it lands today.
  // Any other error is returned, not retried: a guard that swallowed failures would report a
  // ledger write that never happened.
  const withPayload = <T extends object>(base: T) => (hasPayloadColumn ? { ...base, payload: graded } : base);
  const write = async <T extends object>(
    run: (values: T & { payload?: unknown }) => PromiseLike<{ error: DbError }>,
    base: T,
  ): Promise<{ error: DbError }> => {
    const first = await run(withPayload(base));
    if (!isMissingColumn(first.error, "payload")) return first;
    hasPayloadColumn = false;
    return await run(base);
  };

  if (plan.action === "unchanged") {
    // Nothing written on purpose — see lib/flags/supersede.ts. The response still says
    // which row carries the finding, so the caller can log a real answer.
  } else if (plan.action === "update") {
    // notified_at moves to today — the row is being re-asserted, and a stale date reads
    // as "nobody has looked at this since".
    const { error } = await write(
      (values) => db().from("flags").update(values).eq("id", (plan as { id: number }).id),
      { ...row, notified_at: new Date().toISOString().slice(0, 10) },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await write((values) => db().from("flags").insert(values), { ...row, dedupe_key: key });
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
    // Q84 inc.74 — the caller is TOLD when its actions did not land, rather than reading `ok`
    // and assuming they did. `null` when it sent none: a note about a payload that was never
    // offered reads as a failure that did not happen.
    payload: payloadNote(Boolean(graded), hasPayloadColumn && plan.action !== "unchanged"),
  });
}

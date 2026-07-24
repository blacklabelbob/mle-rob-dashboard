import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildPatchRow, shapeRowForTable } from "@/lib/adminEdit";
import { applyHumanNotesEdit } from "@/lib/notes";

// Admin edits from the People table (Rob's 2026-07-17 dev-chat request).
// Talks to Supabase directly — folds into the StorageAdapter contract with Task 2.3.
// Site-wide basic auth is the gate; RLS roles land with Task 4.6.
// Post-0003 split (Q14): business rows live in `orgs`, so PATCH/DELETE route by
// entity, and PATCH verifies a row actually matched — a 0-row update is a 404,
// never a false "saved" pulse.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("admin api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function isOrgId(s: ReturnType<typeof db>, id: string): Promise<boolean> {
  const { data, error } = await s.from("orgs").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

export async function PATCH(req: NextRequest) {
  const { id, changes } = await req.json();
  if (typeof id !== "string" || !id || typeof changes !== "object" || !changes) {
    return NextResponse.json({ error: "need { id, changes }" }, { status: 400 });
  }
  const row = buildPatchRow(changes);
  // `notesHuman` is a virtual field, not a column: the Notes editor sends only
  // Rob's own words and the server recomposes the enrichment blocks from the
  // STORED row (Q43 punch #3) so provenance appended after his tab loaded is
  // never lost. It is deliberately absent from FIELD_MAP.
  const humanNotes = (changes as Record<string, unknown>).notesHuman;
  if (humanNotes !== undefined && typeof humanNotes !== "string") {
    return NextResponse.json({ error: "notesHuman must be a string" }, { status: 400 });
  }
  if (!Object.keys(row).length && humanNotes === undefined) {
    return NextResponse.json({ error: "no editable fields in changes" }, { status: 400 });
  }
  const s = db();
  try {
    const target = (await isOrgId(s, id)) ? "orgs" : "people";
    if (typeof humanNotes === "string") {
      const cur = await s.from(target).select("notes").eq("id", id).maybeSingle();
      if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });
      if (!cur.data) {
        return NextResponse.json({ error: `no record matched id ${id}` }, { status: 404 });
      }
      row.notes = applyHumanNotesEdit(cur.data.notes as string | null, humanNotes) || null;
    }
    const referrerIsOrg =
      typeof row.referred_by_id === "string" && row.referred_by_id
        ? await isOrgId(s, row.referred_by_id)
        : false;
    const shaped = shapeRowForTable(row, target, referrerIsOrg);
    shaped.updated_at = new Date().toISOString();
    const { data, error } = await s.from(target).update(shaped).eq("id", id).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) {
      return NextResponse.json({ error: `no record matched id ${id}` }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "lookup failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || !ids.length || !ids.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "need { ids: string[] }" }, { status: 400 });
  }
  const s = db();
  const list = ids.join(",");
  // edges first (FK integrity) — person AND org endpoint columns
  const e1 = await s
    .from("edges")
    .delete()
    .or(`from_id.in.(${list}),to_id.in.(${list}),from_org_id.in.(${list}),to_org_id.in.(${list})`);
  if (e1.error) return NextResponse.json({ error: e1.error.message }, { status: 500 });
  // clear referred_by pointers to deleted records on BOTH tables, both columns
  for (const [table, col] of [
    ["people", "referred_by_id"],
    ["people", "referred_by_org_id"],
    ["people", "org_id"],
    ["orgs", "referred_by_id"],
    ["orgs", "referred_by_org_id"],
  ] as const) {
    const r = await s.from(table).update({ [col]: null }).in(col, ids);
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }
  // org_memberships rows cascade with the orgs delete
  const e3 = await s.from("people").delete().in("id", ids);
  if (e3.error) return NextResponse.json({ error: e3.error.message }, { status: 500 });
  const e4 = await s.from("orgs").delete().in("id", ids);
  if (e4.error) return NextResponse.json({ error: e4.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}

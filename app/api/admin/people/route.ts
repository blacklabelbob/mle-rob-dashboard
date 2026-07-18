import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Admin edits from the People table (Rob's 2026-07-17 dev-chat request).
// Talks to Supabase directly — folds into the StorageAdapter contract with Task 2.3.
// Site-wide basic auth is the gate; RLS roles land with Task 4.6.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("admin api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// camelCase field → snake_case column, whitelist only
const FIELD_MAP: Record<string, string> = {
  name: "name",
  business: "business",
  role: "role",
  status: "status",
  verticalId: "vertical_id",
  nodeType: "node_type",
  quotedAmount: "quoted_amount",
  signed: "signed",
  phone: "phone",
  email: "email",
  website: "website",
  relationship: "relationship",
  referredById: "referred_by_id",
  assignedRep: "assigned_rep",
  phaseOne: "phase_one",
  keyDates: "key_dates",
  notes: "notes",
  description: "description",
  meetingVideoUrl: "meeting_video_url",
  transcriptUrl: "transcript_url",
};

export async function PATCH(req: NextRequest) {
  const { id, changes } = await req.json();
  if (typeof id !== "string" || !id || typeof changes !== "object" || !changes) {
    return NextResponse.json({ error: "need { id, changes }" }, { status: 400 });
  }
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    const col = FIELD_MAP[k];
    if (col) row[col] = v === "" ? null : v;
  }
  if (!Object.keys(row).length) {
    return NextResponse.json({ error: "no editable fields in changes" }, { status: 400 });
  }
  // Rob's ruling 2026-07-17: paid is the apex — setting a paid date auto-upgrades to Client.
  const kd = changes.keyDates as Record<string, string> | undefined;
  if (kd?.paid) row.node_type = "client";
  row.updated_at = new Date().toISOString();
  const { error } = await db().from("people").update(row).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || !ids.length || !ids.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "need { ids: string[] }" }, { status: 400 });
  }
  const s = db();
  // edges first (FK integrity), then people
  const e1 = await s.from("edges").delete().or(`from_id.in.(${ids.join(",")}),to_id.in.(${ids.join(",")})`);
  if (e1.error) return NextResponse.json({ error: e1.error.message }, { status: 500 });
  // clear referred_by pointers to deleted people
  const e2 = await s.from("people").update({ referred_by_id: null }).in("referred_by_id", ids);
  if (e2.error) return NextResponse.json({ error: e2.error.message }, { status: 500 });
  const e3 = await s.from("people").delete().in("id", ids);
  if (e3.error) return NextResponse.json({ error: e3.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}

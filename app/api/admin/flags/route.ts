import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Things to Address (Rob 2026-07-22): findings surfaced to Rob live on the
// ledger — resolve with optional note, never deleted, archive keeps both dates.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("flags api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const { data, error } = await db()
    .from("flags")
    .select("*")
    .order("status", { ascending: false }) // open first
    .order("severity", { ascending: true })
    .order("notified_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data ?? [] });
}

// resolve (with optional note) — or reopen if Rob changes his mind
export async function PATCH(req: NextRequest) {
  const { id, action, note } = await req.json();
  if (typeof id !== "number" || !["resolve", "reopen"].includes(action)) {
    return NextResponse.json({ error: "need { id, action: resolve|reopen, note? }" }, { status: 400 });
  }
  const row =
    action === "resolve"
      ? { status: "resolved", resolved_at: new Date().toISOString().slice(0, 10), resolution_note: typeof note === "string" && note.trim() ? note.trim() : null }
      : { status: "open", resolved_at: null, resolution_note: null };
  const { error } = await db().from("flags").update(row).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// agents/driver create new flags through here
export async function POST(req: NextRequest) {
  const { entityId, entityName, title, detail, severity } = await req.json();
  if (!entityName || !title || !detail) {
    return NextResponse.json({ error: "need entityName, title, detail" }, { status: 400 });
  }
  const { error } = await db().from("flags").insert({
    entity_id: entityId ?? null,
    entity_name: entityName,
    title,
    detail,
    severity: ["high", "medium", "low"].includes(severity) ? severity : "medium",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

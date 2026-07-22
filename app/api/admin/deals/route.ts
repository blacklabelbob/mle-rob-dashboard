import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseDealStagePatch } from "@/lib/crm";

// Drag-to-persist for the /deals board (Task 2.5). Stage is the ONLY writable
// column — parseDealStagePatch rejects any payload carrying more, and the
// update row below is built from scratch, so value/key_dates/signed fields
// are untouchable through this route by construction.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("admin api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(req: NextRequest) {
  const parsed = parseDealStagePatch(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await db()
    .from("deals")
    .update({ stage: parsed.stage, updated_at: new Date().toISOString() })
    .eq("id", parsed.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: `no deal matched id ${parsed.id}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

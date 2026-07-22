import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Read-only activity feed for the account workspace (Task 1b.3). No schema
// change: there is no `activities` table yet, so this reads defensively —
// if the table doesn't exist (or any other read error), it returns an empty
// list instead of a 500, exactly like flags' "non-critical, never break the
// ledger" pattern. The day a real activities table lands, this route starts
// returning real rows with zero frontend changes (ActivityTimeline already
// renders whatever comes back).

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("activities api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const person = req.nextUrl.searchParams.get("person");
  if (!person) {
    return NextResponse.json({ error: "need ?person=<id>" }, { status: 400 });
  }
  try {
    const { data, error } = await db()
      .from("activities")
      .select("*")
      .eq("person_id", person)
      .order("occurred_at", { ascending: false });
    if (error) throw error; // e.g. 42P01 relation does not exist — table not built yet
    return NextResponse.json({ activities: data ?? [] });
  } catch {
    return NextResponse.json({ activities: [] });
  }
}

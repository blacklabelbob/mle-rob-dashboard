import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Dev-only chat between Rob (in the dashboard) and Max (in Claude Code).
// Gated by NEXT_PUBLIC_DEV_CHAT=1 — absent in demos, present during development.
// Messages live in Supabase `dev_chat` (Vercel's filesystem is ephemeral).

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("dev-chat: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

function gated() {
  return process.env.NEXT_PUBLIC_DEV_CHAT !== "1";
}

export async function GET(req: NextRequest) {
  if (gated()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0);
  const { data, error } = await db()
    .from("dev_chat")
    .select("id, author, body, created_at")
    .gt("id", after)
    .order("id", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (gated()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { body } = await req.json();
  if (typeof body !== "string" || !body.trim() || body.length > 4000) {
    return NextResponse.json({ error: "body must be a non-empty string under 4000 chars" }, { status: 400 });
  }
  const { data, error } = await db()
    .from("dev_chat")
    .insert({ author: "rob", body: body.trim() })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

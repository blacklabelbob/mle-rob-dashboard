import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PALETTE = ["#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#60a5fa", "#f472b6"];

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("admin api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const { name, color } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "need { name }" }, { status: 400 });
  }
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!id) return NextResponse.json({ error: "name yields empty id" }, { status: 400 });
  const s = db();
  const { count } = await s.from("verticals").select("id", { count: "exact", head: true });
  const pick = typeof color === "string" && color ? color : PALETTE[(count ?? 0) % PALETTE.length];
  const { error } = await s.from("verticals").upsert({ id, name: name.trim(), color: pick });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, color: pick });
}

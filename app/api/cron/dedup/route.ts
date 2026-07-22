import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runDedupDetector, verifyCronAuth } from "@/lib/dedup/detector";

// Nightly dedup detector (PRD Task 3.5), fired by Vercel cron (vercel.json).
// Env-gated like every other integration route: CRON_SECRET unset → 503,
// nothing runs. Vercel sends "Authorization: Bearer <CRON_SECRET>" — verified
// constant-time; anything else is 401. Never merges — only feeds dedup_review.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "cron disabled: CRON_SECRET not set" },
      { status: 503 }
    );
  }
  if (!verifyCronAuth(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env not set" }, { status: 503 });
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const result = await runDedupDetector(client, new Date().toISOString());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

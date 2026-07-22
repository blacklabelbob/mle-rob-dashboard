import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeQuery, toHits, mergeHits, SearchRow } from "@/lib/search";

// Task 4.1 (Q33): full-text search endpoint. websearch_to_tsquery over the
// generated search_tsv columns (0007) so the GIN index carries the query.
// Store I/O only — all logic in lib/search.ts (CR-3). Behind site basic auth
// like every /api/admin/* route.

export const dynamic = "force-dynamic";

const SELECT = "id,name,business,role,vertical_id";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("admin api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const q = normalizeQuery(req.nextUrl.searchParams.get("q"));
  if (!q) return NextResponse.json({ error: "need ?q=" }, { status: 400 });

  const s = db();
  const started = Date.now();
  const [people, orgs] = await Promise.all([
    s.from("people").select(SELECT).textSearch("search_tsv", q, { type: "websearch", config: "simple" }).limit(25),
    s.from("orgs").select(SELECT).textSearch("search_tsv", q, { type: "websearch", config: "simple" }).limit(25),
  ]);
  if (people.error) return NextResponse.json({ error: people.error.message }, { status: 500 });
  if (orgs.error) return NextResponse.json({ error: orgs.error.message }, { status: 500 });

  const results = mergeHits(
    toHits((people.data ?? []) as SearchRow[], "person"),
    toHits((orgs.data ?? []) as SearchRow[], "org"),
  );
  return NextResponse.json({ q, results, tookMs: Date.now() - started });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { compile, isFilterError } from "@/lib/filters/ast";
import { isFilterInputError } from "@/lib/filters/parse";
import {
  decodeShareLink,
  parseSavedViewRow,
  type SavedViewPayload,
} from "@/lib/filters/savedViews";
import {
  nextPageCursor,
  parsePageCursor,
  parsePageLimit,
  resolveViewSource,
} from "@/lib/filters/page";

/**
 * Q67 inc.6 — the server-side paginated view route. The last piece of the chain:
 *
 *   ?view=/?share=  →  parse  →  compile(bindStyle: "jsonb")  →  filter_page RPC  →  page
 *
 * Two doors, one validator: a stored row and a stranger's link both land in
 * `parseSavedViewPayload` before `compile()` ever sees them. Filtering is SERVER-side and
 * keyset-paginated — the mistake this whole item exists to avoid is Macro's, whose list
 * caps at 500 rows because it filters in the browser.
 *
 * Store I/O only; every decision lives in lib/filters/* (CR-3).
 *
 * `filter_page` takes SQL text and is granted to **service_role only** (0020), so this
 * route is the sole caller and its own trust boundary. It reads; it never writes.
 */

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("views api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  // Everything the request controls is parsed before a connection is opened: a malformed
  // cursor should cost a 400, not a query.
  let source, limit, cursor;
  try {
    source = resolveViewSource(params);
    limit = parsePageLimit(params.get("limit"));
    cursor = parsePageCursor(params.get("after"));
  } catch (e) {
    if (isFilterInputError(e)) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const s = db();

  // Resolve the view. A share link is self-contained; a saved view is a row that gets
  // re-validated on read, because a row written before a literal was renamed is exactly as
  // untrusted as a URL someone pasted.
  let view: SavedViewPayload;
  try {
    if (source.kind === "share") {
      view = decodeShareLink(source.token);
    } else {
      const row = await s
        .from("saved_views")
        .select("id,target,name,filter,scope,owner_id,team_id")
        .eq("id", source.id)
        .maybeSingle();
      if (row.error) return NextResponse.json({ error: row.error.message }, { status: 500 });
      if (!row.data) return NextResponse.json({ error: "view not found" }, { status: 404 });
      view = parseSavedViewRow(row.data);
    }
  } catch (e) {
    // A bad link is the caller's fault (400); a stored row that no longer parses is ours,
    // and 422 says "this view is broken" rather than blaming the request.
    if (isFilterInputError(e)) {
      return NextResponse.json(
        { error: e.message },
        { status: source.kind === "share" ? 400 : 422 },
      );
    }
    throw e;
  }

  // `jsonb` rendering, because plpgsql cannot spread an N-element array into
  // `EXECUTE … USING` — 0020 reads the params out of one jsonb array instead.
  let where, values;
  try {
    ({ sql: where, params: values } = compile(view.filter, view.target, { bindStyle: "jsonb" }));
  } catch (e) {
    if (isFilterError(e)) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const started = Date.now();
  const page = await s.rpc("filter_page", {
    p_target: view.target,
    p_where: where,
    p_params: values,
    p_limit: limit,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (page.error) {
    // 22023 is every guard inside 0020 (bad target, second statement, bad limit, half a
    // cursor). Reaching one means this route let something through, so it is logged as
    // ours and returned as a 400 rather than dressed up as a 500.
    const status = page.error.code === "22023" ? 400 : 500;
    return NextResponse.json({ error: page.error.message }, { status });
  }

  const rows = (page.data ?? []) as unknown[];
  let next: string | null;
  try {
    next = nextPageCursor(rows, limit);
  } catch (e) {
    if (isFilterInputError(e)) return NextResponse.json({ error: e.message }, { status: 500 });
    throw e;
  }

  return NextResponse.json({
    target: view.target,
    name: view.name,
    rows,
    // Present and null means "last page" — an absent key would be indistinguishable from
    // a client that forgot to read it.
    nextCursor: next,
    limit,
    tookMs: Date.now() - started,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isFilterInputError } from "@/lib/filters/parse";
import {
  parseSavedViewInsert,
  parseSavedViewRow,
  type SavedView,
} from "@/lib/filters/savedViews";
import { parseViewListScope, parseViewOwner } from "@/lib/filters/page";

/**
 * Q67b — the WRITE door. Q67 shipped the read path (0019 table, 0020 RPC,
 * `/api/views/page`, share-link codec) but a rep still could not CREATE a view.
 *
 *   POST   /api/views              → save a view
 *   GET    /api/views?owner=…      → the views that rep can see (own personal + team)
 *   DELETE /api/views?id=…&owner=… → remove one of their own
 *
 * Store I/O only; every decision lives in lib/filters/* (CR-3), and creation goes through
 * the SAME `parseSavedViewPayload` the read path and the share-link decoder use — a
 * second set of write-side rules is how "the view I saved won't open" gets written.
 *
 * **Constraint violations are translated, never leaked.** 0019 carries two partial unique
 * indexes (per owner, per team, case-insensitive); a duplicate name is a 409 the UI can
 * act on, not a raw `23505` string. Same for the CHECKs → 400.
 *
 * **`owner_id` comes off the wire and is never defaulted.** No user records exist yet
 * (Q64/Q6 own that), so a route that minted an owner would be inventing an authorship
 * model Rob has not decided — the line Q66 already drew.
 */

export const dynamic = "force-dynamic";

const ROW_COLUMNS = "id,target,name,filter,scope,owner_id,team_id";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("views api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

function badInput(e: unknown, status = 400): NextResponse | null {
  return isFilterInputError(e) ? NextResponse.json({ error: e.message }, { status }) : null;
}

/**
 * Postgres error codes → HTTP. Anything not listed stays a 500: guessing at an unfamiliar
 * code is how a real failure gets reported to a rep as "duplicate name".
 */
function writeStatus(code: string | undefined): number {
  if (code === "23505") return 409; // one of 0019's two partial unique indexes
  if (code === "23514" || code === "22001") return 400; // CHECK / value too long
  return 500;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400 });
  }

  let insert;
  try {
    insert = parseSavedViewInsert(body);
  } catch (e) {
    const res = badInput(e);
    if (res) return res;
    throw e;
  }

  const created = await db().from("saved_views").insert(insert).select(ROW_COLUMNS).single();
  if (created.error) {
    const status = writeStatus(created.error.code);
    return NextResponse.json(
      {
        error:
          status === 409
            ? `a view named "${insert.name}" already exists here`
            : created.error.message,
      },
      { status },
    );
  }

  // Read back through the read-path validator: if what we just stored does not parse, the
  // caller learns now rather than the next time somebody opens it.
  let view: SavedView;
  try {
    view = parseSavedViewRow(created.data);
  } catch (e) {
    const res = badInput(e, 500);
    if (res) return res;
    throw e;
  }
  return NextResponse.json({ view }, { status: 201 });
}

export async function GET(req: NextRequest) {
  let scope;
  try {
    scope = parseViewListScope(req.nextUrl.searchParams);
  } catch (e) {
    const res = badInput(e);
    if (res) return res;
    throw e;
  }

  // Own personal views, plus the team's shared ones. `owner` alone never returns another
  // rep's team view, and `team` alone never returns anyone's personal one.
  const ors = [`and(scope.eq.personal,owner_id.eq.${scope.owner})`];
  if (scope.team) ors.push(`and(scope.eq.team,team_id.eq.${scope.team})`);

  const listed = await db()
    .from("saved_views")
    .select(ROW_COLUMNS)
    .or(ors.join(","))
    .order("name", { ascending: true });
  if (listed.error) return NextResponse.json({ error: listed.error.message }, { status: 500 });

  // A single unparseable row must not blank the sidebar — it is reported alongside the
  // ones that work, so a rep keeps their other views and we still hear about it.
  const views: SavedView[] = [];
  const broken: { id: unknown; error: string }[] = [];
  for (const row of listed.data ?? []) {
    try {
      views.push(parseSavedViewRow(row));
    } catch (e) {
      if (!isFilterInputError(e)) throw e;
      broken.push({ id: (row as { id?: unknown }).id, error: e.message });
    }
  }
  return NextResponse.json({ views, broken });
}

export async function DELETE(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  let owner: string;
  try {
    owner = parseViewOwner(params.get("owner"));
  } catch (e) {
    const res = badInput(e);
    if (res) return res;
    throw e;
  }
  const id = (params.get("id") ?? "").trim();
  if (id === "") return NextResponse.json({ error: "?id= is required" }, { status: 400 });

  // Matched on BOTH id and owner_id: service_role bypasses RLS, so the ownership check has
  // to be in the statement. Deleting by id alone would let any caller remove any rep's view.
  const removed = await db()
    .from("saved_views")
    .delete()
    .eq("id", id)
    .eq("owner_id", owner)
    .select("id");
  if (removed.error) {
    return NextResponse.json({ error: removed.error.message }, { status: 500 });
  }
  if ((removed.data ?? []).length === 0) {
    // Same 404 whether the view is missing or belongs to someone else: distinguishing them
    // would confirm the existence of another rep's view id to anyone probing.
    return NextResponse.json({ error: "view not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: id });
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { todayInET } from "@/lib/integrity/overdue";
import {
  allReadsFailed,
  fetchPanels,
  type ViewReader,
} from "@/lib/readModel/source";

// PRD Task MC.12 — the ops panels' one data endpoint. Reads the rm_* views
// through lib/readModel/source.ts (which refuses any other relation) and
// returns the shaped panels from lib/readModel/panels.ts. No base table is
// touched anywhere on this path — that is the MC.8 dashboard_ro posture, held
// in code because the role itself is NOLOGIN (0011).
//
// Honest coverage all the way out: blocked read models come back as real
// panels that say what unblocks them, a view that fails to read is reported
// as an error rather than as an empty panel, and a total read failure is a
// 502 instead of a dashboard full of confident zeros.

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.STORAGE_SOURCE !== "supabase" || !url || !key) {
    return NextResponse.json(
      {
        error:
          "read models live in Postgres — set STORAGE_SOURCE=supabase with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 503 }
    );
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const reader: ViewReader = async (view, columns) => {
    const res = await client.from(view).select(columns);
    return {
      // supabase-js types a dynamic column string as GenericStringError[];
      // the runtime value is the row array, hence the two-step cast.
      rows: (res.data ?? []) as unknown as Record<string, unknown>[],
      error: res.error ? res.error.message : null,
    };
  };

  const payload = await fetchPanels(reader, todayInET(new Date()));
  return NextResponse.json(payload, {
    status: allReadsFailed(payload) ? 502 : 200,
  });
}

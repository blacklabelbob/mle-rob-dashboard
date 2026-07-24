import { NextResponse } from "next/server";
import { loadLivePanels } from "@/lib/readModel/live";
import { allReadsFailed } from "@/lib/readModel/source";

// PRD Task MC.12 — the ops panels' one data endpoint. Reads the rm_* views
// through lib/readModel/source.ts (which refuses any other relation) and
// returns the shaped panels from lib/readModel/panels.ts. No base table is
// touched anywhere on this path — that is the MC.8 dashboard_ro posture, held
// in code because the role itself is NOLOGIN (0011).
//
// The connection itself lives in lib/readModel/live.ts, shared with the /ops
// page so the endpoint and the screen can never read the world differently.
//
// Honest coverage all the way out: blocked read models come back as real
// panels that say what unblocks them, a view that fails to read is reported
// as an error rather than as an empty panel, and a total read failure is a
// 502 instead of a dashboard full of confident zeros.

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await loadLivePanels();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }
  return NextResponse.json(result.payload, {
    status: allReadsFailed(result.payload) ? 502 : 200,
  });
}

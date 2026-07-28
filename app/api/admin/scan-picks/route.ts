import { NextRequest, NextResponse } from "next/server";
import { scanPicksReadable } from "@/lib/phases/scanPicksLoad";
import { liveScanPicksWriteDb } from "@/lib/phases/scanPicksWriteDb";
import {
  parseScanPickRequest,
  recordScanPicks,
  reinstateScanPick,
  withdrawScanPick,
} from "@/lib/phases/scanPicksRecord";

// Q40 leg (6) inc.20 — the ONE write door for `phase_scan_picks` (0027).
//
// inc.17 made a recorded shortlist readable, inc.18 decided what may be stored,
// inc.19 stored it. All three were unreachable from outside the codebase: no route
// called any of them, so every company on prod reads SCAN_NO_PICKS not because
// nobody has picked but because nothing could record a pick. This is that entry
// point, and it is the only one — a second door would be a second set of refusals.
//
// THE ROUTE DECIDES NOTHING. Verb dispatch, the refusals and the sequencing all
// live in `scanPicksRecord`, tested against a fake database; what is left here is
// arming, JSON, and status codes. That split is why an ordering or refusal bug can
// be caught by `npx vitest run` rather than only by a request against prod.
//
// UNARMED IS 503, NOT 500. Without the service key `scanPicksClient()` throws, and
// a 500 would read as "the write door is broken" when the truth is that this
// deployment has no store to write to — the same distinction `loadScanPicks` draws
// between "could not read" and "nothing picked".
//
// REFUSALS ARE 400 AND THEY ARE ALL RETURNED. `planScanPickWrites` collects every
// reason rather than throwing on the first so an importer fixing a batch gets the
// whole list; answering with only the first would hand that back at the door.

export const dynamic = "force-dynamic";

function unarmed() {
  return NextResponse.json(
    { error: "scan picks: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set" },
    { status: 503 },
  );
}

export async function POST(req: NextRequest) {
  if (!scanPicksReadable()) return unarmed();

  const parsed = parseScanPickRequest(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: "refused", refusals: parsed.refusals }, { status: 400 });

  const db = liveScanPicksWriteDb();
  try {
    const outcome =
      parsed.action.kind === "record"
        ? await recordScanPicks(db, parsed.action)
        : parsed.action.kind === "withdraw"
          ? await withdrawScanPick(db, parsed.action, new Date().toISOString())
          : await reinstateScanPick(db, parsed.action);

    if (!outcome.ok) {
      return NextResponse.json({ error: "refused", refusals: outcome.refusals }, { status: 400 });
    }
    return NextResponse.json(outcome);
  } catch (e) {
    // The carrier throws rather than returning an empty result on every failure
    // (inc.19) precisely so this cannot be reported as a stored shortlist.
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

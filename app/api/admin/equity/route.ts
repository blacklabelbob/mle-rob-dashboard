import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseEquityCorrection } from "@/lib/equity";

// Q41 inc.2 — "Rob can correct a wrong split in the UI himself" (dev-chat #53).
//
// A stake is not always an entity: the Gulf Coast 30% lives on a DEAL, HomeCloneVault
// on an ORG, and a person can hold one too. So this route finds the row before it
// writes, exactly like the People PATCH door does — and a 0-row update is a 404,
// never a false "saved".
//
// Deliberately its OWN door rather than a field on /api/admin/people: that route's
// FIELD_MAP is a whitelist of flat columns and cannot express "this object must
// total 100". Equity's rule is a shape, and the shape is checked in three places
// that agree — lib/equity.ts (pure), here, and 0024's check constraint.

export const dynamic = "force-dynamic";

const TABLES = ["deals", "orgs", "people"] as const;

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("equity api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "need { id, counterpartyPct, state? }" }, { status: 400 });
  }

  const parsed = parseEquityCorrection({
    counterpartyPct: body.counterpartyPct,
    ourPct: body.ourPct,
    state: body.state,
    setBy: body.setBy,
    // The clock lives here, never in the pure module (CR-3).
    setAt: new Date().toISOString().slice(0, 10),
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const s = db();
  try {
    for (const table of TABLES) {
      const { data, error } = await s
        .from(table)
        .update({ equity: parsed.value })
        .eq("id", body.id)
        .select("id");
      // A table that doesn't carry the column yet must not be read as "no such
      // record" — that would send Rob a 404 for a row that plainly exists.
      if (error) {
        if (/column .*equity.* does not exist/i.test(error.message)) continue;
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (data?.length) return NextResponse.json({ ok: true, table, equity: parsed.value });
    }
    return NextResponse.json({ error: `no person, org or deal with id "${body.id}"` }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

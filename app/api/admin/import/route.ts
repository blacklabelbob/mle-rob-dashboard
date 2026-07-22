import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { planImport } from "@/lib/csvImport";

// Task 4.3 (Q34): CSV import with dedup-on-import. Store I/O only — all
// parse/validate/matcher logic is pure in lib/csvImport.ts (CR-3).
//
// Two-step like the dedup merge UI: POST the CSV body → dry-run plan
// (inserts/dupes/errors, nothing written). POST again with ?commit=1 to
// execute the inserts. Dupes and error rows are NEVER written either way —
// the plan reports them by line so Rob can fix the file, not guess.
// Behind site basic auth like every /api/admin/* route.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csv = await req.text();
  if (!csv.trim()) {
    return NextResponse.json({ error: "empty body — POST the CSV text" }, { status: 400 });
  }
  const commit = req.nextUrl.searchParams.get("commit") === "1";
  try {
    const store = getStore();
    const { people } = await store.getNetwork();
    const plan = planImport(csv, people);
    let inserted = 0;
    if (commit) {
      for (const person of plan.inserts) {
        await store.upsertPerson(person);
        inserted++;
      }
    }
    return NextResponse.json({
      committed: commit,
      inserted,
      plan: {
        inserts: plan.inserts.map((p) => ({ id: p.id, name: p.name, kind: p.entityKind })),
        dupes: plan.dupes,
        errors: plan.errors,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "import failed" },
      { status: 500 },
    );
  }
}

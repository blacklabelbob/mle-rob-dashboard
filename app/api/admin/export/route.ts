import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { peopleToCsv } from "@/lib/csv";

// Task 4.3 (Q34): CSV export of the people/org ledger. Store I/O only —
// serialization, ordering, and demo-row policy live in lib/csv.ts (CR-3).
// Behind site basic auth like every /api/admin/* route.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { people } = await getStore().getNetwork();
    const csv = peopleToCsv(people);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mle-people.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "export failed" },
      { status: 500 },
    );
  }
}

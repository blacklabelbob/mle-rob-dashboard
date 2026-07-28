import { NextRequest, NextResponse } from "next/server";
import { submitPhase2Returns } from "@/lib/phases/phase2ReturnsSubmit";
import { livePhase2ReturnsWriteDb } from "@/lib/phases/phase2ReturnsWriteDb";

// Q63 leg (5) inc.11: the door a human can actually knock on. Everything this route
// decides, `submitPhase2Returns` decides — the handler only translates outcomes to
// status codes, so the sequence stays testable without a server (CR-3).
//
// STATUS CODES ARE PART OF THE ANSWER, not decoration:
//   400 — malformed body / refused fields. The caller can fix it and retry.
//   409 — that instant is RETRACTED. Not a validation error and not a success: the
//         measurement exists and was deliberately withdrawn. Reinstating it is a
//         different act with its own path, so this refuses instead of quietly
//         upserting a row the guarantee would keep ignoring.
//   500 — a database read or write threw. An unknown outcome is never reported as
//         a stored measurement.
//
// A malformed JSON body is 400 rather than an unhandled throw, because `req.json()`
// throwing is exactly the "not an object" case arriving one layer earlier.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  try {
    const out = await submitPhase2Returns(body, livePhase2ReturnsWriteDb());

    switch (out.status) {
      case "not_an_object":
        return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
      case "refused":
        return NextResponse.json({ error: "refused", refusals: out.refusals }, { status: 400 });
      case "superseded":
        return NextResponse.json(
          {
            error: "superseded",
            detail:
              "That measurement was retracted. Reinstate it rather than re-recording it.",
            customerId: out.customerId,
            measuredAt: out.measuredAt,
          },
          { status: 409 },
        );
      case "stored":
        return NextResponse.json({ ok: true, row: out.row });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "phase2-returns write failed" },
      { status: 500 },
    );
  }
}

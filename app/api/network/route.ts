import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { contribution, isDemo, isDisputedSigned } from "@/lib/stats";

export const dynamic = "force-dynamic";

// Graph payload for the client-side canvas: people + edges + verticals,
// with contribution pre-computed so the client stays dumb.
export async function GET() {
  const data = await getStore().getNetwork();
  const people = data.people.filter((p) => !isDemo(p));
  const ids = new Set(people.map((p) => p.id));
  return NextResponse.json({
    verticals: data.verticals,
    edges: data.edges.filter(
      (e) => (!e.fromId || ids.has(e.fromId)) && (!e.toId || ids.has(e.toId))
    ),
    nodes: people.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      verticalId: p.verticalId,
      signed: p.signed,
      signedDisputed: isDisputedSigned(p),
      signedDate: p.keyDates.signed ?? null,
      paidDate: p.keyDates.paid ?? null,
      quotedAmount: p.quotedAmount ?? 0,
      contribution: contribution(p),
      probability: p.estimate?.probability ?? null,
      estNewNodes: p.estimate?.estNewNodes ?? null,
      nodeType: p.nodeType ?? null,
      role: p.role ?? "",
      relationship: p.relationship ?? "",
      referredById: p.referredById ?? null,
    })),
  });
}

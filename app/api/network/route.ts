import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { contribution } from "@/lib/stats";

export const dynamic = "force-dynamic";

// Graph payload for the client-side canvas: people + edges + verticals,
// with contribution pre-computed so the client stays dumb.
export async function GET() {
  const data = await getStore().getNetwork();
  return NextResponse.json({
    verticals: data.verticals,
    edges: data.edges,
    nodes: data.people.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      verticalId: p.verticalId,
      signed: p.signed,
      quotedAmount: p.quotedAmount ?? 0,
      contribution: contribution(p),
      role: p.role ?? "",
      relationship: p.relationship ?? "",
      referredById: p.referredById ?? null,
    })),
  });
}

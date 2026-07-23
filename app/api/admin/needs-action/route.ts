import { NextResponse } from "next/server";
import { todayInET } from "@/lib/integrity/overdue";
import { getStore } from "@/lib/storage";
import { evaluateNeedsAction } from "@/lib/tasks/needsActionEval";

// PRD Task MC.13: Rob/ops "Needs Action Today" feed. Every rule lives in
// lib/tasks/needsActionRules.ts (MC.3) and evaluates in needsActionEval.ts
// (pure per CR-3) — this route only feeds it the store rows and the clock
// (todayInET, same anchor as the 2.6 rep route). Read-only. `blocked` is the
// honest-coverage list (rules that cannot evaluate yet, e.g. NA-2 on MC.9) —
// the widget must render it, never fake completeness.

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const now = new Date();
  const [deals, activities] = await Promise.all([
    store.listDeals(),
    store.listActivities(),
  ]);
  const { items, blocked } = evaluateNeedsAction({ deals, activities }, todayInET(now), now);
  return NextResponse.json({
    today: todayInET(now),
    count: items.length,
    items,
    blocked,
  });
}

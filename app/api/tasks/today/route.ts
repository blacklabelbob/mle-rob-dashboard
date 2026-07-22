import { NextResponse } from "next/server";
import { todayInET } from "@/lib/integrity/overdue";
import { getStore } from "@/lib/storage";
import { whoDoITouchToday } from "@/lib/tasks/todayRules";

// PRD Task 2.6: rep-facing "needs action today" worklist. Every rule lives in
// lib/tasks/todayRules.ts (Task 1.7, pure per CR-3) — this route only feeds it
// the store rows and the clock (todayInET = Rob's ET calendar day, same anchor
// as the Task 3.4 overdue watcher). Read-only; demo-* exclusion and ordering
// are the lib's job, not re-stated here.

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const now = new Date();
  const [tasks, deals, activities] = await Promise.all([
    store.listTasks(),
    store.listDeals(),
    store.listActivities(),
  ]);
  const items = whoDoITouchToday({ tasks, deals, activities }, todayInET(now), now);
  return NextResponse.json({
    today: todayInET(now),
    count: items.length,
    items,
  });
}

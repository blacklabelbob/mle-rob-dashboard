// PRD Task 3.4: overdue follow-up watcher, pure per CR-3. A follow-up is
// overdue when its task is still open and its due_date is strictly before
// "today" — Rob's calendar day, computed by the CALLER in ET; this module
// never reads the clock (scoring-pattern rule). demo-* rows never alert.
// The "ping" rides the flags ledger ("Things to Address", findings protocol
// 2026-07-22): the deterministic title embeds task id + due date, so hourly
// re-runs never dupe (DoD: exactly one ping) while a reschedule (new
// due_date) re-arms the alert cycle — same idempotency contract as
// orphans.ts / credentials.ts.

export type OverdueTaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null; // Postgres date column → YYYY-MM-DD
  assigned_to: string | null;
};

export type OverdueFinding = {
  taskId: string;
  taskTitle: string;
  dueDate: string;
  daysOverdue: number;
  assignedTo: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Rob's calendar day — overdue is judged in ET, not UTC (a task due "today"
// must not alert at 7pm ET just because UTC rolled over). Takes `now` as a
// parameter; nothing in this module reads the clock.
export function todayInET(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(now);
}

// Deterministic flag title — the idempotency key against the flags ledger.
export function overdueFlagTitle(f: OverdueFinding): string {
  return `Overdue follow-up: task ${f.taskId} (due ${f.dueDate})`;
}

export function overdueFlagDetail(f: OverdueFinding): string {
  const who = f.assignedTo ? ` (assigned: ${f.assignedTo})` : "";
  const days = f.daysOverdue === 1 ? "1 day" : `${f.daysOverdue} days`;
  return `"${f.taskTitle}"${who} was due ${f.dueDate} — ${days} overdue and still open.`;
}

// `today` is YYYY-MM-DD in Rob's timezone (the route computes it in ET).
// ISO date strings compare correctly as strings — no Date parsing needed
// for the threshold itself; UTC-noon parse below only sizes daysOverdue.
export function findOverdueTasks(
  tasks: OverdueTaskRow[],
  today: string
): OverdueFinding[] {
  if (!ISO_DATE.test(today)) {
    throw new Error(`findOverdueTasks: invalid today "${today}"`);
  }
  const findings: OverdueFinding[] = [];
  for (const t of tasks) {
    if (t.status !== "open") continue;
    if (!t.due_date || !ISO_DATE.test(t.due_date)) continue;
    if (/^demo-/.test(t.id)) continue; // same DEMO rule as dedup/completeness
    if (t.due_date >= today) continue; // due today = not yet overdue
    const days = Math.round(
      (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${t.due_date}T12:00:00Z`)) /
        86_400_000
    );
    findings.push({
      taskId: t.id,
      taskTitle: t.title,
      dueDate: t.due_date,
      daysOverdue: days,
      assignedTo: t.assigned_to,
    });
  }
  // Deterministic order: most overdue first, then id.
  findings.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.taskId.localeCompare(b.taskId)
  );
  return findings;
}

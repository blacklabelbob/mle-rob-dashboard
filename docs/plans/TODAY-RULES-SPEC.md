# "Who Do I Touch Today" Rules — PRD Task 1.7
**2026-07-22 · v1.0** · Canonical rules live in CODE: [`lib/tasks/todayRules.ts`](../../lib/tasks/todayRules.ts) (CR-3 — this doc narrates, it never re-states a threshold; if this page and the code ever disagree, the code wins and this page is the defect).

## What it answers
The rep-facing daily worklist: which contacts/deals demand a touch **today**. Consumer: PRD Task 2.6 `GET /api/tasks/today` (now unblocked).

## The four triggers (proven by `lib/__tests__/todayRules.test.ts` — 12 seeded records, every trigger + its negatives)
| # | Trigger | Fires when | Negative cases pinned |
|---|---------|-----------|----------------------|
| 1 | `next_step_overdue` | open task, due date **before** Rob's ET calendar day | done/cancelled tasks; `demo-*` rows |
| 2 | `next_step_due_today` | open task, due date **=** today | future due dates |
| 3 | `meeting_unlogged` | meeting held >24h ago, **nothing** logged after it on the same anchor (no later activity, no task created) | meeting with a later note; meeting inside the 24h window; a follow-up task clears it |
| 4 | `stage_aging` | deal sat in a thresholded stage ≥ its limit (see `STAGE_AGING_DAYS` in code: contacted / quote_sent / negotiating per PRD Task 1.7) | fresh deals; stages with no threshold (e.g. signed) |

Ordering is deterministic: overdue → due today → unlogged meetings → aging deals, stable by anchor id — two runs on identical input are byte-identical (scoring-pattern rule 3).

## Deliberate design calls
- **Clock is the caller's job.** `today` arrives as Rob's ET calendar day (`todayInET`, shared with the Task 3.4 watcher); `now` is a parameter. Nothing in the module reads the clock (CR-3).
- **Stage-entry proxy.** Until Task 4.7's audit trail lands, "entered stage" is proxied by `deal.updatedAt`. Documented limitation: any edit resets the aging timer. Task 4.7 replaces the proxy with true `status_change` timestamps — no rule change needed, just a better input.
- **Not the same thing as the Task 3.4 overdue watcher.** Same tables, different audiences: the watcher pings **Rob's flags ledger** (strictly past-due only, idempotent hourly); these rules build a **rep's worklist** (includes due-today, meetings, aging). Both on purpose.

## MC.3 reconciliation (merge cross-reference, 2026-07-21 ledger)
Mission Control MC.3 (base-PRD 7.4 "Needs Action Today") is the **Rob/ops SLA rule set**; Task 1.7 is the **rep next-step rule set**. Reconciled, not merged: MC.3's stalled-deal thresholds should be defined **relative to** `STAGE_AGING_DAYS` when MC.3 is built (one threshold table, two consumers) — noted so MC.3's builder starts from this module instead of inventing parallel numbers.

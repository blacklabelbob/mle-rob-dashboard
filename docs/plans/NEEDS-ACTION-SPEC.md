# "Needs Action Today" Rule Set — PRD Task MC.3 (base 7.4)
**2026-07-23 · v1.0** · Canonical table lives in CODE: [`lib/tasks/needsActionRules.ts`](../../lib/tasks/needsActionRules.ts) (CR-3 — this doc narrates, it never re-states an SLA; if this page and the code ever disagree, the code wins and this page is the defect).

## What it is (and is not)
The **Rob/ops SLA rule set** feeding the daily-priorities panel (M4.1) and the MC.13 widget. It is NOT the rep worklist — that is Task 1.7's [`todayRules`](../../lib/tasks/todayRules.ts) ([spec](./TODAY-RULES-SPEC.md)). Same tables, different audiences, reconciled per the 2026-07-21 merge ledger: **one threshold table, two consumers** — where a rule overlaps, MC.3 derives from `STAGE_AGING_DAYS`, never a parallel number.

This increment ships **definitions only** (MC.3's DoD). Evaluators land with MC.13; the table's shape (`fieldsRead` as real `table.column` refs) is what makes that build mechanical.

## The five rules (pinned by `lib/__tests__/needsActionRules.test.ts`)
| # | Rule | Trigger | Action owed | SLA | Coverage today |
|---|------|---------|-------------|-----|----------------|
| NA-1 | `new_lead_untouched` | `new_lead` deal, zero activities since creation, >24h old | first touch logged | 24h | evaluator pending (fields exist; todayRules has no `new_lead` rung) |
| NA-2 | `discovery_reminder_missing` | booked discovery <24h out, no reminder logged | send 24h-prior reminder | 24h | **blocked on MC.9** — no Cal.com bookings data in the CRM; `meeting_booked` stage carries no start time |
| NA-3 | `proposal_lag` | `meeting_held` >48h with no quote sent | send proposal | 48h | evaluator pending — distinct from todayRules `meeting_unlogged` (24h, any-log); deliberately not folded into `STAGE_AGING_DAYS` here |
| NA-4 | `followup_lag` | contacted deal untouched ≥ `STAGE_AGING_DAYS.contacted` days | follow-up touch | **derived** (days × 24) | ✅ covered — todayRules `stage_aging` already fires it; MC.13 re-surfaces for Rob |
| NA-5 | `signed_not_invoiced` | `signed` >24h (ladder moves invoiced deals onward, so aged-signed IS un-invoiced) | issue invoice | 24h | evaluator pending — stage-only check buildable now; invoice-CSV cross-check rides MC.9 (G3 verdict: `invoice-ledger.csv` is the only store) |

## Reconciliation decisions (on the record)
- **Calendar-day proxy for "business days" (NA-4).** Base PRD said 3 *business* days; todayRules uses calendar days. Adopted calendar days so the threshold stays one number in one place — documented divergence, not an accident.
- **Stage-entry proxy.** NA-3/NA-5 read stage entry via `deal.updatedAt` until stage_aging switches to Task 4.7's `status_change` entry times (same open follow-up as todayRules — one fix upgrades both rule sets).
- **NA-3 stays out of the rep queue.** Adding a `meeting_held` rung to `STAGE_AGING_DAYS` would silently grow the rep worklist — that's a todayRules/Q46 decision (anti-notification-fatigue guardrail), not a definition side-effect.
- **NA-5 needs no invoices table.** Per the MC.7 G3 verdict, the stage ladder itself encodes the un-invoiced state; the CSV is cross-check only.

## Consumers
- **MC.13** — Rob/ops "Needs Action Today" widget: evaluates NA-1/NA-3/NA-5 (build), re-surfaces NA-4 from todayRules, holds NA-2 until MC.9.
- **M4.1** — daily-priorities panel: reads the same evaluated items.
- **MC.14/MC.15** — alerting + daily digest reference these SLAs rather than re-defining them.

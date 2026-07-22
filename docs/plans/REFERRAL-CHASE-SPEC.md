# Referral-Chase Queue — PRD Task 1.8
**2026-07-22 · v1.0** · Canonical rules live in CODE: [`lib/referrals/chaseQueue.ts`](../../lib/referrals/chaseQueue.ts) (CR-3 — this doc narrates, it never re-states a threshold; if this page and the code ever disagree, the code wins and this page is the defect).

## What it answers
Which door-openers **promised an intro that never showed up** — the leak Rob's referral network is built to plug. A rep logs "Caleb said he'll intro me to a roofer by Friday"; if Friday passes and no referred lead has landed, that promise enters the chase queue until the lead exists.

## The rule (proven by `lib/__tests__/chaseQueue.test.ts` — 9 tests, the DoD pair + 7 negatives)
| Piece | How it's modeled | Why |
|-------|------------------|-----|
| **Promise** | Any activity whose `sourceContext.promised_intro = { expected_by: "YYYY-MM-DD", of?: "free text" }`, anchored to the promiser via `personId`/`orgId` | Rides Task 1.15's `sourceContext` differentiator — zero new schema |
| **Passed** | `expected_by < today` (Rob's ET day). Due-today is **not** yet a broken promise — mirrors the Task 3.4 watcher convention | Chasing someone on the day they promised is premature |
| **Clears** | A lead with `referredById === promiser` logged **at/after** the promise was made | `Person.referredById` is the existing door-opener pointer; the intro literally arriving is the only honest clear |
| **Re-arms** | A new promise activity with a later `expected_by` is its own queue entry | Each promise is chased on its own date |

Ordering is deterministic: most-overdue first, stable by activity id — two runs on identical input are byte-identical (scoring-pattern rule 3).

## Deliberate design calls
- **Clock is the caller's job.** `today` arrives via `todayInET` (shared with Tasks 1.7/3.4). Nothing in the module reads the clock (CR-3).
- **Lead timestamps are explicit.** `Person` in `lib/types.ts` doesn't expose `created_at`, so callers pass a minimal `ReferredLead { id, referredById, loggedAt }` (supabase `created_at`). A lead with **no** timestamp is conservatively treated as pre-existing — it cannot clear a promise, because we can't prove it came after it. Honest over convenient.
- **Pre-promise leads don't clear.** If Caleb referred someone in June and promises a *new* intro in July, the June lead doesn't silence the July promise.
- **`demo-*` rows never surface** (Q4 precedent), and payloads are shape-checked (`promisedIntroOf`) — a malformed `promised_intro` is ignored, never a crash.

## Consumers (future, not built here)
The queue is a pure function ready for: the rep worklist (Task 2.6 could append a `referral_chase` band), Rob's flags ledger (Task 3.4-style watcher), or the weekly digest. Wiring is a separate task — this module is the single rule source for all of them.

AQZSWX≥÷PZ
**Date:** 2026-07-23 · **Canonical source:** `lib/kpis/marketingKpis.ts` (this doc narrates — it never re-states a formula or threshold; if this doc and the code disagree, the code wins and this doc has a bug).

## What this is

The 4 Mission-Control marketing KPIs, shipped as CODE per CR-3 (same pattern as MC.3's `needsActionRules.ts` and Task 1.7's `todayRules.ts`):

| KPI | Compute fn | Coverage today |
|---|---|---|
| Cost per Booked Call | `costPerBookedCall` | blocked on MC.9 (Cal.com bookings); spend = manual entry |
| Lead-Magnet Conversion | `leadMagnetConversion` | manual denominator (Vercel analytics visitors); submissions countable from activities lake |
| Source → Close Rate | `sourceCloseRate` | blocked on MC.4 (no `deals.source` column, no channel taxonomy yet) |
| Booking Volume by Channel | `bookingVolumeByChannel` | blocked on MC.4 + MC.9 (bookings + UTM passthrough) |

Each table entry in code carries: `formula` (human-readable), `inputs[]` each with a **named source system** (the base-PRD DoD), `coverage` + `coverageNote` (honest about what's wired vs. not), and a **worked example** in `MARKETING_KPI_WORKED_EXAMPLES` — test-pinned to the compute fn in `lib/__tests__/marketingKpis.test.ts` so formula and example can never drift apart.

## Design decisions

- **Ratios return `null` on a zero denominator** — never 0, NaN, or Infinity. Consumers (MC.12's KPI Summary panel) render "no data", not a fake metric. Same truth-gate posture as the Needs Action panel's blocked state.
- **`sourceCloseRate` takes `(source, isClosedWon)` pairs**, not Deal rows — deliberately decoupled from the missing `deals.source` column so MC.4 landing the taxonomy changes the *adapter*, not the formula. Closed-won = signed/invoiced/paid per the stage ladder (adapter's job to map).
- **`bookingVolumeByChannel` floors missing/empty channels to `direct_unknown`** — MC.4's taxonomy already reserves Direct/Unknown; a booking without UTM is attributed honestly, not dropped.
- **Nothing claims `computable_today`** — a test pins this. Whoever wires the first real input (MC.4 source column, MC.9 bookings) must consciously flip the coverage and break the pin, proving the wiring exists.
- **No ads integration is planned**: spend stays a human-entered number. The KPI is still fully defined; only the input arrives by hand.

## Consumers

- **MC.12** KPI Summary panel (the dashboard face) — renders values or the coverage note when inputs are unwired.
- **MC.15** weekly KPI rollup — same fns, weekly window.
- **MC.4 / MC.9** are the unblocking tasks; their cross-references live in the PRD rows.

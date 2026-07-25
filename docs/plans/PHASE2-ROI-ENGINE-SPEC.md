# Phase 2 ROI Engine + the Estimator — SPEC

**Created:** 2026-07-25 · **Owner:** Rob + Max · **Status:** ENGINE BUILT (`lib/roi/*`), UI NOT BUILT
**Source (verbatim, do not edit):** [`sources/ROB-PHASE2-ROI-DUMP-2026-07-25.md`](./sources/ROB-PHASE2-ROI-DUMP-2026-07-25.md)
**Implementation:** [`lib/roi/phase2.ts`](../../lib/roi/phase2.ts) (arithmetic) + [`lib/roi/laborRates.ts`](../../lib/roi/laborRates.ts) (BLS rate table)
**Tests:** [`lib/__tests__/phase2Roi.test.ts`](../../lib/__tests__/phase2Roi.test.ts)
**Answers:** BUILD-QUEUE **Q40**'s long-open *"P2 = 3-month ROI guarantee (calcs forthcoming from Rob)"*. Build item: **Q63**.

---

## 1. What Rob actually asked for

Two views of one formula:

| View | When it's used | Inputs |
|------|----------------|--------|
| **Running ROI** (actuals) | After Phase 2 has started — the live number on a customer's Blueprint | real hours saved, real revenue, real days elapsed |
| **The Estimator** (pre-sale) | *"when we're first calculating them"* — before Phase 2 is sold | **Est Investment** (typed), **days so far** (typed, editable), a list of recommended automations |

Both run the **same engine**. The Estimator feeds modelled inputs into `computePhase2Roi` rather than
re-deriving the maths — that is the whole reason it lives in one module (CR-3).

## 2. The formula

Rob's rule, in one line: **Phase 2 Investment = ROI Target**, and the target is **pro-rated by how far into
the 91-day window you are**.

```
productivitySavings = laborHoursSaved × laborCostPerHour
valueDelivered      = productivitySavings + revenueSincePhase2Start

perDayTarget        = investment ÷ 91
targetToDate        = perDayTarget × min(daysElapsed, 91)

ROI %  = valueDelivered ÷ targetToDate − 1     ← Rob's "= Answer −1 … to express it as a %"
ROI $  = valueDelivered − targetToDate         ← Rob's "I also want it expressed as a $"
```

- **Surplus** (`ROI $ > 0`) renders **green**; **shortfall** (`< 0`) renders **red**. Rob: *"Surpluss will be Great, Shortfall will be -Red."*
- `91` is `PHASE_2_GUARANTEE_DAYS`, parameterised (`guaranteeDays`) because Rob said *"We might change this formula later."*
- Past day 91 the target **stops growing** (`beyondGuaranteeWindow: true`) — the guarantee window closed; the
  number keeps reading against the full investment rather than inflating the target forever.
- On **day 0** `targetToDate` is 0, so the % is mathematically undefined. The engine returns `roiPct: null`
  (never `Infinity`, never a fake `0%`) and sets `targetToDateIsZero`. The **$** is still defined and is shown.

### 2a. Worked example (test-pinned)

Investment **$12,000**, day **30** of 91, **60** hours saved at **$22.86/hr** (BLS admin-assistant median),
**$3,000** attributable revenue:

| Line | Value |
|------|-------|
| Productivity savings | 60 × 22.86 = **$1,371.60** |
| Revenue since Phase 2 start | **$3,000.00** |
| **Value delivered** | **$4,371.60** |
| Per-day target | 12,000 ÷ 91 = **$131.87/day** |
| **Target to date** (30 days) | **$3,956.04** |
| **ROI $** | **+$415.56** |
| **ROI %** | **+10.50%** |
| Status | **surplus** → green |

Same client, same day, but only $2,000 of revenue → ROI $ = **−$584.44**, ROI % = **−14.77%**, red.

## 3. The Estimator

Rob: *"list the top recommended automations underneath… look at the specifics of the automation, figure out
what type of employee would likely normally handle that task, what their hourly rate is in the region the
business is in… estimate how many hours they usually spend on the task the automation is doing 24/7, estimate
what you think being able to perform the task automatically would have garnered them in additional revenue…
And for the Estimated section I want you do that for each one of the automations recommended. Then show a summary."*

Per automation the engine carries: `role` + `soc` + `hourlyRate` + `rateRegionLabel` + `rateSource`,
`humanHoursPerWeek`, `revenueLiftPerMonth`, and a free-text `basis` (why those numbers). Then:

```
hoursSavedToDate = (humanHoursPerWeek ÷ 7) × daysElapsed
laborValueToDate = hoursSavedToDate × hourlyRate
revenueToDate    = (revenueLiftPerMonth ÷ 30.4375) × daysElapsed
valueToDate      = laborValueToDate + revenueToDate
shareOfTargetToDate = valueToDate ÷ targetToDate      ← "this one automation covers X% of what's owed"
```

The **summary** is `computePhase2Roi` run on the totals, with labor passed as
`(total hours × blended rate)` so the summary reproduces the per-automation labor total **exactly** instead of
re-deriving it from a single rate.

### 3a. Where the hourly rates come from

`lib/roi/laborRates.ts` — **BLS OEWS May 2025 median hourly wage**, 9 roles an MLE automation actually
displaces, at three levels: Naples–Immokalee–Marco Island metro → Florida → national. Every row carries its
`bls.gov` source URL (house rule 10).

Fallback is **explicit, never silent**: `rateFor()` returns `usedRegion` + `fellBack`, so the UI must say
*"national figure — BLS publishes no Naples number for Telemarketers"* rather than presenting a national rate
as if it were local. A missing metro figure stays `null`; it is never back-filled from the state number.

## 4. UI contract (NOT YET BUILT — Q63 legs 3–5)

1. Two typed inputs, exactly as Rob named them: **Est Investment** and **days so far in Phase 2**. Changing
   either recomputes **everything** on screen (per-automation rows AND the summary).
2. A row per recommended automation showing: what it does, the role it displaces, the rate **with its region
   label and BLS link**, hours/week, revenue lift/month, and this automation's value-to-date + share of target.
3. A summary block: value delivered, target to date, **ROI % and ROI $**, green on surplus / red on shortfall,
   plus "day N of 91" so the pro-rating is visible and not a hidden divisor.
4. **No number without its basis.** Every estimate shows where it came from; no bare figures (rule 10 + the
   Apple-not-MS-DOS bar).
5. The UI **never re-derives arithmetic** — it renders `computePhase2Roi` / `estimatePhase2Roi` output (CR-3).

## 5. Open questions

| # | Question | Status |
|---|----------|--------|
| A | **"Total Revenue since start of Phase 2" — total top-line, or revenue *attributable* to Phase 2?** Total top-line would credit Phase 2 with sales it did not cause and makes the guarantee trivially easy to clear; attributable is defensible but needs a rule for how it's attributed. The engine takes whatever number it is handed and the field is named `revenueSincePhase2Start` so the ambiguity is visible, not buried. | **OPEN — Rob.** On the ledger (Things to Address) + PRD Open Question Q12 |
| B | Recommended-pricing logic per job | **OPEN by Rob's instruction** — *"My partner is writing logic as to what the recommended pricing for each job should be… Let this open for now."* Do not chase, do not default (= PRD Open Question Q4) |
| C | Where do the "top recommended automations" come from — hand-picked per customer, or derived from the Q40 component checklist? | **OPEN** — decide when Q40's Blueprint model lands; the engine is agnostic (it takes a list) |

# Phase 2 ROI Engine + the Estimator — SPEC

**Created:** 2026-07-25 · **Owner:** Rob + Max · **Status:** ENGINE BUILT (`lib/roi/*`) · **UI BUILT** both as a
standalone interactive page — [`PHASE2-ROI-ESTIMATOR.html`](./PHASE2-ROI-ESTIMATOR.html) (§4a) — **and mounted
in the app** on the master company record + rep account view (§4c, 2026-07-25)
**Source (verbatim, do not edit):** [`sources/ROB-PHASE2-ROI-DUMP-2026-07-25.md`](./sources/ROB-PHASE2-ROI-DUMP-2026-07-25.md)
**Implementation:** [`lib/roi/phase2.ts`](../../lib/roi/phase2.ts) (arithmetic) + [`lib/roi/laborRates.ts`](../../lib/roi/laborRates.ts) (BLS rate table)
**Tests:** [`lib/__tests__/phase2Roi.test.ts`](../../lib/__tests__/phase2Roi.test.ts) (arithmetic) +
[`lib/__tests__/phase2RoiEstimatorParity.test.ts`](../../lib/__tests__/phase2RoiEstimatorParity.test.ts)
(the page ↔ module drift guard, §4b)
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

## 4a. The UI as built — `docs/plans/PHASE2-ROI-ESTIMATOR.html` (2026-07-25)

Standalone, self-contained, no build step — opens in a browser and is publishable as a persistent artifact,
which is the form Rob asked for. It **mirrors** `lib/roi/phase2.ts` and never re-derives the arithmetic; the
module stays the source of truth (CR-3). Against the contract in §4: all five points met.

**What it does:** *Est Investment*, *days into Phase 2* (number + slider), *wage region*, and *guarantee window*
across the top; four KPI tiles (ROI %, ROI $, target-to-date with a window meter, value delivered); a row per
automation with editable hours/week and revenue-lift and a live BLS link per rate; totals; a summary that
prints its own arithmetic line by line; and an explicit **Open — flagged, not silently decided** panel.

**Defaults, and the tuning that got them there — recorded rather than quietly fixed:**

| Pass | Seeded assumptions | Day-30 read |
|---|---|---|
| First | 58 h/wk displaced · $11.5k/mo revenue lift | **+477%** — the number a client stops believing |
| **Shipped** | **31.5 h/wk (≈0.8 FTE)** · **revenue lift $0 on every row** | **+11.6% labor-only**, or **+149.6%** after clicking *Load conservative revenue estimates* |

Revenue defaults to **$0 on every row on purpose**: the labor half is defensible from published BLS wages, the
revenue half is judgement, so nothing is claimed until a human types it or opts in with the button.

**Linearity, stated on the page so it isn't mistaken for a bug:** with fixed rates every term scales with the
day count, so the days field moves the dollars but not the percentage. The percentage moves when hours, lift,
or the investment change.

**Remaining for Q63:** ~~mount it on the company record (master + rep views)~~ **DONE 2026-07-25, see §4c** —
still open: feed the running-ROI view from real actuals rather than modelled inputs (§5 question C's sibling).

## 4c. Mounted in the app (2026-07-25) — Rob: *"yes definitely mounted inside the dashboard"*

| Piece | Path |
|---|---|
| Component | [`components/Phase2RoiEstimator.tsx`](../../components/Phase2RoiEstimator.tsx) |
| Automation catalogue (new) | [`lib/roi/automations.ts`](../../lib/roi/automations.ts) |
| Master company record | [`app/companies/[id]/page.tsx`](../../app/companies/[id]/page.tsx) — above Phase Blueprint |
| Rep account view | [`app/rep/accounts/[id]/page.tsx`](../../app/rep/accounts/[id]/page.tsx) — under the phase bar |
| Persistence | `phase2_estimate jsonb` on **both** `people` and `orgs` — [`0014_phase2_estimate.sql`](../../supabase/migrations/0014_phase2_estimate.sql), applied to prod 2026-07-25 |

**§4 point 5 now applies literally.** The component renders `estimatePhase2Roi` output directly — there is no
arithmetic in it beyond formatting. The standalone artifact keeps its inline copy (that is what makes it
self-contained and sendable), so the artifact is now the copy under guard, not the origin.

**The nine automations moved out of the HTML `<script>` into `lib/roi/automations.ts`.** Mounting would
otherwise have created a *third* copy of a money-facing table. Overrides are a layer over the catalogue, never
a mutation of it, so a BLS rate refresh stays a code change rather than a backfill across every row.

**Persistence, and why it needed a column.** Mounted on a record, inputs that die with the tab fail the
standing UX bar (click-to-edit, autosaves, never a Save button). The whole input object autosaves through the
same `/api/admin/people` PATCH door every inline field uses, debounced 800 ms. It never PATCHes on mount —
only after a real edit — so browsing a company does not stamp a default estimate onto it, and `NULL` keeps
meaning *never estimated*. Both tables got the column because `/companies/[id]` resolves to either anchor;
a people-only column would have saved on some company records and silently no-op'd on others (a test now
fails on exactly that).

**A defect this caught, recorded rather than quietly fixed.** The component first seeded **$12,000** — the
spec's §2a worked example — while the artifact opens at **$9,100**. The same untouched company therefore read
**+11.6%** on the page Rob emails a client and **−15.3%** on the record he opens in the dashboard. The existing
parity test could not see it: it feeds the module the *page's* defaults, never the module's own.
`DEFAULT_PHASE2_ESTIMATE` is now pinned to the artifact's inputs by two new tests.

**Guard extended:** `phase2RoiEstimatorParity.test.ts` now also asserts the HTML catalogue and
`SEED_AUTOMATIONS` match row-for-row and field-for-field, that the seeded total stays 31.5 h/wk, that fallback
rates are flagged rather than back-filled, that deselecting drops a row instead of zeroing it, and that an
untouched record reads +11.6%. **879 tests green** (up from 870); `tsc --noEmit` adds zero new errors;
`next build` clean; PATCH → Supabase → server-render rehydration verified end-to-end on a live record
(test data cleared afterwards).

## 4b. The parity guard — and the honest caveat on §4 point 5 (2026-07-25)

§4 point 5 says the UI never re-derives arithmetic. **The standalone page cannot literally honour that**, and
pretending otherwise would be the lie: being self-contained with no build step — the property that lets Rob open
it and publish it as an artifact — *requires* it to carry its own copy of the rate table and its own inline
formula. That is a second implementation of a money-facing calculation, and drift would be **silent**: the page
would go on rendering confident numbers in front of a client.

So the rule is enforced from outside instead:
[`lib/__tests__/phase2RoiEstimatorParity.test.ts`](../../lib/__tests__/phase2RoiEstimatorParity.test.ts) reads
the HTML **as text** (no DOM, no jsdom, no new dependency), extracts the page's own `ROLES`, `AUTOMATIONS`,
`DAYS_PER_MONTH` and input defaults, and **re-runs the page's defaults through `estimatePhase2Roi`** — so the
assertion is that the *module* reproduces what the *page* prints. Edit either side alone and the suite fails
naming the figure that moved. **7 tests, green as of 2026-07-25; nothing had drifted — this is a guard, not a
repair.**

What is pinned, and why each one is worth a test:

| Pinned | Why |
|---|---|
| Rate table matches `LABOR_ROLES` row-for-row, **nulls included** | BLS publishes no Naples figure for Telemarketers; back-filling the Florida rate as if it were local is the most tempting silent lie in the table |
| `DAYS_PER_MONTH` = 30.4375 | a rounded 30 quietly inflates every revenue figure |
| Every seeded lift is `$0`, at least one `suggest` is non-zero | the opt-in is real; nothing is claimed by default |
| Seed totals **31.5 h/wk**, under one FTE | keeps the day-30 read at a believable **+11.6%** instead of the first pass's **+477%** — the tuning becomes enforced, not just a commit-message anecdote |
| **+11.6%** and **+149.6%** to one decimal | the two figures §4a publishes |
| `target = investment ÷ window × days` | Rob's rule, asserted against the page's own inputs |

When the Estimator is mounted **inside the app** (the remaining Q63 work), it should render module output
directly and §4 point 5 applies literally — at which point this guard covers only the standalone artifact.

## 4. UI contract (§4a records what was built against this)

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

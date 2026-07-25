# Rob dump — Phase 2 ROI formula + the Estimator (2026-07-25 evening)

**Captured verbatim by Max, 2026-07-25.** Folded into `docs/plans/PHASE2-ROI-ENGINE-SPEC.md`
(fold status: **FOLDED 2026-07-25**) and implemented in `lib/roi/phase2.ts`. Raw text preserved below —
do not edit.

Answers Q40's long-open *"P2 = 3-month ROI guarantee (calcs forthcoming from Rob)"*.

---

> 3) My partner is writing logic as to what the recommended pricing for each job should be so we'll wire that
> in when we get together. Let this open as for now
>
> 4) We might change this formula later, but have the following variable
>
> Phase 2 Investment (The Amount they Pay for Phase 2)
> Phase 2 Investment = ROI Target
> ROI Target To date = Productivity Savings To Date  (# of labor hour saved * (since strt of Phase 2) * Labor
> Cost per hr) + Total Revenue since start of Phase 2) / Phase 2 Investment(dived by 91 days x the number of
> days since the start of Phase 2) = Answe -1   <---this is to express it as a % I also want it expressed as a $
>
> Remember, When displaying the running ROI it always has to be factored based on how far we are into Phase 2.
> Surpluss will be Great, Shortfall will be -Red
>
> Now, what I also want you to do is when we're first calculating them, have a field where we can input any
> amount of investment called Est Investment, the have an input field where you can change the number of days
> so far in Phase 2 which will change all the numbers  list the top recommended automations underneith. I want
> you to look at the specifics of the automation, figure out what type of employee would likely normally handle
> that task, what their hourly rate is in the region the business is in (or est as close as possible) in order
> to come up with a projected value per hour of the labor, estimate how many hours they usually spend on the
> task the automation is doing 24/7, estimate what you think being able to perform the task automatically would
> have garnered them in additional revenue since beginning of phase 2, divide it by the Estimated invetment
> broken down by the total number of days since the beginning of phase 2
>
> And for the Estimated section I want you do that for each one of the autoations recommended.  Then show a
> summary

---

## Also answered in the same message (folded elsewhere, recorded here for completeness)

| # | Rob's answer | Where it went |
|---|---|---|
| 1 | *"#1 website should only be said once"* | Confirms `contracts/clients/the_title_base.json` — scope was already set to **1 entity / 1 website / 1 Second Brain** on 2026-07-25. No change needed; the dev-chat #47/#48 ambiguity is now closed |
| 2 | *"Let me see the mockup as an artifact or html file or something persistent"* | Rep-cockpit mockup — BUILD-QUEUE Q46 / Q6(f). Owed as a persistent HTML artifact before the rep POV ships |
| 3 | *"My partner is writing logic as to what the recommended pricing for each job should be… Let this open for now"* | **Rep discount authority (PRD Open Question Q4) stays OPEN by Rob's instruction** — do not chase it, do not default it. Wiring happens when Rob and his partner meet |

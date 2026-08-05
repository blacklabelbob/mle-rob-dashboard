# CRITIC ROB — Q89 "What the meetings taught us" (four blocks, company record + Overview)
**Date:** 2026-08-05 · **Reviewer:** critic-rob · **Scope:** Q89 inc.1–inc.14 as live in prod
**Evidence:** prod HTML fetched 2026-08-05 for `/companies/C-2018`, `/companies/C-2005`, `/companies/C-2019`, `/` (all 200); source read at `lib/meetings/{meetingIntel,intelSource,nextStepsAdapter,networkIntel}.ts`, `components/meetings/MeetingIntelSection.tsx`, `app/companies/[id]/page.tsx`, `app/page.tsx`; `npx vitest run lib/meetings/__tests__` → 16 files / 265 tests green.

**VERDICT: REVISE · Score 60/100**
**Q89 MAY NOT BE TICKED.**

Gates: Fidelity 68 · UX 60 · Truth 62 · Engineering 65 · Recording 92 · Effort 90

**Auto-fail sweep — clean on all seven.** Nothing invented (every rendered string traces to a stored line; `alex@golf.org` was checked against the archived transcript and it is genuinely in the source, 2 hits). No Save button / edit-mode. No people/business ledger merge. No GHL, no Close-as-destination, no STG branding, no linked email identities. No "done" claimed without evidence — the driver's own increment notes are unusually honest. It is not a pile of markdown. No instruction clause was silently dropped; both halves of the DoD shipped.

---

## PUNCH LIST (ranked)

### 1. [Truth] The `ranked` label on C-2018 is a false claim, and it is live in prod. `lib/meetings/meetingIntel.ts:263-274`
Prod order on C-2018 Action Items: `06-16 to_do 3` (rank 1), `07-22 to_do 2` (rank 1), `06-16 to_do 1` (rank 2), `07-22 to_do 5` (rank 2)… The header says `ranked`. It is two rankings zipped together, and **no rank number is printed**, so the only thing that communicates priority is vertical position — which is wrong.

**RULING on the open question — one cross-meeting score per company. Not group-by-meeting.**
Reason: Rob opens a company record to answer exactly one question — *what do I do next on this account.* Grouping by meeting hands that merge back to him and re-creates "too much stuff to look through"; a meeting is a filing detail, an account is a decision. And grouping does not even fix the misread, because with no numbers on screen a reader still reads top-to-bottom as priority. One list, one score, re-run whenever a meeting lands.

**Do it in three moves:**
1. **Interim code gate, ship before anything else:** in `buildMeetingIntel`, `everyRanked` must also require ranks be **unique** — `new Set(ranks).size === ranks.length`. Duplicate rank values are machine-proof of two rankings merged. Fail → `ordering: "source-order"`. Today the block would immediately, correctly, stop claiming `ranked`.
2. **Print the number.** `MeetingIntelSection.tsx` `ItemRow` renders no rank. A rank that only exists as row position is deniable. Show `1.` `2.` `3.`
3. **Then the real fix:** one `score_next_steps.py` run per **company** over all open action candidates from all its meetings (keep the per-meeting bundles as inputs, pass `--as-of`), so `A-MTG-06-16` and `A-MTG-07-22` items are ranked against each other on the same rubric.

### 2. [Truth] The gate silently strips `provenance.context` — the Overview attributes nothing to anyone. `lib/meetings/meetingIntel.ts:217-223`
`validate()` rebuilds provenance as `{meetingId, sourceRef, excerpt?, url?}` and **drops `context`**. `networkIntel.ts:72` stamps it, `sourceLabel()` is built to print it, `Provenance.context` has a 6-line comment explaining why it exists — and it has never reached a screen since inc.4.

Prod consequence on `/`: **22 action items, 12+ pain points, drawn from three different companies, in one flat unlabeled list.** A reader sees *"I can't send fucking Facebook messages anymore — A-MTG-2026-07-22-GULFCOAST · body ¶146"* and cannot tell whose mouth it came from without decoding a meeting id. On the surface whose entire justification is provenance, that is the worst possible bug.

Fix: `...(p.context ? { context: p.context } : {})` in the rebuild, **plus** a test that runs `networkIntelFromActivities → buildMeetingIntel → sourceLabel` end to end. `lib/meetings/__tests__/networkIntel.test.ts:33` asserts context on the *candidate* and line 35 asserts `sourceLabel` *directly* — the one boundary between them is the one that eats it. 265 green tests did not see this.

### 3. [Engineering] A second bug stacked behind #2: the name map is built from the wrong ledger. `app/page.tsx:51`
`Object.fromEntries(data.people.map(p => [p.id, p.name]))` — `data.people` is the **people** ledger (`P-1004`…, confirmed: the Overview emits only `/people/P-…` links, zero `/companies/C-…`). Meetings carry `orgId: "C-2018"`. Every lookup misses, so `networkIntel.ts:72` falls back to the raw id. Fix #2 alone and the Overview will print `C-2018 · A-MTG-… · body to_do 1` — an id, not "Gulf Coast Real Estate Group". Build the map from the companies store, and have the test assert a **name**, not any-truthy-string.

### 4. [Fidelity] Nothing is clickable. The DoD's traceability clause is only half-met. `components/meetings/MeetingIntelSection.tsx:34-40`
DoD: *"every rendered item carries a link back to its meeting and the line/block that produced it, so a claim on a company page can always be opened and checked."* `provenance.url` is `undefined` on every published item, so the `<span>` branch renders every time — on all four prod pages. The `excerpt` (the source line) is stored and **never rendered anywhere**. To check a claim Rob must leave the CRM and grep a 117KB file.

I agree with `intelSource.ts:24-29` that faking a deep link to a 90-minute recording would be a lie. That is not the only option: the activity row **exists in this CRM**. Have `publish-meeting-activity.mjs` stamp `url` as an in-CRM anchor to the activity (`/companies/C-2018#A-MTG-2026-07-22-GULFCOAST`) — honest and checkable — and render the `excerpt` under the item text (collapsed/expand is fine). Note for the action-items case: on the file-published rows `excerpt` is byte-identical to `text` (`data/meetings/2026-07-22-gulfcoast.activity.json:82,84`), so the excerpt adds no independent check there and the deep link is the whole fix.

### 5. [UX] It is not front and centre on the company record. `app/companies/[id]/page.tsx:319-330`
On `/companies/C-2019` and `/companies/C-2005` the section begins ~33% down the document, as the 5th panel — after Deals, the ROI Estimator, and the Phase Blueprint. Rob: *"brought front and center when you look up the associated Companies."* Above the timeline is not front and centre; it is below the fold. Move the mount directly under the name/status header, above Deals. The Overview half (`app/page.tsx:164`, 2nd panel, 6% down) is placed right — copy that.

### 6. [UX/Truth] The coverage gap is invisible: a company with no captured meeting looks exactly like a company with nothing to say. `components/meetings/MeetingIntelSection.tsx:97`
`if (meetingCount === 0 && intel.isEmpty && !intel.rejected.length) return null;` — so ~28 of ~31 companies render **nothing**. The comment's fear is right (four empty boxes everywhere is noise) but the conclusion is wrong: the answer is one line, not four boxes.
Render, always: **"No meeting captured on this record — 4 meetings across 3 companies in the CRM."** And put the denominator in the Overview count label: `3 of 31 companies` instead of `4 meetings · 3 companies`. Coverage of 3/31 is the single most important fact about this feature right now and today Rob can only learn it by opening 31 pages.

### 7. [UX] The Overview action block is a 22-row wall with no cap and no summary layer. `app/page.tsx:164`
Every action item in the CRM, ungrouped, unlabeled (see #2), unranked. That is the raw-sprawl defect. Once context lands: group by company, cap each block at ~5 with "show all N".

### 8. [Engineering] The test suite has a structural blind spot, and this review found two bugs inside it.
265 tests pass, and #2 (a designed feature dead for 10 increments) plus #3 (wrong ledger) both live in the gap between "candidate is correct" and "screen is correct". Add one boundary test per surface that asserts the **rendered label string**, driven from the same shape the page builds. `publishedRankCarry.test.ts` was the right instinct — it needs a sibling for the Overview.

### 9. [Truth — advisory] Talking points and benefits carry an `excerpt` that nothing checks.
Only pain points are gated for verbatim (`meetingIntel.ts:198-213`), which matches the DoD. But `C-2005` renders *"Every pitch has to be about heads through the door, not ticket size"* — authored prose beside an unchecked excerpt. That is legitimate as a talking point; the risk is that nothing prevents it from drifting free of its source. Cheap hardening: require a non-empty `excerpt` for all four kinds (reject `no-excerpt-to-check` for every block, not just pains), so every claim at least ships the line it stands on.

### 10. [Truth — verify, do not change] `alex@golf.org` on C-2018.
Rendered on the company record; present twice in the archived transcript, so the pipeline carried it faithfully — **not a fabrication.** It is still almost certainly a summariser's mishearing of "gulf". Confirm the address with Rob before anyone sends the legal analysis to it, and if it is wrong, fix it at the source line with a note — never silently in the render.

---

## WHAT SURVIVES CONTACT WITH ROB

1. **The pain-points block is exactly right and it is the best thing here.** *"Our IT sucks."* · *"It's just been a frustration of mine."* · *"Naples is just saturated with restaurants"* · *"I can't send fucking Facebook messages anymore"* — quoted as said, profanity intact, not one of them sanded into "an opportunity to streamline". The verbatim rule is enforced in code (`isVerbatim`, substring against the cited excerpt) and re-enforced at the write boundary in the publisher. That is CR-3 done properly, and it is the clause Rob would have checked first.
2. **The empty-block discipline.** `emptyReasonFor()` distinguishes "nothing was said" from "3 candidates failed the check", both mounts degrade an activity-store outage into "this is our outage, not a statement about this company", and `intelSource` passes malformed entries *through* so they are rejected visibly instead of vanishing. Nobody builds this unless they mean it.
3. **Both halves of the DoD genuinely shipped and are live** — record and Overview, same gate, same face, one ranking authority, with a plan-by-default idempotent publisher and the transcript moved out of `/tmp` into a durable archive.

**The verdict is REVISE, not UNACCEPTABLE, for one reason: nothing is invented.** The defects are a label that overclaims, an attribution that never reached the screen, and a link that was never wired — all fixable in a day, none of them lies about a customer. Fix #1 through #4, move the mount (#5), and this ticks.

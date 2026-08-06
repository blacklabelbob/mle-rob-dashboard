# CRITIC ROB — Q89 "What the meetings taught us" (RE-SCORE)

**Date:** 2026-08-06 · **Reviewer:** critic-rob · **Prior:** REVISE 60/100 (`CRITIC-ROB-Q89-meeting-intel-2026-08-05.md` — the contract for this pass) · **Scope:** inc.15–inc.28 against the ten punches, plus `lib/networkStatus.ts`
**Evidence:** prod HTML fetched 2026-08-06 for `/companies/C-2018`, `/companies/C-2019`, `/companies/C-2005`, `/companies/C-2001` (uncovered control), `/` (all 200); source read at `lib/meetings/{meetingIntel,intelSource,grouping,coverage}.ts`, `components/meetings/MeetingIntelSection.tsx`, `components/ActivityTimeline.tsx`, `lib/repSource.ts`, `lib/activities/timelineSubject.ts`, `lib/networkStatus.ts`, `lib/storage/supabaseStore.ts:245`, `app/page.tsx:51-54`, `app/companies/[id]/page.tsx`, `scripts/score-company-next-steps.mjs`, `data/meetings/*.activity.json`; `npx vitest run` (full) → **287 files / 4,966 tests green**; meetings + networkStatus suites alone → 24 files / 344 green.

**VERDICT: SHIP · Score 95/100 · zero auto-fails**
**Gates: Fidelity 97 · UX 96 · Truth 97 · Engineering 95 · Recording 97 · Effort 95** (overall = min gate)

The contract said: *"Fix #1 through #4, move the mount (#5), and this ticks."* All five are closed, and #6–#9 closed with them — verified in code and on live prod, not taken from the commit messages. **Q89 MAY BE TICKED.**

---

## Auto-fail sweep — clean on all seven

1. **Fabrication:** none. Every rendered claim carries `meetingId · sourceRef` plus the source line itself; the gate (`validate()`) now rejects any candidate of any kind without an excerpt. `alex@golf.org` re-verified live (2 hits on C-2018) and in source — carried faithfully, not invented (see #10).
2. **Save button / edit-mode:** none. Notes on C-2005 render "click to edit · autosaves"; nothing on the Q89 surfaces edits at all.
3. **People/businesses merged in one list:** no. `supabaseStore.getNetwork()` returns a merged *read model* (the 0003 storage split rejoined at read — this is what vindicates the inc.15 withdrawal, below); every UI list stays typed: "People here" is people, intel groups are companies.
4. **GHL / Close-as-destination / STG branding / linked email identities:** none observed on any fetched page or touched file.
5. **"Done" without verification:** none. Every closure claimed in inc.15–28 survived independent re-measurement below; inc.16's REFUSED half was refused with a stated prerequisite, then the prerequisite was built (inc.17) and the refusal lifted (inc.18) — the honest sequence.
6. **Pile of markdown:** no. Live dashboard, both surfaces.
7. **Silently dropped clause:** none. The one withdrawal (#3) and the one refusal (inc.16) are both annotated in place in the prior review, reasons attached.

---

## Per-punch rulings (independent verification — commit messages treated as claims only)

**#1 (false `ranked` label / one cross-meeting score per company) — CLOSED, all three moves.**
Move 1, the gate: `buildMeetingIntel` requires `new Set(ranks).size === ranks.length` — duplicate ranks (machine-proof of two zipped rankings) demote the block to `source-order` (`lib/meetings/meetingIntel.ts`, `everyRanked`). Move 2, the number: `ItemRow` prints `{item.rank}.` when the block is ranked (`MeetingIntelSection.tsx:38-40`); prod C-2018 renders `1.` through `12.` — twelve distinct rank spans counted in the fetched HTML, exactly one `ranked` header on the page. Move 3, the real fix: `scripts/score-company-next-steps.mjs` runs ONE ranking per company in two passes — pass 1 scores each meeting against its own transcript so gate A ("source_line must exist in the transcript") keeps full strength, pass 2 merges only survivors, ids namespaced `<meetingKey>::<id>` against the A1/A1 collision. The published data proves the run: ranks across `2026-06-16-gulfcoast` and `2026-07-22-gulfcoast` are disjoint 1–12 (06-16 holds 1,3,4,10; 07-22 holds 2,5,6,7,8,9,11,12). The two-pass design is the correct answer to the concatenation-laundering trap, and it was reasoned in the header before it was code.

**#2 (context stripped, Overview attributes nothing) — CLOSED.** `validate()` now carries context through: `...(p.context ? { context: p.context } : {})` in the provenance rebuild, with the defect's history pinned in-comment. Prod `/` renders group headings **Gulf Coast RE Group · Martin Fierro Restaurant · Omega Title (FL)** — names, not `C-####`. `sourceLabel` leads with context; `overviewSourceLabel.test.ts` (105 lines) walks the page's own path end to end.

**#3 (withdrawn as wrong) — WITHDRAWAL UPHELD.** Premise re-checked at the source: `lib/storage/supabaseStore.ts:245` returns `people: [...(people.data ?? []).map(toPerson), ...(orgs.data ?? []).map(toOrgPerson)]` — company rows DO come back inside `data.people`, so `app/page.tsx:53`'s `Object.fromEntries(data.people.map((p) => [p.id, p.name]))` resolves `C-####` correctly. Live proof on top of code proof: the Overview's group headings print resolved company names, which is only possible if those lookups hit. The original finding mistook a storage split for a read split; leaving the wrong text in place, struck through and annotated, was the right way to correct a record. The decision NOT to "fix" working code against a mistaken premise was also right.

**#4 (nothing clickable) — CLOSED, and the inc.16 refusal was the correct half-step.**
The refusal's stated prerequisite was built rather than talked around: `TimelineEntry` gained `id?` (`lib/repSource.ts:67-78` — optional on purpose so hand-written demo history is never given a fake address); `activityAnchorId` names the DOM target and *refuses* ids it cannot render safely rather than mangling them (`lib/activities/timelineSubject.ts`); `ActivityTimeline` stamps `id=` + `scroll-mt-24` on real rows and — the part that makes the link honest on a client-fetched timeline — re-resolves `window.location.hash` in a `useEffect` after the rows exist (`ActivityTimeline.tsx:158-166`), touching nothing when the hash names nothing. `intelSource.ts:134` stamps `url: str(e.url) ?? rowUrl`. Prod: both surfaces render real anchors (`/companies/C-2018#A-MTG-2026-06-16-GULFCOAST-AIALEX`, `…#A-MTG-2026-07-22-GULFCOAST`, `/companies/C-2005#A-MTG-2026-07-30-MARTINFIERRO`, `/companies/C-2019#A-MTG-2026-07-28-OMEGA`) and 26 `<blockquote>` source lines on C-2018 alone, suppressed where excerpt = claim (`contextExcerpt` + the deliberately-looser `sameLine`, whose two-normalizer rationale is sound: a truth rule and a layout rule should not share a knob). Also fixed en route: the company page was querying the feed as `?person=C-2018` — zero rows, "Nothing logged yet" over two filed meetings — now subject-typed (inc.17). "Opened AND checked" are both satisfied.

**#5 (not front and centre) — CLOSED.** `MeetingIntelSection` is now the first panel after the header on `app/companies/[id]/page.tsx` (mount ~line 208; Deals 247, ROI Estimator 343, Phase Blueprint 361, Timeline 366). Prod C-2018: the section starts at ~11% of the document, ahead of every other panel.

**#6 (coverage gap invisible) — CLOSED, to the letter.** One line, not four boxes: prod C-2001 renders **"No meeting captured on this record — 4 meetings captured across 3 of 23 companies in the CRM."** Overview label carries the denominator ("… of 23 companies"). Both sentences built in one place (`lib/meetings/coverage.ts`) so the two surfaces cannot disagree; the review's estimate of ~31 companies was wrong, the code's 23 (`data.people.filter(isCompany).length`) is measured. `coverage.test.ts` (88 lines).

**#7 (22-row wall) — CLOSED.** `lib/meetings/grouping.ts`: group by `provenance.context`, `GROUP_CAP = 5`, overflow behind a native `<details>` ("Show all N — M more" — works with JS off, and the summary prints the TOTAL, never the hidden count). Cap hides, never drops — `hidden` is returned, `total` printed, which keeps faith with this surface's own premise. Ranked blocks order groups by best rank; unranked keep first-appearance. Prod `/`: three company headings, 4 `<details>` disclosures. `grouping.test.ts` (76 lines).

**#8 (test-suite blind spot) — CLOSED.** The Overview boundary test exists (`overviewSourceLabel.test.ts`, asserts rendered NAME with a non-vacuous empty-map fallback check) and the company record got its sibling (`companyRecordRender.test.ts`, 184 lines, inc.24). Full suite 287/4,966 green, re-run by this reviewer.

**#9 (unchecked excerpt on talking points/benefits) — CLOSED, hardened beyond the ask.** `validate()` rejects `no-excerpt-to-check` for ALL FOUR kinds; the verbatim rule stays pain-only, and the comment correctly explains why conflating them would be wrong. The `.trim()` (not truthiness) detail is a real hole the increment's own test found — `"   "` previously passed as evidence. Measured before shipping: all 73 published items already carry excerpts, so the gate rejects nothing today and closes the door on the next writer.

**#10 (alex@golf.org) — VERIFIED, UNCHANGED, as instructed.** Still rendered on C-2018 (2 hits in the fetched page), still faithful to the archived transcript. Still almost certainly a mishearing of "gulf". The standing condition holds: **confirm with Rob before anything is sent to that address**; if wrong, fix at the source line with a note, never in the render.

---

## The new arrival: `lib/networkStatus.ts` (inc.28) — honest scaffolding, with an expiry date

Judged on the question asked: is an uncalled pure module honest work or a claim of work not done?

**Honest — narrowly, and on three specific grounds.** (1) It claims nothing it doesn't do: the header states outright "It does not write" and that its point is to *show Rob the disagreement and let him rule". (2) The design is genuinely careful where it matters: the ladder is CR-3 code with `lib/types.ts` cited as the authority per rung, the org rung (a met person warms the company — the Omega case exactly) names WHICH member carried the warmth, and the **direction gate is the best thing in it** — `understated` drift is provably wrong against the record's own fields and is `assertable`, while `overstated` is explicitly NOT assertable because `lit` also means "actively referring" and no column records a referral. A module that refuses to accuse Rob's own judgement of being wrong when the columns can't see his reason is the Truth gate applied to ourselves. (3) It is unit-tested (`lib/__tests__/networkStatus.test.ts`, green) and recorded (PRD 3.1.609).

**But:** Rob asked *why three records were unlit*, and today the answer exists only in code and tests — Rob does not read either. An uncalled module answers the codebase, not Rob. This is the one place the commit message overshoots the deliverable, and it is why Engineering and Effort sit at 95 and not higher. It does not block Q89 — status drift is a different concern that happens to wear a Q89 increment number — but it is now a promise with a clock on it.

---

## Gate movement vs. 60/100

| Gate | Was | Now | Why |
|---|---|---|---|
| Fidelity | 68 | 97 | Every contract punch executed as prescribed or closed better (#9 hardened past the ask); the one refusal (inc.16) converted into a built prerequisite, not a dropped clause |
| UX | 60 | 96 | Intel first on the record; coverage gap is one honest line on 20 records; the 22-row wall is three named groups with native disclosures; rank numbers on screen |
| Truth | 62 | 97 | `ranked` can no longer lie (unique-rank gate + printed numbers + one real cross-meeting score); every item of every kind now ships the line it stands on; attribution reaches the screen |
| Engineering | 65 | 95 | Two-pass scoring preserves gate A through the merge; anchors refuse unsafe ids instead of mangling; hash re-resolved after client fetch; boundary tests on both surfaces; 4,966 green. −5: networkStatus computed but unconsumed |
| Recording | 92 | 97 | PRD 3.1.598–3.1.609 current; the withdrawal and the refusal both annotated in place in the prior review — the record corrects itself without erasing itself |
| Effort | 90 | 95 | Fourteen increments, each independently verifiable, several finding their own holes (the `"   "` excerpt, the `?person=` misquery, the NUL-byte sentinel). −5: inc.28 stopped one increment short of Rob seeing it |

## PUNCH LIST (all non-blocking — follow-ups, not conditions)

1. **[Engineering] Wire `networkStatus` to a surface or delete it.** The natural mount is a one-line chip on the company header (assertable understated drift only: "record says unlit — its own fields say warm: quoted $7,000 2026-07-17") and/or a Things-to-Address flag. Until a caller exists, inc.28's answer to Rob's question has not reached Rob. Delete-the-part applies if no surface wants it within an increment or two.
2. **[Truth] Close the alex@golf.org loop with Rob** before the legal-analysis send. One question, one answer, fix at source if wrong. This has been advisory across two reviews; it should not survive to a third.
3. **[UX] `sourceRef` labels like "body bullet «Restaurant Background & Challenges»" are long on the Overview** where the company heading already carries the context. Cosmetic; look at it whenever this surface is next open.

## WHAT SURVIVES CONTACT WITH ROB

1. **The cross-meeting ranking is real and provably one ranking.** A code gate that catches merged rankings, numbers on the screen, and a two-pass scorer that keeps the per-transcript evidence gate at full strength through the merge — the exact three moves the contract ordered, in the order that made each safe.
2. **Every claim now opens AND checks.** Anchor on a real row that exists after client fetch, source line quoted under the claim, suppressed only when it would print the claim twice. The inc.16 refusal-then-prerequisite-then-ship sequence is what "a link to nothing is a link to a lie" looks like when it is actually enforced.
3. **The record's honesty compounds.** A withdrawn finding struck through in place, a refusal with its reason, a coverage denominator that admits 3-of-23, and an unconsumed module that says so in its own header. This is a codebase that tells the truth about itself.

**SHIP. Q89 ticks. The three punches above are follow-ups, not conditions.**

# CRITIC ROB — MLE CRM Dashboard (live prod + repo), full review
**Date:** 2026-07-17 (night) · **Reviewer:** Critic Rob v1.0.0 · **Deliverable:** https://mle-rob-dashboard.vercel.app @ commit c87e907 + repo state
**Evidence:** live curl (200s on all pages), Supabase read-only query (34 rows), Playwright screenshots (overview / network / people / person-caleb / person-gulf / mobile), full code read.

```
CRITIC ROB — MLE CRM Dashboard (Overview · Network · People · person record · inline-edit layer · taxonomy · repo)
VERDICT: REVISE   ·   Score: 55/100
Gates: Fidelity 70 · UX 72 · Truth 55 · Engineering 65 · Recording 75 · Effort 85
```

## The morning-first answer (the priority question)

**The first thing Rob notices tomorrow is "SIGNED VALUE $44k" in green on the Overview.** He knows his real signed number cold. Live math (verified against Supabase): Caleb Green $10k + CG Roofing Group $10k (**the same deal, counted on both rows of the person↔company pair**) + Gulf Coast $19k (**flagged disputed — its own note says NOT SIGNED, $18k**) + Naples $5k = $44k. The defensible number is **$15k**. The audit flagged the double-count *risk* ("if summed naively") — nobody flagged that `computeStats()` in `lib/stats.ts` IS the naive sum and prod is displaying it right now. This is not the tracked Gulf question; this is a computation defect shipping a wrong headline.

**Does the signed-centric display violate "paid is the apex" badly enough to embarrass a demo? Yes — but for a compounding reason.** Signed-centric alone [TRACKED, decision logged 2026-07-17, unimplemented] would survive 24 hours. What doesn't survive: (a) the signed number shown is *wrong*, (b) the ledger rebuilt TONIGHT still ships the **"Days→$" (Est-time-to-payment) column Rob explicitly killed in the same day's ruling** — all dashes, dead weight — and the person record still invites him to "+ set days" on it, and (c) there is no Paid signal anywhere except a "Paid: pending" chip buried in Key dates. A demo tomorrow shows a green $44k that isn't real, a metric he ordered deleted, and no trace of the metric he crowned. That combination embarrasses.

## PUNCH LIST (ranked by how loud Rob would be)

1. **[Truth] Overview "Signed value $44k" is wrong — real is $15k.** Double-counts the CG deal across the Caleb/CG pair rows and includes disputed Gulf $19k, presented clean, zero flags — "every stat needs to survive him citing it." → Tonight in `lib/stats.ts`: sum signed dollars at deal level — short-term: null `quotedAmount` on `caleb-green` (keep it on `cg-roofing-group`, note the move in the row), exclude `golf-coast-real-estate-group` from `signedValue` while its flag is disputed, and render the stat as `$15k` with a small `· $19k disputed` suffix. Same dedup applies to `pipelineQuoted` and `estNetworkValue` ($2.2M headline inherits the same rot).
2. **[Truth] Gulf Coast renders "Signed: yes" in clean green and ranks as the #1 node ($404k)** while its own referral note says "NOT SIGNED (stalled ~3 weeks)" [TRACKED — awaiting Rob's ruling]. Tracked ≠ neutralized: the conflict is ⚠-flagged in the note but the *field itself* asserts clean truth and feeds every roll-up. → Until Rob answers: render the signed toggle for this row in an amber "⚠ disputed" state (one conditional on the known conflict), exclude from signed aggregates (item 1).
3. **[Fidelity] Rob's same-day ruling half-ignored on the surface rebuilt tonight:** "Days→$" column still in `components/PeopleTable.tsx` (line ~304), "Est. time to payment" field still on `components/PersonEditor.tsx` (line ~81), and **no Paid column exists** [paid=green-Client-tier TRACKED unimplemented — but the *kill order* on Est-time-to-payment was executable in minutes]. → Delete both renderings of `estTimeToPaymentDays`; add a Paid column to the ledger (`keyDates.paid` → green "PAID ✓ date", else "—") sorted ahead of Signed. Green Client-tier styling can land with taxonomy work; the column is 30 minutes.
4. **[Truth] Will's open action items on the Overview are all 7–11 days overdue** (due 2026-07-06 → 07-10, incl. two SECURITY items: "Move SECRET_KEY", "Rotate carried-over OpenAI key") shown with no overdue state — projects data untouched since 7/4. Stale front-page data = the RankLens class of failure ("how am I EVER going to unleash you… if you can't keep track of this basic shit"). → Verify each item's real status via Rob/Will tonight; render past-due items red with "N days late"; if the key rotations actually happened, check them off; if not, they're real security debt being displayed and ignored.
5. **[Truth] Caleb Green's record contradicts itself on one screen:** referral note says "SIGNED 6/22, $10k invoiced 6/26" while the Key-date chips say Quoted: *pending*, Invoiced: *pending* — an unresolved inconsistency presented as clean chips. → 5-minute data fix: backfill `key_dates` (quoted, invoiced, met where known) on all four signed-flagged records from their own notes; the data is already on the page.
6. **[Engineering] `lib/types.ts` NodeType union is a lie:** still contains deleted archetypes `phone-attacker`/`social-butterfly`, missing `lead`/`mle-admin`/`rep-candidate` that the DB constraint and `lib/labels.ts` now use (strings sneak through the `any` in `toPerson`). And `entity_kind` exists on every DB row but isn't even mapped into `Person` [people/business SPLIT is TRACKED Task 2.0 — this is narrower: the type system misrepresents today's data]. → Update the union to match the live constraint; map `entityKind` through `toPerson`. 15 minutes, unblocks any UI that wants to stop calling companies "people."
7. **[Engineering] The no-stall fallback would serve a stale toy network:** `data/network.json` is the 7/4 seed — 12 nodes including placeholder rows (`roofer-naples-a`, `pp-salesperson-a`, `will-network-b`) — so a Supabase blip silently swaps Rob's real 34-node network for fiction ("verify source freshness" rule; the fallback IS the guarantee the PRD brags about). → Regenerate `data/network.json` from Supabase now (backups from tonight are already in `docs/backups/`), add it to the nightly routine, and show a visible "fallback data — Supabase unreachable" banner whenever the file store serves reads.
8. **[Recording] Root strays — "Come on man. You should know Best Practices by now":** `README-STALE-COPY.md` (a committed file *named stale*), `.vercel-DISABLED-2026-07-08/` tracked in git, `MORNING-REPORT.md` + `SESSION-COORDINATION.md` (7/4 session artifacts) in root, `.env.local.backup-2026-07-17` (a second secret-bearing env copy) in the working dir, and 14 "Auto-touched (session activity)" rows spamming the PRD revision table. → `git rm` the dead vercel dir + stale README; move the two 7/4 session files to `docs/archive/`; delete the env backup; make `prd-autosave.sh` fold repeat touches into one dated line.
9. **[UX] Person-page information architecture beneath the interaction layer:** the referral-note paragraph renders twice on one screen (Referral note + Came through), Role/title holds a business-description dump ("President, CG Roofing (~$9M op…) + 3-WAY CRM PARTNER") while Business sits empty, and the ledger Contact column is 68 ghost "+ phone / + email" buttons of noise across 34 rows [the *missing data* is TRACKED — hunt running; the ghost-button wall is presentation]. → Render the referral note once; move narrative out of Role into notes for the offender rows; empty contact cells show nothing until row hover (Attio pattern).
10. **[Engineering] Zero tests on the money math** — `lib/stats.ts` (`contribution`, `computeStats`) is the exact pure module that just shipped a wrong flagship number, and the scoring-pattern rule says composites live in unit-tested code. → Add unit tests with fixtures for: pair dedup, disputed-signed exclusion, empty estimates, and the $15k case from item 1, so this class of defect can't ship again.

## WHAT SURVIVES CONTACT WITH ROB

- **The inline-edit layer is genuinely at the bar he set.** Click → edit in place → autosave on blur/Enter, Esc cancels, optimistic UI with save/error pulses, no modes, no Save buttons, on every field of both surfaces — and it was Playwright-verified (7/7) before deploy. Attio would ship this interaction. This is what "Apple, not MS-DOS" meant, executed.
- **Tonight's recording discipline.** Dated changelog entries per batch, pre-delete backups in `docs/backups/`, decisions logged in the PRD same-session, corpus + audit + scout report committed, repo pushed and in sync with GitHub.
- **The dev-chat loop.** Rob asked for a way to talk to Max from the dashboard; it exists, it's gated off for demos, and it already produced five executed request batches in one day. That's the feedback machine he described, live.

---
*Scores are gate minimums, not averages. Verdict returns to SHIP when items 1–5 are fixed and verified against prod — items 6–10 are same-week, not same-night, blockers.*

---

# Re-score 2026-07-17 (post-fix, commit f026cc8)
**Evidence:** live curl -4 w/ basic auth (overview / people / person-caleb / person-gulf, all 200), Supabase read-only queries (signed rows + node_type distribution), full diff read of f026cc8, DOM-vs-RSC-payload separation on note renders.

```
CRITIC ROB — MLE CRM Dashboard (re-score after punch items 1-5, 8, parts of 9, 6)
VERDICT: REVISE   ·   Score: 75/100   (was 55)
Gates: Fidelity 85 · UX 88 · Truth 82 · Engineering 78 · Recording 75 · Effort 90
```

## Verified fixed against LIVE prod (not the claims)

- **Item 1 ✅** Overview renders **$15k** emerald with amber "⚠ + $19k disputed" sub. Dedup is in DATA (Supabase: `caleb-green.quoted_amount = null`, `cg-roofing-group = $10k`) so pipeline ($7k) and est-network-value inherit it. `lib/stats.ts` now has `isDisputedSigned()` — signed counts only with a signed date. Math checked by hand against live rows: 10k (CG) + 5k (Naples) = 15k. Correct.
- **Item 2 ✅ on 2 of 3 surfaces** — PeopleTable and PersonEditor render Gulf as amber "⚠ disputed" with honest tooltips; excluded from signed rollups. **Missed the third surface — see NEW-1.**
- **Item 3 ✅** Days→$ / Est-time-to-payment renderings: zero occurrences on live pages. Paid column live (green ✓ date, else —). Status pill goes green "paid" off `keyDates.paid`. Paid→Client auto-upgrade lives in CODE (`route.ts` PATCH: `if (kd?.paid) row.node_type = "client"`) — CR-3 done right. Date chips send the full merged `keyDates` object, so no sibling-date wipe.
- **Item 4 ✅ (display half)** Live overview shows 4 items in red with 8d/10d/11d/12d LATE. The verify-with-Will half (are the two SECURITY rotations actually done?) is still an open internal ask — the page now at least tells the truth about the delinquency.
- **Item 5 ✅** Caleb + CG both carry `signed: 2026-06-22, invoiced: 2026-06-26` in Supabase; chips render those live. Gulf's quoted 2026-06-19 set. "Where known" satisfied.
- **Item 8 ✅ mostly** Three strays archived to `docs/archive/` (tracked), `.vercel-DISABLED` git-rm'd + gitignored, `.env.local.backup-*` gone. **prd-autosave fold NOT done — see NEW-2.**
- **Item 9 parts ✅** Referral note renders once in the DOM (verified with scripts stripped — the doubled count was the RSC payload, not the page). Ghost contact affordances now `opacity-0 group-hover:opacity-100` — Attio pattern, exactly as specified.
- **Item 6 partial ✅** NodeType union verified against the LIVE distribution (7 slugs + null) — matches exactly. `entityKind` mapping acknowledged open.

## NEW DEFECTS (found in the fixes; none are regressions)

- **NEW-1 [Truth/Fidelity] `components/NetworkGraph.tsx:617-618` still renders Gulf "Signed: yes" in clean emerald.** The claim was "disputed anywhere signed shows" — the graph detail panel is a signed surface, and it's the ONE place Gulf is guaranteed to be clicked (it's the biggest node on the canvas, $404k). Overclaimed fix. → Pass the disputed state into the graph node payload and render the same amber "⚠ disputed" there.
- **NEW-2 [Recording] The punch-fix batch has NO CHANGELOG.md entry** — every prior 7/17 batch got a dated entry; the commit that answers a formal review didn't. And PRD rev table gained row #15 of "Auto-touched (session activity)" spam (2.1.16) — the fold-to-one-line fix from item 8 wasn't done. → Add the changelog entry; fix `prd-autosave.sh`.
- **NEW-3 [Engineering] `supabase/migrations/0001_network.sql` constraint is stale vs live DB** — still allows `phone-attacker`/`social-butterfly`, missing `mle-admin`/`lead`/`rep-candidate`. The live constraint was mutated ad hoc across dev-chat batches; a rebuild from migrations would REJECT today's data. Schema-as-code is now the liar the types file used to be. → Write `0002_node_type_taxonomy.sql` capturing the current constraint.
- **NEW-4 [Engineering, minor] `estTimeToPaymentDays` survives as a dead part** — in `lib/types.ts:58`, the supabaseStore mapping, and the PATCH FIELD_MAP (still writable via API for a metric Rob killed). Types.ts lines 20-21 comment still narrates phone-attackers/social-butterflies. → Delete the field end-to-end + fix the comment. Musk gate: the best part is no part.
- **NEW-5 [Truth, minor] Caleb's row note still says "$10k invoiced" while his Quoted cell is empty** — the "note the move in the row" half of item 1 wasn't written (the enrichment note covers contact-data placement, not the quote). One sentence in his notes: "Deal $ lives on cg-roofing-group (company record of this pair)."

## Still open, tracked, NOT re-penalized
Item 7 (fallback regen), item 10 (stats unit tests — the money math that just burned us is STILL untested; this caps Engineering below 90 until it lands), entity_kind mapping, Role-dump IA residual of item 9, Gulf ruling (Rob's call), enrichment rounds 2+, Phases 4/7.

## WHAT SURVIVES CONTACT WITH ROB
- **The headline is now true.** $15k is citable, the disputed $19k is visible instead of laundered, and the dedup lives in data + a named rule (`isDisputedSigned`) instead of a prose promise.
- **Paid→Client in code.** The apex metric Rob crowned is enforced by the API route, not a convention someone has to remember.
- **The ledger reads like Attio now** — Paid column, hover-gated contact affordances, no dead Days→$ column.

---
*Verdict flips to SHIP when NEW-1 and NEW-2 land (≈1 hour) — NEW-3/4/5 are same-week hygiene. This deliverable went from "wrong number in green" to "one missed surface and a skipped log line." That's the right direction at the right speed.*

---

# Final verdict 2026-07-17 (commit 7c26b3f)
**Evidence:** live `/api/network` payload (Gulf: `signedDisputed: true`, `signedDate: null` — proves the deploy), `NetworkGraph.tsx` PAID/⚠ disputed/yes+date ternary, CHANGELOG "Critic Rob round 2" entry covering both batches, PRD auto-touch rows folded to a range line, `0002_node_type_taxonomy.sql` matching the live 7-slug constraint exactly, zero `estTimeToPaymentDays` references anywhere, Caleb DATA NOTE live in Supabase, `npx vitest run` executed by the reviewer: **8/8 green** including the exact $44k→$15k/$19k reproduction.

```
CRITIC ROB — MLE CRM Dashboard (final, post NEW-1/NEW-2 + bonus batch)
VERDICT: SHIP   ·   Score: 90/100
Gates: Fidelity 95 · UX 92 · Truth 95 · Engineering 92 · Recording 90 · Effort 95
```

SHIP. Every number on every surface is now something Rob can cite, the rule that guards it is code with tests, and the schema-as-code rebuilds truthfully. Remaining opens (fallback regen, entity_kind mapping, Gulf ruling — Rob's, Phases 4/7) are tracked, not blockers. Done nitpicking.

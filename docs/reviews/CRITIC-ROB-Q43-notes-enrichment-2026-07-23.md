# CRITIC ROB — Q43 Notes/Enrichment Layout Retrofit (readability pass)

**Date:** 2026-07-23 (ET — see PRD date convention) · **Reviewer:** critic-rob agent · **Requested by:** driver increment, Q43 DoD ("critic-rob readability pass")

**VERDICT: REVISE · Score 78/100**
**Gates:** Fidelity 88 · UX 85 · Truth 80 · Engineering 78 · Recording 90 · Effort 92 (overall = min gate)

**Reviewed:** `lib/notes.ts`, `lib/__tests__/notes.test.ts` (18 tests, all pass; full suite 598/598 green), `components/PersonEditor.tsx`, `components/EnrichmentSection.tsx`, `components/inline/fields.tsx`, `app/people/[id]/page.tsx`, commit `113fe25`, plus live prod on all five named records **and** the company variant (`miga-food-manufacturing`).

---

## What was verified live on prod (not taken from the queue)

- **gary-waskivich** — Notes box honest-empty (`+ add notes`), enrichment collapsed at bottom, "show all (4)" expander. Matches the queue claim exactly.
- **daniella-roach** — Notes = her single human line only; Sources block demoted to enrichment. Matches.
- **michael-jaenvega, david-cates, rob-acheson** — enrichment section rendered, "machine-gathered" labeled, no expander (single block). Correct.
- **Company variant IS covered** — the same `/people/[id]` route renders company rows (`entityKind === "company"`); verified live on miga. The queue does **not** overstate this. But see punch #1.
- Interaction floor holds: click-to-edit, autosave on blur, Esc cancels, optimistic UI, amber pulse, zero Save buttons, zero edit modes. "Attio would ship this interaction."

## Answers to the four scoped questions

1. **Is the split honest?** Yes, and the tests are the best part of the deliverable — real prod fixtures, a fixture *correction* documented in-file, and a test that deliberately pins the mid-line-marker limitation so a future "helpful" fuzzifier fails loudly (`notes.test.ts:81-90`). Round-trip pinned on five real shapes incl. empty-human, enrichment-only, no-enrichment, multi-line human (`notes.test.ts:136-149`). **Human words below a marker ARE silently reclassified as enrichment** — unreachable through the UI (save recomposes human-on-top) but reachable by other writers. See punch #4/#5.
2. **Does it read notes-first and uncrammed?** On person records, yes — genuinely. Quiet `text-xs slate-500` enrichment on a near-invisible card, clear hierarchy, honest expander. On the miga company record, **no** — punch #1.
3. **Org variant:** covered, verified. Queue accurate.
4. **Prod:** verified above. Two queue claims the code does NOT fully support — punch #2 and #3.

---

## PUNCH LIST (ranked by how loud Rob would be)

| # | Gate | Item | Status |
|---|------|------|--------|
| 1 | UX/Fidelity | miga leading-pipe artifact in the human Notes box on prod | ✅ **FIXED 2026-07-23** |
| 2 | Engineering | `lintNotes` is dead code — zero consumers | open |
| 3 | Truth/Engineering | "an edit can NEVER wipe provenance" is stronger than the code (read-modify-write race) | open |
| 4 | Engineering | two shipped writers still cram machine tags mid-line into human notes | open |
| 5 | UX | "machine-gathered" badge is false over Rob-confirmed content | open |
| 6 | Recording | queue note drift ("13 new tests" — actual 18; inc.2 unlogged) | ✅ **FIXED 2026-07-23** |
| 7 | UX (minor) | mobile single-column puts enrichment above EstimatePanel | deferred → Q39 |

**1. [UX/Fidelity] Miga's Notes box renders `| Rob 2026-07-17: ownership resolved…` on prod RIGHT NOW** — a stray pipe artifact opening the human Notes on a live company record. This is the exact shape the shipped test suite *names* ("miga shape", `notes.test.ts:108-112`) — the lint test was written and the row left broken. → Fix the DATA: strip the leading `| `. *(Done this increment: `orgs.miga-food-manufacturing.notes`, pure prefix strip, body byte-identical, pre-image kept.)*

**2. [Engineering] `lintNotes` is dead code — zero consumers in the repo.** `lib/notes.ts:74` promises issues "can be surfaced (Things to Address)"; nothing calls it outside its own tests. A guarantee living in prose, not code (**CR-3 violation**) — the next daniella-class mid-line wall renders silently with no flag, and vigilance already missed it once, which is why the lint exists. → Wire `lintNotes` into `ThingsToAddress` entity mode (or the integrity check feeding it) so a `mid-line-marker` / `leading-separator` hit shows on the record. **Miga would have flagged itself.**

**3. [Truth/Engineering] "an edit can NEVER wipe provenance" (BUILD-QUEUE Q43 inc.1) is stronger than the code.** Recomposition is a client closure over render-time enrichment (`PersonEditor.tsx:41` + `fields.tsx:338`) feeding a blind `PATCH /api/admin/people`. Enrichment appended server-side after Rob's tab loaded — overnight agent runs, exactly his pattern — is wiped by his next notes save. Classic read-modify-write race; `router.refresh` narrows but does not close it. → Move the guarantee to the authoritative layer: PATCH sends `humanNotes`, the API route does `composeNotes(humanNotes, splitNotes(current.notes).enrichment)` against the stored row. Then the queue's NEVER becomes true. Soften the queue wording until it is.

**4. [Engineering] Two shipped writers still cram machine tags mid-line into human notes.** `lib/leads/recycle.ts:60-63` glues `[recycle_candidate YYYY-MM-DD]` with a space onto the last line (fired by `app/api/cron/recycle/route.ts:89`); `lib/csvMapping.ts:168` glues `[import: tag]` the same way. On a person with no enrichment, both land inline in the Notes box — recreating the banned wall Q43 exists to kill — and neither `MARKER` (`lib/notes.ts:25`) nor either lint regex (`lib/notes.ts:86-87`) recognizes them. → Append as a NEW line, add both prefixes to the marker vocabulary, extend `lintNotes` to catch them mid-line. **The Q43 discipline must bind every notes writer, not just the editor.**

**5. [UX] "machine-gathered" badge is false over Rob-confirmed content** — daniella's `ALIAS (Rob-confirmed 2026-07-22)` line renders under that badge on prod because continuation lines attach to the block above (`lib/notes.ts:40-42`, correct behavior). → Soften the badge to "auto-appended" (accurate: the machine wrote it, recording Rob's confirmation), or drop the badge. One word; don't touch the splitter.

**6. [Recording] Queue note drifted:** "13 new tests" — actual is 18 (`notes.test.ts`); the punch-fix increment (fixture correction + `lintNotes`) isn't logged in the Q43 entry. → Update BUILD-QUEUE.md with the current count and an inc.2 line. *(Done this increment.)*

**7. [UX, minor] Mobile single-column renders EnrichmentSection above EstimatePanel** (`page.tsx:125` vs `:129`) — enrichment isn't quite "the very bottom of the record" on the phone. Acceptable for a quick win; fold into Q39's full redesign rather than churning now.

---

## What survives contact with Rob

- **The splitter and its tests.** Deterministic, explicit marker list, real prod fixtures, and a test that pins its own known limitation so it fails loudly if anyone makes it fuzzy. This is what CR-3 discipline looks like.
- **The inline Notes interaction.** Click, type, blur, amber pulse — no modes, no Save button, honest empty state. At the Attio bar.
- **The demotion itself, verified live** — gary and daniella render exactly as Rob asked: his words prominent, the machine's words quiet, collapsed, and labeled at the bottom.

## Path to SHIP

Punch #1 is a data edit (done), #2 and #5 are small, #3–#4 are about half a day. **Fix 1–4 and this re-scores ≥95** — the core design is right; the guarantee just has to live where the data lives.

**Q43 does NOT tick until #2, #3 and #4 are closed and a re-review clears ≥95.**

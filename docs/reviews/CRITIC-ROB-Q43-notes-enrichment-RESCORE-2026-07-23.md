# CRITIC ROB — Q43 Notes/Enrichment Layout Retrofit (RE-SCORE)

**Date:** 2026-07-23 (ET — see PRD date convention) · **Reviewer:** critic-rob agent · **Prior:** REVISE 78/100 (`CRITIC-ROB-Q43-notes-enrichment-2026-07-23.md` — the contract for this pass)

**VERDICT: SHIP · Score 95/100 · zero auto-fails**
**Gates: Fidelity 97 · UX 95 · Truth 98 · Engineering 95 · Recording 95 · Effort 97** (overall = min gate)

The contract said: "fix punches #1–#4 → re-scores ≥95." All four are closed, verified in code and against live prod data — not taken from the queue. **Q43 ticks.**

---

## Independent verification (evidence, not the queue's word)

Every claim was re-proven from scratch; BUILD-QUEUE annotations were treated as claims only.

- **Punch #2 (lintNotes was dead code) — CLOSED, verified.** `lib/integrity/notes.ts` exists (`findNoteShapeIssues` / `noteShapeFlagTitle` / `noteShapeFlagDetail`) and `app/api/cron/integrity/route.ts:78-145` really consumes it: pulls `id,name,notes` for every `people` + `orgs` row, raises **per-record** flags (`entity_id` = the record, unlike the "CRM integrity" pseudo-entity flags), idempotent on (entity_id, title), severity `low`. Cron is scheduled (`vercel.json`: `/api/cron/integrity` daily 07:30 UTC). One finding per (record, code) — a three-marker row is one flag, not three. Correct.
- **Punch #3 ("an edit can NEVER wipe provenance") — CLOSED, verified.** The Notes box sends only the human draft as virtual field `notesHuman` (`PersonEditor.tsx:217`); it is deliberately absent from `FIELD_MAP` (`lib/adminEdit.ts`); `PATCH /api/admin/people` re-reads the stored row and calls pure `applyHumanNotesEdit(stored, draft)` (`route.ts:48-55`, `lib/notes.ts:96-101`). Non-string → 400, no row → 404. **No shadow client path remains:** repo-wide grep finds zero `composeNotes`/`serialize` in client code and zero components sending `field="notes"` (PeopleTable has no notes editor at all). The NEVER claim is now true as written for every UI edit path.
- **Punch #4 (writers cramming tags mid-line) — CLOSED, verified.** `withRecycleTag` (`lib/leads/recycle.ts:64-66`) and `planRealImport` (`lib/csvMapping.ts:171`) both call the one shared pure `appendMachineNote` (`lib/notes.ts:39-47`, always its own blank-line block, empty = no-op). Both prefixes are in `MARKER` (`notes.ts:32`) **and** `MID_LINE_MARKER` (`notes.ts:122-123`), so the splitter files them as enrichment and the nightly lint catches regressions. Recycle cron (`app/api/cron/recycle/route.ts:89`) goes through `withRecycleTag`.
- **Punch #5 (badge wording) — CLOSED, verified.** `EnrichmentSection.tsx:31` renders "auto-appended"; the in-code comment correctly explains why (describes HOW, not authorship). Deploy is transitively proven: the inc.4 race proof exercised the live route (old deploy would have 400'd `notesHuman`), and the badge commit (740f9ec) precedes the proven deploy in history.
- **Punch #1 (miga leading pipe) — HELD.** Live `orgs.miga-food-manufacturing.notes` now opens `Rob 2026-07-17: ownership resolved…`, no separator (read direct from prod Supabase).
- **Punch #7 (mobile column order) — deferral JUDGED LEGITIMATE.** Q39 is the Rob-gated full redesign of these exact record layouts, and its scope (d) READABILITY explicitly requires "enrichment data minimized at BOTTOM of record" — the mobile ordering defect is a direct instance of that DoD, so Q39 cannot close without fixing it. Rebuilding the record-page grid now would be churn Q39 discards — polishing what's about to change is burning Rob's money. Deferral stands.

**Evidence run by this reviewer (2026-07-24 early AM ET):**
- `npx vitest run` → **615/615, 58 files** — matches the queue's count exactly (the earlier "13 vs 18" drift class is gone).
- `npm run build` → green.
- Read-only prod Supabase scan: **22 people + 19 orgs** (matches inc.5's stated universe); **zero** rows carrying `[recycle_candidate` or `[import:` anywhere (matches the no-backlog claim); repo `lintNotes` executed over all 41 live rows → **zero findings** (matches "regression net, not backlog"); `flags` table has zero `Notes:*` flags (consistent).
- gary-waskivich live row: human part empty, exactly **4** ENRICHED blocks, all dated 2026-07-18, no test residue — consistent with the byte-identical restore claimed in the race proof and with the "show all (4)" seen live in the prior review.
- Test coverage of the new surfaces confirmed: `applyHumanNotesEdit` race/clear/no-op/empty (`notes.test.ts:212+`), `appendMachineNote` empty/stacked (`:140+`), writer round-trips (`recycle.test.ts:136-151`, `csvMapping.test.ts`), 8 integrity tests (`lib/integrity/__tests__/notes.test.ts`).
- Bonus verified: `LEADING_SEPARATOR` deliberately excludes `-`/`*` with the gulf-coast bullet rationale pinned in-code (`notes.ts:124-127`) — a watchdog that flags Rob's own bullets is noise; the narrowing was the right call and is documented where it lives.

## Gate movement vs. 78/100

| Gate | Was | Now | Why |
|---|---|---|---|
| Fidelity | 88 | 97 | All contract punches executed as prescribed; nothing dropped; #7 deferral has a real home in Q39's DoD |
| UX | 85 | 95 | Badge honest; miga fixed on prod; interaction floor unchanged (verified live in pass 1); only open item is the legitimately deferred #7 |
| Truth | 80 | 98 | The NEVER claim is now true as written; every queue/PRD number I could check independently matched (615 tests, 22+19 rows, 0 tags, 0 bad shapes, 4 gary blocks) |
| Engineering | 78 | 95 | Guarantee moved to the authoritative layer; lint has a real consumer; one shared machine-write path; race proven on live prod, not asserted |
| Recording | 90 | 95 | PRD 3.1.98–3.1.101 + queue inc.2–inc.5 are accurate and self-correcting (the inc.1 overstatement is annotated in place, not erased — the right way to fix a record) |
| Effort | 92 | 97 | Live-prod race proof with pre-image + byte-identical restore, read-only scans before widening the lint, a false-positive found and narrowed while proving — visible, real work |

## PUNCH LIST (all non-blocking — follow-ups, not gate-breakers)

1. **[Engineering] Delete `notes` from `FIELD_MAP` (`lib/adminEdit.ts:24`).** Zero repo clients send raw `field="notes"` anymore — the entry is an open door: any future client that wires it silently bypasses `applyHumanNotesEdit` and re-creates the exact provenance wipe punch #3 killed. Delete the part (adjust the column list in `adminEdit.test.ts:58`); machine writers that legitimately own whole-notes writes (recycle cron) already go direct to Supabase, not through this route.
2. **[Recording] Uncommitted date-only bump sitting in the working tree** — `docs/plans/PRD-mle-crm.md` "Updated: 2026-07-24" with no content change and no version bump. Commit it with whatever change it belongs to, or revert it. A drifted "Updated" date with no update is exactly the stale-input pattern.
3. **[Recording] Give punch #7 one explicit line in `docs/plans/MASTER-VIEW-2.0-DESIGN.md`** (mobile single-column: EnrichmentSection must land below EstimatePanel). Scope (d) subsumes it, but the deferral currently survives only as a Q43 queue sub-line — deprioritized ≠ dead, so write it where Q39's builder will read it.

## What survives contact with Rob

- **The guarantee finally lives where the data lives.** Server-side recompose against the stored row, proven by a real race on live prod with a byte-identical restore — this is what "verified, not asserted" looks like.
- **One write path, one vocabulary, one watchdog.** Every machine notes-writer goes through `appendMachineNote`; every marker shape is known to both the splitter and the nightly lint; every violation lands as a flag on the record Rob is actually looking at.
- **An honest record.** The queue corrected its own overstatement in place, the test-count drift is gone, and every number in it matched independent re-measurement.

**SHIP. Q43 ticks. The three punches above are hygiene for a future increment, not conditions.**

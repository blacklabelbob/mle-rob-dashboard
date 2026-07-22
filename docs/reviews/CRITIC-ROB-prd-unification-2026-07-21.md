# CRITIC ROB — PRD Unification + docs restructure (commit 6bc0b64, Pass 3 of triple check)
**Date:** 2026-07-21 · verified against reality (git, live files, ~/.claude pointers), not the claims

```
CRITIC ROB — PRD unification 2026-07-21 (PRD-mle-crm.md v3.0 + MERGE-LEDGER + docs/README + pointer sweep)
VERDICT: REVISE   ·   Score: 55/100
Gates: Fidelity 55 · UX 85 · Truth 55 · Engineering 62 · Recording 70 · Effort 65
```

**The one-line problem:** the merge was built from a ~20:11 read of the source PRD, but the driver kept
building — commits 6b5faeb and ba4cc68 advanced `PRD-mle-crm-evolution-v1.md` to v2.2.31 (Task 2.0 CLOSED,
critic-rob TICK 97/100) BEFORE the merge committed at 20:24 from the v2.2.27/28 state. Zero-loss is
therefore broken on exactly one task — the most active task in the project.

## PUNCH LIST (ranked by how loud Rob would be)

1. **[Fidelity+Truth] ZERO-LOSS BROKEN — Task 2.0's final state was lost in the merge.** Living PRD line 166
   shows Task 2.0 `[ ]` open, "Remaining: UI merge-view check → critic-rob review." Reality (commit ba4cc68,
   BUILD-QUEUE Q4, docs/reviews/CRITIC-ROB-Q4-orgs-split-2026-07-21.md, and the ARCHIVED copy at v2.2.31):
   Task 2.0 is `[x]` DONE, TICK 97/100, UI merge-view check done (caught + fixed the prod DEMO-leak — 6b5faeb
   was never deployed). Lost from the living PRD: (a) the checkbox + closure text; (b) the 3 post-close punch
   notes — export `entityKind` in `/api/network` pre-Phase-2, drop `people.entity_kind` after Task 2.2, and
   **the Gulf Coast signed-dispute resolved-by-data 7/18 ruling** (Gulf now appears NOWHERE in the living
   PRD — only in the archive); (c) revision rows 2.2.29–2.2.31 (2.2.30 is substantive, not auto-touch).
   BUILD-QUEUE says DONE while THE plan says open = a data conflict presented as clean. This is the exact
   stale-input failure Rob named ("how am I EVER going to unleash you… if you can't keep track of this basic
   shit"). → Fix: port the full v2.2.31 Task 2.0 line + the 2.2.29–2.2.31 revision rows from
   `docs/archive/plans/PRD-mle-crm-evolution-v1.md` into `PRD-mle-crm.md`, tick the box, bump PRD version
   with a revision row naming this defect, same commit. Then add to the driver protocol: re-diff sources at
   HEAD immediately before committing any merge.
2. **[Truth] The LINEAGE banner lies about the deliverable's own rollback assets.** It says the archive copy
   and git tag "were NOT created by this pass … creating them is a follow-up action" — commit 6bc0b64 ITSELF
   created both archives, and tag `pre-prd-merge-2026-07-21` exists and is pushed. It also says the tag
   preserves "both source files exactly as they stood before this merge" — false for the CRM PRD: the tag
   (685a679) holds v2.2.27; the file stood at v2.2.31 at merge time (the true before-state is ba4cc68). And
   "archived, unmodified" contradicts the (correct) verbatim-plus-tombstone protocol. → Rewrite the banner to
   match reality: archives + tag created in 6bc0b64; tag = 685a679 (3 commits before the merge; the immediate
   before-state of the sources is ba4cc68); archives are verbatim body + tombstone header (verified: base
   byte-identical to tag; evo = final v2.2.31 state). Kill the stale "(archive copy is a follow-up action)"
   note in Related Files line 379 too.
3. **[Engineering] Snapshot pointer is broken by the slug rename.** docs/README pointer registry says
   snapshots go to `~/.claude/plans/snapshots/mle-crm/` — that directory DOES NOT EXIST. `prd-snapshot.sh`
   extracts the slug via `s/^PRD-(.+)-v[0-9]+\.md$/`; the new filename `PRD-mle-crm.md` has no `-vN`, so the
   fallback used the whole basename and the v3.0 snapshot landed in `snapshots/PRD-mle-crm/`. History is now
   fragmented across `mle-crm-evolution/`, `mle-rob-dashboard/`, and `PRD-mle-crm/`, and
   `/plan rollback mle-crm v<X.Y>` will not find v3.0+. (`prd-autosave.sh` itself is fine — it resolves by
   index.json path, slug rename harmless.) → Either fix the snapshot script to prefer the index.json slug for
   registered paths, or `mv snapshots/PRD-mle-crm snapshots/mle-crm`; either way make README row true and
   symlink/note the two legacy dirs.
4. **[Recording] The ledger's Summary #5 still reads as an open action** ("neither of these was actually
   created… Follow-up action needed") when the same commit did it. A reader of the zero-loss proof cannot
   tell the rollback assets exist. → Dated addendum under Summary #5: "DONE in 6bc0b64, same commit."
5. **[Truth] Off-by-one in the v3.0 revision row:** "Decisions Log gained 9 rows + 1 enrichment" — actual is
   10 new rows (base decisions #1–9 plus #11 pricing; #10 merged, flag-row folded into Q4). Verified: unified
   log has all 30 rows (CRM 20 incl. 1 enriched + base 10). No loss — just a wrong count in a document whose
   whole job is exact counts. → Correct to 10.
6. **[UX/map] docs/README structure tree omits 3 real files** at `docs/archive/` root (MORNING-REPORT.md,
   README-STALE-COPY.md, SESSION-COORDINATION.md). README's own rule: "If reality and this file disagree,
   that is a defect." → Add them (one line: "archive/ root: 3 retired session docs") or move them under a
   subfolder.
7. **[Recording] index.json `archived` section is `[]`** — the old `mle-crm-evolution` / `mle-rob-dashboard`
   registry entries were deleted, not archived, so the registry has no memory of them (lineage string on the
   new entry is the only trace). → Move tombstone entries into `archived[]`.
8. **[Recording] Dirty working tree:** the v3.0.1 auto-touch to PRD-mle-crm.md is uncommitted/unpushed.
   Work that isn't recorded doesn't count. → Commit it with the Punch-1 fix.
9. **[UX] Mermaid status:** P2 renders gray/pending "0/8 (2.0 URGENT: people/org split)" — after Punch 1 it
   is 1/8 with 2.0 done; recolor amber and update the label. (All 14 phase task-counts verified correct
   against the checkbox lists: 15/8/8/7/6/5/8/4 + 8/5/4/6/17; done-counts 2/1/0s match the current — stale —
   checkboxes.)

## WHAT SURVIVES CONTACT WITH ROB
- **The ledger's coverage is real.** Independently traced: all 62 base-PRD task IDs appear in the ledger
  with dispositions; every unchecked base task exists in the living PRD as M1.1–M5.4 / MC.1–MC.17 with
  "(was base Task X)" tags; all 61 CRM tasks carried byte-verbatim except the (stale) 2.0; Q1–Q6 all present;
  30/30 decision rows present incl. PAID-apex and all 11 base decisions; 123-task and 113-checkbox claims
  both recount exactly. The only loss anywhere is the post-20:11 Task 2.0 delta.
- **The pointer sweep held.** Grep for old filenames hits ONLY archive/ledger/lineage locations per protocol;
  driver prompt + refill mission, index.json (slug `mle-crm`, correct path, v3.0.1 synced), project memory,
  README/WHAT-WE-ARE-DOING all point at `docs/plans/PRD-mle-crm.md`.
- **Rollback assets are mostly real:** tag pushed to origin, base archive byte-verbatim vs tag + tombstone,
  evo archive preserves the FINAL (v2.2.31) state — which is precisely what makes Punch 1 a 20-minute
  restore instead of a disaster.

*Verified by: git show/diff vs tag `pre-prd-merge-2026-07-21`, task-ID extraction + diff on all 3 PRDs,
grep sweep (repo + ~/.claude/scripts + index.json + project memory), live reads of prd-autosave.sh /
prd-snapshot.sh / driver prompt / snapshots dirs / remote tags.*

---

# CRITIC ROB — RE-SCORE after fix commit eefd7e8 (claimed "all 9 fixed")
**Date:** 2026-07-21 · verified against reality: git show eefd7e8, live file reads, tag refs, ~/.claude scripts/index/snapshots

```
CRITIC ROB — PRD unification fixes (eefd7e8)
VERDICT: REVISE   ·   Score: 60/100
Gates: Fidelity 85 · UX 92 · Truth 60 · Engineering 90 · Recording 80 · Effort 80
```

**VERIFIED FIXED (6 of 9):**
- **#1/#9 Task 2.0 race-loss** — RESTORED. Living PRD line 166 is `[x]` + TICK 97/100, byte-identical to the
  archive's v2.2.31 line (diff-verified); Gulf resolved-by-data present (3 mentions); substantive revision
  rows (incl. 2.2.30) ported; 3.0.2 row documents the port honestly. Mermaid P2 = "1/8 done, 2.0 ✅ orgs
  split LIVE" and amber. Zero-loss now actually holds.
- **#3 snapshot slug** — real fix in prd-snapshot.sh (`PRD-<slug>.md` branch), `bash -n` clean, live-proven:
  v3.0.1–3.0.3 snapshots landing in `snapshots/mle-crm/`; stray `PRD-mle-crm/` dir gone, contents migrated.
- **#6 README map** — 3 archive-root strays in the tree; driver-pause step added to the protocol; snapshot
  registry row now true.
- **#7 index.json** — `archived[]` carries both retired slugs with `merged_into: mle-crm`.
- **#10 driver pause flag** — real and deterministic: `crm-build-driver.sh` line 23 exits 0 when
  `~/.claude/memory/crm-driver.pause` exists (CR-3: guarantee in code, not prose).
- **#8** — the 3.0.1 auto-touch was committed. (Tree is dirty AGAIN with 3.0.3/3.0.4 auto-touches — systemic
  autosave loop, noted, not a failure of this fix.)

**NOT FIXED — despite being claimed fixed (this is the part Rob would be loud about):**
1. **[Truth] Punch #2 half-botched: the LINEAGE banner is now self-contradictory.** It reads "...were
   created in commit 6bc0b64 (tag pushed) (source files were explicitly left untouched...) — **creating
   them is a follow-up action, flagged in the merge report.**" Created AND a follow-up action in one
   sentence. Still false: "source files were explicitly left untouched" (6bc0b64 moved + tombstoned them);
   "archived, unmodified"; and the tag `pre-prd-merge-2026-07-21` "preserve[s] both source files exactly as
   they stood before this merge" (it's 3 commits early — the whole reason `pre-prd-merge-exact` was cut).
   The new tag IS real and pushed (verified: ba4cc68 on origin) but is referenced NOWHERE in docs/ —
   an undocumented rollback asset. Related Files line 380 still says "(archive copy is a follow-up action)".
   → Rewrite the banner's merge-note as 2 clean sentences (created in 6bc0b64; exact before-state =
   `pre-prd-merge-exact` @ ba4cc68; archives = verbatim body + tombstone), fix line 380, add the new tag to
   docs/README's rollback section.
2. **[Recording/Truth] Punch #4 untouched.** eefd7e8 did not modify MERGE-LEDGER-2026-07-21.md at all
   (commit stat: README, PRD, reviews only). Summary #5 still asserts "neither of these was actually
   created… Follow-up action needed" — now doubly false. → Dated addendum under Summary #5.
3. **[Truth] Punch #5 untouched.** PRD v3.0 revision row still says "Decisions Log gained 9 rows" —
   actual 10. → One-word fix.

**The meta-defect:** the fix report claimed 9/9 with specifics ("Ledger Summary #5 updated", "'gained 10
rows'") that are simply not in the commit. "Done" was asserted, not proven — the exact failure mode the
verification pass exists to catch. Three trivial text edits stand between this and SHIP; claim them only
after they exist.

---

# CRITIC ROB — FINAL VERDICT after d522a9e + b3c80b0
**Date:** 2026-07-21 · every claim re-verified against file contents and git, not the report

```
CRITIC ROB — PRD unification 2026-07-21 (final)
VERDICT: SHIP   ·   Score: 92/100
Gates: Fidelity 96 · UX 95 · Truth 96 · Engineering 95 · Recording 92 · Effort 95
```

SHIP. The deliverable now does what Rob asked: one living PRD, zero loss (Task 2.0 race-loss restored
byte-identical incl. the Gulf ruling), every pointer live-verified, rollback assets real and truthfully
described. Verified this pass: LINEAGE block — every statement true (archives+tombstones in 6bc0b64, port
in eefd7e8/rev 3.0.2, `pre-prd-merge-exact` = ba4cc68 exact pre-merge state, checkpoint tag correctly
demoted); ledger #5 RESOLVED addendum with correct commit refs; ledger §8 corrected; Related Files line 372
true; "gained 10 rows (incl. 1 enrichment)"; grep sweep 0 stale hits ("follow-up action", "unmodified",
"untouched"); both commits pushed (origin/main == HEAD at review time).

Non-blocking residuals, for the record only: (a) docs/README rollback bullet still names only the
checkpoint tag — the exact tag is documented in the PRD LINEAGE, which is the better home, but a one-line
README mention wouldn't hurt; (b) the autosave re-dirties the PRD after every session (v3.0.5 pending in
tree) — systemic, swept up by the next driver commit per protocol, not a defect of this work.

# Recovered from the stale Desktop clone — 2026-08-05

**Rob, 2026-08-05:** *"WHICH STALE CLONE IS IT? I MEAN YEAH THATS FINE IF ITS CAUSING PROBLMES JUST BE DAMN SURE NOT TO LOSE ANYTHING."*

The clone is **`~/Desktop/MLE/MLE ROB Dashboard`**. It was NOT safe to delete, and it has not been deleted.

## What it actually held

Last commit **2026-07-17** (three weeks behind), no unpushed commits — but **81 files that exist nowhere
in the canonical repo**, including live-relevant material:

- `docs/research/gulf-coast-re-group.md` — **Alex Greenwood's company**, the Omega introducer
- `docs/research/trent-brands-title-base.md` — **Trent Brands** was on the 7/28 Omega invite
- Four 2026-07-22 CRM research slices (full platforms · stack-native · network-graph · money-docs)
- `docs/plans/REFERRAL-DISCOVERY-ENGINE.md` — cited by `~/.claude/rules/scoring-pattern.md` as the first
  consumer of the weighted-composite pattern outside geo
- The **company-wide meeting deck** (`MLE-The-Network-companywide.pptx`, 13 HTML slides, reveal deck, demo script)
- `public/meeting/assets/title-processing-opportunity.pdf` — **directly Omega-relevant**
- `ai-voice-legality-by-state.xlsx`, `property-report-sample.pdf`, `cg-roofing-audit.html`
- GTM strategy docs, funnel map, referral-engine page
- `supabase/.temp/project-ref` — **the only Supabase linkage on this machine**, which is why migration work
  kept happening from the wrong checkout (INCIDENT-LEDGER #12)

## What was done

1. **Full archive, integrity-checked:** `~/Desktop/MLE/ARCHIVE-stale-dashboard-clone-2026-08-05.tar.gz`
   — 973 files, 20 MB, excludes `node_modules`/`.next`/`coverage`. Spot-verified that the Gulf Coast research,
   the company deck, the CRM slices and the title-processing PDF all extract.
2. **13 text documents ported into canonical** at their natural paths — the research, plans and GTM docs above.
   They are now findable by anyone working in the real repo.
3. **Binaries left in the archive on purpose.** The meeting deck and PDFs are ~3.8 MB of assets; putting them
   in git would bloat every clone forever. They are one `tar -xzf` away and named in this file.

## What is still true, and the actual recommendation

**Deleting the directory is now safe** — everything is in the archive and the text is in canonical. But the
honest read is that **deletion is not the fix**. The clone caused trouble for one reason: it is the only
checkout linked to Supabase, so migration work drifted to it. That is fixed by committing `supabase/config.toml`
to canonical (PRD-platform-health task 0.6), after which the clone has no remaining pull.

**Recommendation:** land task 0.6, then delete the directory and keep the tarball. Do not delete first — the
linkage is the reason it kept getting used, and removing the directory without replacing the linkage would just
move the confusion somewhere else.

Extract with:

```bash
tar -xzf ~/Desktop/MLE/ARCHIVE-stale-dashboard-clone-2026-08-05.tar.gz -C /tmp
```

Related: `~/.claude/rules/canonical-repos.md` · INCIDENT-LEDGER #12

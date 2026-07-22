# docs/ — Structure, Pointers, and the Update Protocol
**Established:** 2026-07-21 (Rob directive: "get the structure down into a super understandable way… must be DEAD on") · This file is the map. If reality and this file disagree, that is a defect — fix one of them in the same commit.

## The structure (what lives where, and why)

```
docs/
├── README.md                ← THIS FILE — the map + update protocol
├── plans/                   ← THE plan. One living PRD, nothing else active.
│   ├── PRD-mle-crm.md       ← ★ THE single living PRD (v3.0+, unified 2026-07-21)
│   ├── MERGE-LEDGER-2026-07-21.md  ← zero-loss proof of the 7/21 unification (123 tasks dispositioned)
│   └── sources/             ← documents that SEED the plan — referenced, never "worked"
│       ├── ROB-CRM-VISION-DUMP-2026-07-17.md   (Rob's verbatim vision — source of truth for intent)
│       ├── DATA-MODEL-crm-erd-2026-07-17.md    (target schema, D-002 ERD)
│       └── STORAGE-DECISION.md                 (why Supabase, 7/4 decision record)
├── research/                ← evidence with source URLs (scorecards, audits, scouting)
├── reviews/                 ← Critic Rob verdicts — the quality record
├── agents/                  ← CRITIC-ROB-CORPUS.md (calibration data for the evaluator agent)
├── training/                ← product content shown IN the app (phase-one explainer)
├── backups/                 ← dated pre-mutation JSON dumps of Supabase tables
├── assets/                  ← screenshots/images
└── archive/                 ← retired, tombstoned, never edited
    ├── MORNING-REPORT.md / README-STALE-COPY.md / SESSION-COORDINATION.md  (7/4 strays)
    ├── plans/               (the two pre-merge PRDs, tombstone headers point forward)
    └── sync/                (7/4 sync experiment, superseded by ~/.claude/plans registry)
```

**Repo root:** `BUILD-QUEUE.md` (the 10-min driver's working list — always DERIVED from the PRD, never a second plan) · `CHANGELOG.md` (append-only, dated) · `README.md` / `WHAT-WE-ARE-DOING.md` / `CLAUDE.md`/`AGENTS.md`.

## Pointer registry (everything that references these files)

| Pointer | Lives in | Points to |
|---|---|---|
| Driver mission prompt | `~/.claude/scripts/crm-build-driver-prompt.txt` | `docs/plans/PRD-mle-crm.md`, `BUILD-QUEUE.md` |
| Driver script (refill mission) | `~/.claude/scripts/crm-build-driver.sh` | same |
| Global PRD registry | `~/.claude/plans/index.json` | slug `mle-crm` → the PRD path |
| PRD autosave/snapshot hooks | `~/.claude/scripts/prd-{autosave,realtime,snapshot}.sh` | read index.json → snapshot to `~/.claude/plans/snapshots/mle-crm/` |
| Project memory | `~/.claude/projects/…MyLocalEverything/memory/mle-supabase-system-of-record.md` | PRD path |
| Critic Rob agent | `~/.claude/agents/critic-rob.md` | `docs/agents/CRITIC-ROB-CORPUS.md` |
| Code comments | `lib/storage/*.ts`, `components/EstimatePanel.tsx` | `docs/plans/sources/STORAGE-DECISION.md`, PRD |
| Repo docs | `README.md`, `WHAT-WE-ARE-DOING.md`, `BUILD-QUEUE.md` | PRD path |

**Rule: move or rename ANY file above → update every row of this table that touches it, in the SAME commit, then run the Verification Sweep below.**

## The update protocol (what gets checked, every time)

1. **Before structural changes:** `git tag` a rollback point + run `~/.claude/scripts/prd-snapshot.sh <prd>` for any PRD being touched. Inventory references first: `grep -rn "<filename>" . ~/.claude/scripts ~/.claude/plans/index.json ~/.claude/projects/*/memory/ --include="*"` (exclude node_modules).
2. **Pause the driver first for structural PRD/docs ops:** `touch ~/.claude/memory/crm-driver.pause` (remove after) — prevents the 7/21 race where the driver advanced the PRD mid-merge.
3. **Make the change** — moves via `git mv` (history preserved); retired files get a tombstone header pointing to their successor; archives are never edited afterward.
4. **Verification Sweep (the triple check):**
   - **Pass 1 — grep:** old names/paths must appear ONLY in `docs/archive/`, snapshots, `CHANGELOG.md`, the merge ledger, and explicit lineage/revision-history lines (PRD LINEAGE banner, index.json `lineage` field). Anywhere else = unfinished pointer.
   - **Pass 2 — functional:** `npm run build` + `npx vitest run` green; `bash -n` on any touched shell script **plus one live end-to-end run** (the 7/18–7/21 driver outage was caused by an edit that was never run live — never again).
   - **Pass 3 — independent:** Critic Rob (or QE) verifies claims against reality, not against the report.
5. **Record:** CHANGELOG entry + PRD revision row (if plan-affecting) + commit + push. Work that isn't recorded doesn't count.

## Rollback (how we get anything back)

- **Git:** every change is a pushed commit; structural milestones carry tags (`pre-prd-merge-exact` = the exact 7/21 pre-merge state; `pre-prd-merge-2026-07-21` = earlier checkpoint). `git checkout <tag> -- <path>` restores any file; the private GitHub repo is the offsite copy.
- **PRD snapshots:** every version bump auto-snapshots to `~/.claude/plans/snapshots/{slug}/` BEFORE mutation (last 50 kept). `/plan rollback mle-crm v<X.Y>` restores one.
- **Archives:** pre-merge PRDs live verbatim (plus tombstone) in `docs/archive/plans/`; the MERGE-LEDGER maps every old task ID to its new home, so anything can be traced in either direction.
- **Data:** `docs/backups/*.json` are dated pre-mutation Supabase dumps; the Supabase project itself has PITR on the roadmap (Mission Control phase).

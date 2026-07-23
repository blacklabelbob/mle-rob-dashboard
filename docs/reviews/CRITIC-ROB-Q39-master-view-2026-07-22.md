# Critic-Rob Review — Q39 Master View 2.0 Design Doc (rev 2 → rev 3)
**Date:** 2026-07-22 · **Artifact:** `docs/plans/MASTER-VIEW-2.0-DESIGN.md` · **Reviewer:** critic-rob agent (a19417c2472e16164)

## Rev 2 verdict
**SCORE: 94/100 — ITERATE** · **AUTO-FAILS: none**

Verification performed by the reviewer:
- All 4 external citations checked verbatim against live sources (Pipedrive quote ✓, Attio lilac-cells/sparkle-icon ✓, Folk "2 types of contacts" ✓, demo grammar at mylocaleverything.com/app?demo=1 ✓)
- All internal code claims verified (`PersonEditor` + "business" pill, `lib/labels.ts`, `scripts/backfill-org-links.mjs`, `RepAccountListItem`, n8n-email webhook route, `PHASE-SIGNAL-WEBHOOK-CONTRACT.md`)
- Both 7.22.26 dumps cross-checked line by line; Q39–Q44 queue alignment confirmed; all 6 rev-1 punch items verified applied
- Rev-1 (88) punch list: fully applied ✓

## Rev 2 punch list → disposition (applied same session, rev 3)
1. **[Engineering] §8 increment 8c wrongly gated on OQ-3 (pricing).** FIXED: 8c now `A (states) / R (OQ-6 slot content)`; new OQ-6 added (who defines the Top Automations slot list). Visual states no longer wait on Rob.
2. **[Truth] §6 "seeded rows already in data" unprovable from repo.** VERIFIED + FIXED: driver curled prod Supabase 2026-07-22 — `spinoff-homeclonevault` (orgs), `deal-gulf-coast-equity-phase4` (deals), both signoff tasks (tasks) all exist. §6 now states they live in prod Supabase, not the repo, and that increment 10's DoD re-proves rendering.
3. **[Fidelity] §2b no rule for solopreneur (person IS the client).** FIXED: solopreneur rule added — Client never lands on a person; company shell auto-created on signing (person = Owner); folded into OQ-2 for Rob's edit.
4. **[UX, non-blocking] Approval artifact is 291 lines of markdown vs Rob's "visual outputs only" law.** NOT YET DONE — next Q39 increment: one-page visual companion (company page vs person page side-by-side + tracker card) to attach to the approval ask.

## What Rob will love / hate (reviewer's words)
- **Love:** decision-first skim structure; every rule traced to his verbatim words; tracker spec matches his demo's exact grammar (LIVE / NEXT UP / THE DEEP END, verified live).
- **Hate:** being asked to sign off on a markdown wall with no side-by-side visual — hence punch #4 is the next increment before the approval ask goes out.

## Status
Rev 3 addresses punch 1–3 in the same commit as this review. Punch #4 (visual companion) is the remaining pre-approval increment. Doc then goes to Rob for sign-off (Q39 DoD). SHIP threshold (≥95) expected on re-score after #4; no auto-fails outstanding.

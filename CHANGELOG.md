# Changelog — MLE ROB Dashboard

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Auto-initialized by changelog-guard hook.

## [Unreleased]

### Added
- 2026-07-04 — Fix pass after QE 77/100 (commit 0adc7f4): real no-stall storage fallback (reads fall back to file store, verified with STORAGE_SOURCE=sheets); estimate persistence with honest saved/not-saved UI state; loud-fail write guard for read-only deploys; pointer-events + pinch-zoom graph (mobile works); probability/estNewNodes/nodeType in graph payload + click panel; nodeType on Person (ledger Type column, detail badge, seeded 12/12); Polk seed estimate regenerated from the actual heuristic ($75k/9/60%); Daily-priorities + Events honest stub cards; Est. Network Value directional caveat; malformed JSON → 400; PRD checked off through 0.9 + 4.1. QE iteration 2: 91/100 READY TO SHIP.
- 2026-07-04 — Deployed to Vercel production: https://mle-rob-dashboard.vercel.app behind HTTP Basic Auth (user rob, password in .env.local; DASHBOARD_PASSWORD env on Vercel). middleware.ts renamed to proxy.ts per Next 16 deprecation.
- Project changelog initialized on 2026-07-04.
- 2026-07-04 — Phase 0 overnight build (v0.1.0): Next.js 16 scaffold (App Router, TS, Tailwind 4); core data model (`lib/types.ts`); StorageAdapter + JSON file store with Sheets/Airtable/Supabase stubs; seed network (Polk chain, verticals, projects); pages — Overview, People ledger, Network graph, Projects board, Training corner; AI estimator (heuristic + Claude-gated `/api/estimate`); `docs/STORAGE-DECISION.md`.


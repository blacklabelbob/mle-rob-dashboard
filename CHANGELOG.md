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


## 2026-07-17 — Supabase fully live (base-PRD Tasks 1.2 + 1.3 ✅)
- Recovered Rob's Supabase access token from a prior Dashboard-session transcript → stored in ~/.claude/.env.
- Discovered existing project `mle-network` (fjebwaxgoxixwxmxmfxr, created 7/8) already migrated + seeded: 54 people, 65 edges, 7 verticals, 12 projects. Production was already serving it; local .env.local was the only missing piece — now wired (STORAGE_SOURCE=supabase).
- Verified end-to-end: local dev renders Supabase-only record ("George … Guest Genie"); prod smoke test green; file-store fallback intact.
- Cleaned up: accidental duplicate project created+deleted same minute. Old mission-control Supabase (xnbhfplcthrkjycvlwip) confirmed DELETED — flagged, its app env is stale.

## 2026-07-17 — Dev-chat widget LIVE + Architecture Atlas shipped
- **Dev chat (Tier 2)**: `components/DevChat.tsx` + `/api/dev-chat` + Supabase `dev_chat` table. "Talk to Max" button bottom-right, gated by NEXT_PUBLIC_DEV_CHAT=1 (local + Vercel prod). Round-trip verified local AND production; Max-side watcher polls for new messages. Invisible in demos once the env flag is removed.
- **Architecture Atlas** published (claude.ai artifact 5e195f4f): 12 sheets — C4 context/containers, integration map, stack + 7 GAPs, current/target ERDs (people-vs-org split = Task 2.0 URGENT), migration path, RLS matrix, lead lifecycle, 30-beat in-call sequence, role matrix, day-in-the-life, roadmap. Adversarially QE'd (81 → fixes applied: task count 61, 21 relationships, mermaid theme locks, Q3 flag on auto-close, glossary, 3-act sequence).

## 2026-07-17 — Network page filters (Rob's first dev-chat request 🎉)
- Cluster toggles: click legend entry to hide a vertical, "only" to solo it, "show all" to reset.
- Person focus: search box + "focus connections" button → shows just that person + direct connections, centered.
- $ readout (bottom-left): visible node count, est. potential, quoted total; selected+connections subtotal on click.
- Requested by Rob via the new in-dashboard dev-chat widget; built + deployed same session.

## 2026-07-17 — Data cleanup + admin Edit Mode (Rob's dev-chat batch #2)
- DELETED 16 seeded junk rows (TARGET: rep-sourcing profiles + "Rob's network (brain-dump)" seeds incl. 10 DFW roofers) + their edges. Exact-label match only — verified real contacts (e.g. Jonathan Burns) preserved. Full pre-delete backup: docs/backups/*-2026-07-17.json. 54→38 people, 65→54 edges.
- Taxonomy per Rob: Rob+Will → mle-admin; 11 unsigned clients → lead-selfgen; node_type constraint expanded (+mle-admin, lead-selfgen, lead-mle).
- People page: Edit Mode — inline cell editing (name/quoted/phone/email), status/type/vertical dropdowns, multi-select delete (cleans edges + referral pointers), add-vertical. All writes via /api/admin/* → universal propagation via shared store.
- Open w/ Rob: Gary's vertical, who keeps "partner" (George/Kelly/Dix).

## 2026-07-17 — Taxonomy cleanup round 2 (Rob's dev-chat batch #3)
- Kelly (CFO, CG Roofing) deleted as row; context folded into cg-roofing-group notes. Standing rule: ledger = KDMs + sales-related; admins/bookkeepers = notes on the lead.
- Gary + George → lead-selfgen; Dix sole partner. phone-attacker/social-butterfly REMOVED from constraint (relics of Rob's 7/4 sales-team archetypes); David Cates → rep-candidate.
- lib/labels.ts: human labels everywhere ("Self-Gen Lead" etc.) — DB keeps slugs, UI speaks sales.

## 2026-07-17 — Relationship simplification (Rob dev-chat batch #4)
- "Type" column renamed → "Relationship" (it holds what a record is TO MLE).
- lead-selfgen/lead-mle collapsed → single 'lead' (13 rows); self-gen vs MLE-gen becomes a Lead Source field landing with Task 1.15 source-context (current leads default self-gen per Rob).

## 2026-07-17 — Full record editing + Core Team fix + On Time Moving (Rob dev-chat batch #5)
- PersonEditor: every field on /people/[id] editable (incl. all 6 key dates, referred-by dropdown, notes/description). FIELD_MAP extended to full column set.
- Core Team vertical = Rob + Will ONLY. Gary/Giovanni/Miga → Food & Beverage (De Cecco cluster found), moving co → new Home Services vertical, George → Web Developers (flagged best-guess).
- Moving co = On Time Moving and Storage (Joseph Green, Caleb's brother): $7k quoted + $600/mo, referred_by=caleb-green, website set.
- Naples $5k provenance answered: signed 7/01 per 7/8 data load (Polk/Monica), NOT paid — page shows Paid: pending.

## 2026-07-17 — Inline click-to-edit everywhere (Rob's UX directive: "Apple, not MS-DOS")
- New inline field kit (components/inline/fields.tsx): click → edit in place → autosave on blur/Enter, Esc cancels, optimistic UI + amber save pulse / red error pulse. No edit modes, no Save buttons — Attio/Linear standard, now the permanent bar (memory: rob-ux-bar-apple-not-msdos).
- PeopleTable rebuilt: every cell live (name/quoted/phone/email/days inline text; status/relationship/vertical native-select overlays styled invisible-until-hover; signed = click toggle). Hover-reveal row checkboxes + contextual selection bar (N selected · Delete). "+ New vertical…" inside the vertical menu. Door-column notes clamped to 2 lines w/ hover tooltip.
- Person record page: fully inline (all fields + referred-by dropdown + key-date chips w/ native pickers + click-to-edit notes/description). PersonEditor form-with-Save deleted.
- Verified via Playwright before deploy: 7/7 interaction tests (save round trip, persistence, Esc, pickers) + screenshot review; fixed door-column flooding + signed-date wrap found in review.

## 2026-07-17 — Critic Rob round 2 (55→75→SHIP-track): truth on every surface
- Punch 1-5,8,9: signed value $15k truthful (+$19k disputed amber), data-level deal dedup, Paid column + green Client tier + paid→client auto-upgrade in code, Days→$ metric deleted, key-dates backfill, Will items red w/ days-late, repo strays archived.
- Re-score NEW items: graph detail panel now renders PAID (green) / ⚠ disputed (amber) / signed+date — the missed 3rd surface; migration 0002_node_type_taxonomy.sql keeps rebuilds truthful; estTimeToPaymentDays fully removed (types/adapter/API); Caleb row carries the deal-moved data note; PRD autosave spam collapsed.
- Item 10 closed: vitest wired, lib/__tests__/stats.test.ts — 8 tests incl. an exact reproduction of the $44k double-count case. `npm test` green.

# PRD: MLE ROB Dashboard — The Network

**Version:** 2.0.4 | **Created:** 2026-07-04 | **Updated:** 2026-07-04
**Status:** ACTIVE
**Owner:** Rob + Max
**Project:** mle-rob-dashboard
**Type:** full
**Slug:** mle-rob-dashboard

> Plain-English companion: [`WHAT-WE-ARE-DOING.md`](../../WHAT-WE-ARE-DOING.md) — read that first.
> v1.0 (mission-control-over-contracts framing) is snapshotted at `~/.claude/plans/snapshots/mle-rob-dashboard/`. Rob's 2026-07-04 directive re-centered everything on **The Network**.

---

## Status Diagram

```mermaid
flowchart LR
    P0["Phase 0: Overnight Build<br/>9/10 done"] --> P1["Phase 1: Storage & Real Data<br/>0/6 done"]
    P1 --> P2["Phase 2: Network Intelligence<br/>0/6 done (2.5 research in)"]
    P1 --> P3["Phase 3: Meeting→Money Flow<br/>0/5 done"]
    P2 --> P4["Phase 4: Team & Training<br/>1/5 done"]
    P3 --> P5["Phase 5: Cadence & Automation<br/>0/6 done"]
    P4 --> P6["Phase 6: Growth Tooling<br/>0/5 done"]
    P5 --> P6

    style P0 fill:#f59e0b,color:#000
    style P1 fill:#6b7280,color:#fff
    style P2 fill:#6b7280,color:#fff
    style P3 fill:#6b7280,color:#fff
    style P4 fill:#f59e0b,color:#000
    style P5 fill:#6b7280,color:#fff
    style P6 fill:#6b7280,color:#fff
```

**Color key:** `#22c55e` complete · `#f59e0b` in-progress · `#6b7280` pending · `#ef4444` blocked

---

## Goal

One Vercel dashboard where Rob sees and grows The Network — every person as a node with AI-estimated revenue + door-opening potential, every project with its completion/category/theme, and a friction-free meeting → agreement → invoice flow — so the business expands as fast as possible without losing its core values.

## Scope

**IN:**
- **The Network graph**: zoomable, globe-like node/cluster visualization — people + verticals as nodes (lit/unlit), referral relationships as edges, node size = estimated contribution
- **People ledger**: line-item table with Rob's full field set (optimized order), manual entry first, automation later
- **Projects board** with completion %, category, core theme (sign the agreement / get paid fast / reduce all friction — all remote revenue generation); product builds (AIDRE, AIVA, etc.) in a linked section with Will-reminders
- **AI contribution estimator**: from a free-text description → est. aggregate revenue, est. new nodes, probability, reasoning; connection suggestions Rob doesn't see
- **Meeting→Money**: low-friction meeting notes → scoped agreement → invoice out (integrates the onboarding + invoicing PRD systems; this dashboard is the visible surface)
- **Training corner**: Phase One explainer, coaching materials, later a rep-facing chat box
- **Storage behind an adapter** — file/Sheets/Airtable/Supabase swappable; losing access to any one tool NEVER stalls work
- Daily prioritization → tasks; reminders (incl. Will's action items); upcoming events

**OUT:**
- Lost-reason taxonomies, stage-probability committees, heavy CRM ceremony (explicitly deprioritized by Rob 2026-07-04 — "we'll get there")
- GoHighLevel in any form; Close CRM as a destination (STG read-only legacy only)
- Outside investment tracking (we don't take outside money — door-openers can earn a cut)
- Client-facing views

## Success Criteria

- Rob opens one URL: network graph zooms/clusters, people ledger scans line-by-line with all his fields, projects show completion/category/theme, AI estimates render per person
- Adding a person takes < 60 seconds of typing and immediately appears as a node
- The AI estimator produces revenue/node/probability estimates for the Jonathan Polk test case that Rob judges directionally right
- Storage swap test: switching the adapter source loses zero UI functionality
- PRD checkboxes and revision history current within 24h of any work (living doc)

---

## Phases + Tasks

### Phase 0: Overnight Build (2026-07-04, Max solo, full authority)

- [x] Task 0.1 [Engineering] - Write plain-English WHAT-WE-ARE-DOING.md | DoD: File at project root explains the play + the build in plain English
- [x] Task 0.2 [Engineering] - Scaffold Next.js (App Router, TS, Tailwind) + git init with organized file structure | DoD: `npm run build` passes; structure documented in README
- [x] Task 0.3 [Engineering] - Data model: Person/Node, Edge (referredBy + relationship), Project (category, theme, completion), Vertical, Estimate types | DoD: `lib/types.ts` compiles; every Rob-specified field present
- [x] Task 0.4 [Engineering] - StorageAdapter interface + JSON file store (day-1 source) with Sheets/Airtable/Supabase stubs | DoD: All reads go through the adapter; swapping source = 1 line
- [x] Task 0.5 [Engineering] - Seed data: Jonathan Polk → Naples Spine & Joint → PropLogic/LandTech/Qualia chain, Will's big-network contacts placeholder, roofing + payment-processing + medical verticals, real project list (this dashboard, meeting→money, AIDRE, AIVA, RankLens, PropEstimate) | DoD: Seed renders on every page; Polk chain visible in graph
- [x] Task 0.6 [Engineering] - People ledger page: Rob's fields in optimized order, sortable, status badges | DoD: All 14+ fields render; sortable by key dates/quoted/signed
- [x] Task 0.7 [Engineering] - Network graph page: force-directed, zoom/pan, lit/unlit nodes, size = est. contribution, cluster coloring by vertical, click → detail | DoD: Polk chain zoomable; clicking node shows person panel
- [x] Task 0.8 [Engineering] - Overview + Projects pages: aggregates (pipeline $, signed, network size, est. network value), projects with completion/category/theme, Products section (AIDRE/AIVA link-outs) + Will reminders | DoD: Every project shows all three attributes; Will items flagged
- [x] Task 0.9 [Engineering] - AI estimator v1: heuristic scorer + `/api/estimate` route (Claude-powered, key-gated) + estimate display on person detail | DoD: Polk description produces revenue/nodes/probability/reasoning
- [ ] Task 0.10 [Engineering] - Evaluate → iterate → verify build; deploy to Vercel if authenticated, else local + screenshots; morning report | DoD: quality-evaluator ≥90 on Rob's spoken spec; report delivered

### Phase 1: Storage & Real Data

- [ ] Task 1.1 [Rob] - GATE: 10-second yes/no on storage recommendation (see `docs/STORAGE-DECISION.md`) | DoD: Decision logged in Decisions Log
- [ ] Task 1.2 [Engineering] - Implement chosen store adapter + migrate seed → real data | DoD: Dashboard reads live store; file store remains as fallback
- [ ] Task 1.3 [Rob] - Brain-dump first ~25 real people (voice or text, any format — Max structures them) | DoD: 25 people in ledger with vertical + referred-by where known
- [ ] Task 1.4 [Engineering] - Add-person form (<60s entry) + inline edit | DoD: New person → node appears without redeploy
- [ ] Task 1.5 [Engineering] - Import roofing lists + lead-magnet assets inventory as network seed clusters | DoD: Roofing cluster populated from existing STG-era domain data (data, not branding)
- [ ] Task 1.6 [Operations] - Nightly backup of store to file (no-stall guarantee) | DoD: Simulated store outage → dashboard serves from last backup

### Phase 2: Network Intelligence

- [ ] Task 2.1 [Engineering] - Claude-powered estimator on live data (replace heuristic): revenue, new nodes, probability, reasoning | DoD: Estimates cached per person; re-run on description change
- [ ] Task 2.2 [Engineering] - Connection suggester: AI scans ledger for non-obvious links (shared verticals, employers, geographies) | DoD: ≥1 suggested connection Rob didn't enter, shown as dashed edge
- [ ] Task 2.3 [Engineering] - Success-rate vs probability overlay (predicted vs actual as deals close) | DoD: Graph toggle shows both per node
- [ ] Task 2.4 [Sales] - Node-activation playbook per node type (connector / phone-attacker / social butterfly / vertical anchor) | DoD: Each type has a 3-step activation play visible on person detail
- [ ] Task 2.5 [Research] - Vertical-anchor scan: payment processing first — displaced payment-processing salespeople w/ deep local books (LinkedIn) | DoD: 10 candidates with source URLs, loaded as unlit nodes (research doc DONE 2026-07-04 → docs/research/payment-processing-candidates.md; node loading pending)
- [ ] Task 2.6 [Engineering] - Cluster analytics: per-vertical aggregate est. revenue + activation % | DoD: Zoom-out view shows per-cluster rollups

### Phase 3: Meeting→Money Flow

- [ ] Task 3.1 [Engineering] - Low-friction meeting notes capture (Fathom link or paste) attached to person record | DoD: Paste/link → transcript + video links populate ledger fields
- [ ] Task 3.2 [Engineering] - Notes → scope extraction → agreement fields (reuse onboarding PRD's extraction pipeline) | DoD: Test transcript → scoped agreement draft with fields filled
- [ ] Task 3.3 [Engineering] - Signature → invoice-out trigger (reuse invoicing PRD engine) | DoD: Signed test agreement → invoice generated within 5 min
- [ ] Task 3.4 [Engineering] - Time-to-payment tracking per person (est. vs actual) on ledger + overview | DoD: Both values render; overdue turns red
- [ ] Task 3.5 [Operations] - Key-dates timeline per person (met → quoted → signed → invoiced → paid → phase-one complete) | DoD: Timeline renders for any person with ≥2 dates

### Phase 4: Team & Training

- [x] Task 4.1 [Marketing] - Phase One explainer (what it is, what it costs, what client gets) as training page + short video script | DoD: A new rep can answer "what's Phase One" from the page alone
- [ ] Task 4.2 [Engineering] - Rep chat box (Claude-backed, grounded in training corpus) | DoD: "What is phase one?" answered correctly from corpus, not vibes
- [ ] Task 4.3 [Rob] - Record/approve coaching materials descriptions (Max structures into corpus) | DoD: ≥3 coaching entries live in training corner
- [ ] Task 4.4 [Sales] - Rep onboarding path: day 1 → first call script → first deal | DoD: Checklist page a new rep can self-serve
- [ ] Task 4.5 [Engineering] - Collateral shelf incl. items needed FROM Will (data, collateral) with reminder flags | DoD: Will-owed items generate reminders (Phase 5 wiring)

### Phase 5: Cadence & Automation

- [ ] Task 5.1 [Engineering] - Daily priorities panel: AI ranks today's actions (nodes to light, follow-ups, Will nudges) | DoD: Opens with ≥3 ranked actions each morning with reasons
- [ ] Task 5.2 [Operations] - Reminders engine: Will's action items + Rob follow-ups (n8n or cron) | DoD: Overdue Will item pings within 24h of due
- [ ] Task 5.3 [Operations] - Scheduling hooks: autonomous runs (estimator refresh, connection scan, daily digest) | DoD: All three run unattended on schedule; failures alert
- [ ] Task 5.4 [Engineering] - Events section: upcoming events as network opportunities (who's there, which nodes) | DoD: Event with linked people renders on overview
- [ ] Task 5.5 [Operations] - PRD autosave verification for this project path | DoD: Session-end hook updates checkboxes in THIS file
- [ ] Task 5.6 [Operations] - Update-reminders for the Products section (AIDRE/AIVA status staleness) | DoD: Product untouched >7 days flags on overview

### Phase 6: Growth Tooling

- [ ] Task 6.1 [Research] - Scraper/search pipeline for target groups (e.g., web developers) — names, roles, contact where permissible | DoD: 25-row enriched list from one target group with source URLs
- [ ] Task 6.2 [Sales] - Vertical expansion queue ranked by node-multiplier potential (payment processing, title, roofing next-wave) | DoD: Ranked list with rationale + est. aggregate revenue per vertical
- [ ] Task 6.3 [Engineering] - Bulk import (CSV/Sheets) → ledger + graph | DoD: 100-row CSV imports clean with dedup
- [ ] Task 6.4 [Marketing] - Reuse roofing lead magnets for network activation campaigns | DoD: ≥2 existing magnets wired to a booking link with source tracking
- [ ] Task 6.5 [Rob] - Recruit first 2 reps; their targets appear as assigned nodes | DoD: Rep column live in ledger; nodes assignable

---

## Open Questions

- [ ] Q1: Storage — approve recommendation in `docs/STORAGE-DECISION.md` (owner: Rob, due: 2026-07-06)
- [ ] Q2: First 25 real people brain-dump — voice memo is fine (owner: Rob, due: 2026-07-08)
- [ ] Q3: Anthropic API key for the live estimator + rep chat box — use existing key or provision new? (owner: Rob, due: 2026-07-08)

## Decisions Log

| Date | Decision | Rationale | Source |
|------|----------|-----------|--------|
| 2026-07-04 | Re-center PRD on The Network; v1 mission-control framing superseded | Rob's directive: network graph, people ledger, themes, training, speed over taxonomy | Rob |
| 2026-07-04 | Hosting = Vercel (v1 gate G4/Hetzner moot for dashboard) | Rob: "open up a dashboard on Vercel" | Rob |
| 2026-07-04 | Will gets access; he owns tech delivery + big-network meetings and has action items surfaced here | Rob's division-of-labor statement (closes v1 gate G2) | Rob |
| 2026-07-04 | Storage behind adapter; file store day 1; no tool outage may ever stall work (Sheets fallback mandate) | Rob: "plug them into Google Sheets until we get back" | Rob |
| 2026-07-04 | No outside money; door-openers can earn a cut | Rob's core-values statement | Rob |
| 2026-07-04 | Lost-reason/stage-probability taxonomy work deprioritized to later phase | Rob: "not super interested… we'll get there… I want to be moving" | Rob |
| 2026-07-04 | Est. network value labeled directional (referrer estimates may overlap door revenue) until Phase 2.3 re-estimation ships | devil-advocate finding #4 — Rob quotes stats to clients; no unsourced/inflated numbers | Max |
| 2026-07-04 | Estimate writes fail LOUD on read-only deploys and report save-state in UI; reads always fall back to file store | QE finding #2 — the no-stall guarantee must be code, not prose | Max |

## Dependencies & Blockers

| Item | Type | Owner | Status |
|------|------|-------|--------|
| Storage decision (Q1) | gate for Phase 1.2+ | Rob | open |
| Anthropic API key for live estimator (Q3) | gate for 2.1, 4.2 | Rob | open |
| Onboarding PRD extraction pipeline | dependency for 3.2 | contracts build | open |
| Invoicing PRD engine | dependency for 3.3 | contracts build | open |
| Vercel auth for deploy | dependency for 0.10 | Max (check) | open |

## Related Files

- WHAT-WE-ARE-DOING.md (plain-English mission)
- docs/STORAGE-DECISION.md (Rob's 10-second call)
- /Users/robertacheson/Projects/MyLocalEverything/contracts/docs/plans/ (onboarding + invoicing PRDs)
- ~/.claude/plans/snapshots/mle-rob-dashboard/ (v1.0 snapshot)

---

## Revision History

| Version | Date | What Changed | By |
|---------|------|--------------|-----|
| 1.0 | 2026-07-04 | Initial PRD — mission control over contracts systems; gated (G1-G4); QE 92/100 | Max |
| 2.0.4 | 2026-07-04 | Auto-touched (session activity) | prd-autosave.sh |
| 2.0.3 | 2026-07-04 | Auto-touched (session activity) | prd-autosave.sh |
| 2.0.2 | 2026-07-04 | Auto-touched (session activity) | prd-autosave.sh |
| 2.0.1 | 2026-07-04 | Auto-touched (session activity) | prd-autosave.sh |
| 2.0 | 2026-07-04 | MAJOR scope change per Rob: The Network is the center — graph, people ledger, AI estimator, themes, training, Will's corner; hosting = Vercel; taxonomy ceremony deprioritized; PRD moved into project repo | Max (Rob directive) |
| 2.1 | 2026-07-04 | Phase 0 built (two-session build: bf391e58 pages + a0a6c8a2 verify/fix). QE scored 77 → fixes: real no-stall storage fallback, estimate persistence w/ honest save-state, pointer/pinch graph controls, probability+nodeType surfaced, Polk seed regenerated from actual heuristic, Daily-priorities/Events stubs, double-count caveat. Tasks 0.1-0.9, 4.1 checked; 2.5 research half done. | Max |

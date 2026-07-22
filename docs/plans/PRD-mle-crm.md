# PRD: MLE CRM — The Network + Self-Made CRM (Unified)

**Version:** 3.0.18 | **Created:** 2026-07-16 | **Updated:** 2026-07-21
**Status:** ACTIVE
**Owner:** Rob + Max
**Project:** mle-rob-dashboard
**Type:** full
**Slug:** mle-crm

> **LINEAGE (replaces the old "Relationship to the base PRD" banner):** This is the single unified living
> PRD for the MLE CRM, formed 2026-07-21 by merging `PRD-mle-rob-dashboard-v2.md` (base PRD — "The Network",
> Created 2026-07-04, v1.0 → 2.1.2) INTO `PRD-mle-crm-evolution-v1.md` (CRM-evolution PRD, Created 2026-07-16 —
> **this PRD's direct lineage**; its structure and content are the skeleton of this document). Both source PRDs
> are archived with tombstone headers in [`docs/archive/plans/`](../archive/plans/) (created in commit 6bc0b64;
> Task 2.0's final state, closed by the build driver mid-merge, was ported from the archive in commit eefd7e8 —
> see revision 3.0.2). **Rollback:** git tag `pre-prd-merge-exact` (= ba4cc68, the exact pre-merge state; the
> earlier tag `pre-prd-merge-2026-07-21` is a checkpoint 3 commits prior), PRD snapshots in
> `~/.claude/plans/snapshots/`, and the zero-loss map in [`MERGE-LEDGER-2026-07-21.md`](./MERGE-LEDGER-2026-07-21.md).

---

## Status Diagram

```mermaid
flowchart LR
    P1["Phase 1: De-Risk & Definition<br/>2/15 done"] --> P2["Phase 2: CRM Core<br/>1/8 done<br/>(2.0 ✅ orgs split LIVE in prod)"]
    P2 --> P3["Phase 3: Capture & Automation<br/>0/8 done"]
    P2 --> P4["Phase 4: Lifecycle & Access<br/>0/7 done<br/>(4.5 gated on Rob)"]
    P2 --> P7["Phase 7: Rep Cockpit<br/>1/8 done"]
    P7 --> P8["Phase 8: In-Call Buttons<br/>0/4 done"]
    P3 --> P5["Phase 5: Lead Intake & Routing<br/>0/6 done"]
    P4 --> P5
    P5 --> P6["Phase 6: Productization<br/>0/5 done (DEFERRED)"]
    P2 --> M1["Phase M1: Network Intelligence<br/>0/8 done"]
    M1 --> M2["Phase M2: Meeting→Money<br/>0/5 done"]
    M1 --> M3["Phase M3: Team & Training<br/>0/4 done"]
    M1 --> M4["Phase M4: Cadence & Automation<br/>0/6 done"]
    M4 --> M5["Phase M5: Growth Tooling<br/>0/4 done"]
    P8 --> MC["Mission Control (super-admin — NEVER in rep views)<br/>0/17 done"]
    M2 --> MC
    M4 --> MC

    style P1 fill:#f59e0b,color:#000
    style P2 fill:#f59e0b,color:#000
    style P3 fill:#6b7280,color:#fff
    style P4 fill:#6b7280,color:#fff
    style P5 fill:#6b7280,color:#fff
    style P6 fill:#6b7280,color:#fff
    style P7 fill:#f59e0b,color:#000
    style P8 fill:#6b7280,color:#fff
    style M1 fill:#6b7280,color:#fff
    style M2 fill:#6b7280,color:#fff
    style M3 fill:#6b7280,color:#fff
    style M4 fill:#6b7280,color:#fff
    style M5 fill:#6b7280,color:#fff
    style MC fill:#6b7280,color:#fff
```

**Color key:** `#22c55e` complete · `#f59e0b` in-progress · `#6b7280` pending · `#ef4444` blocked

**Phases M1–M5 and Mission Control are the base PRD's Phases 1(remainder)/2–9, folded in whole by this
merge — nothing dropped, nothing renamed away from its origin.** See the Merge Ledger for the full
task-by-task mapping and every judgment call made while folding them in.

---

## Goal

The ultimate platform for sales reps — a self-owned CRM whose only job is **helping reps close more deals**,
with The Network graph as Rob's super-admin lens on top. Every lead arrives with the *details* behind its
source, every call is recorded/transcribed/summarized into a searchable brain, and the rep can send a
proposal, matched case studies, an agreement, or an invoice **while still on the call** — with zero
dependence on GoHighLevel, Close, or any rented CRM core.

## North-Star Principles (from Rob's dump — every task answers to these)

1. **Rep screens carry ONLY what closes deals.** Reports and analytics live outside the rep view.
2. **Rent-first modularity.** A $15/mo SaaS today beats a 3-month build; own the thin core, plug in modules (ours and others'). Reps must never eat admin work while waiting on a build.
3. **API-first, terminal-friendly.** Rob's partner's tools and agents sync in via APIs without his IP being absorbed. The fastest path to his buy-in is a working system he can wire into.
4. **Capture the details behind the source, not just the source.** The email they replied to, the form answers, what the TikTok reel was about — context is the differentiator.
5. **The graph is the chain of connections** (Rob's "blockchain" metaphor): who links to whom, node by node — the super-admin layer above the traditional CRM layers.

## Role Layers (from dump)

| Layer | Who | Sees |
|---|---|---|
| 1. Super Admin | Rob | Everything incl. Network graph, AI contribution $, door-open scores |
| 2. Management & Tech | Will/partner + future mgmt | Ops views, pipeline health, no rep-private book detail (ASSUMED) |
| 3a. Sales Rep (house) | MLE reps | Their leads/deals + rep cockpit |
| 3b. Sales Agent (outside) | Brought-on reps w/ own book | Their book is theirs — protected; we touch it only as invited |
| — Bounty Hunter | Lead CHANNEL, not a rep role | Receives/returns high-intent leads (mechanics = open Q1) |
| — Booker | Outreach/appointment setters | Booking queue (mechanics = open Q1) |

## Scope

**IN:**
- Deals/opportunities as first-class objects on the existing Supabase + StorageAdapter foundation
- Role hierarchy above (RLS-enforced) incl. Sales Agent book-of-business protection
- **Lead routing engine**: high-intent lead → auto-close / rep / bounty hunter / booker per defined rules
- **Source-context intake**: source + the actual message/creative/form answers/trade-show notes per lead
- **Rep cockpit**: in-CRM dialer, every call recorded → transcript → AI summary/action items/buying signals → RAG-searchable; video calls (Zoom/Teams) ingested the same way
- **Deep-scrape rapport brief** auto-generated per lead (talking points with sources)
- **In-call buttons**: custom proposal, matched (redacted) case studies, send-for-signature agreement, send invoice
- Task/follow-up engine, contact lifecycle (search/dedup/import/export/audit), authenticated product lead API (AIDRE/AIVA)
- Build-vs-buy verification via github-tool-scout (Rob's own first-mission search) + schema patterns from Attio/Twenty
- **Carried-forward Network & mission-control scope (Phases M1–M5, Mission Control)** *(added 2026-07-21 merge)* — network graph intelligence, meeting→money flow, training corner, cadence/automation, growth tooling, and the super-admin KPI/ops layer, folded in whole from the base PRD — none of it dropped; see `MERGE-LEDGER-2026-07-21.md` for the full task-by-task mapping

**OUT:**
- GoHighLevel in any form; Close CRM as a destination (one-time read-only export of Rob's own contacts is the only allowed touch, gated on Rob's explicit scope call)
- **Management reporting/analytics suite inside the CRM** — reports are made outside it (Rob: "the only thing we need this for is to help close more deals"). NOT excluded: rep-facing best-practice surfacing (Task 7.8) — that IS closing help, not reporting
- **Literal blockchain tech** — "blockchain" is the connection-graph metaphor, not chain infrastructure (ASSUMED, flag if wrong)
- Client-facing / white-label views (productization = Phase 6 groundwork docs only)
- Replacing the base PRD's meeting→money, KPI, or ingestion scope (consumed, not duplicated)
- Absorbing partner IP into this codebase — integration is via API plug points only
- **Outside investment tracking** *(added 2026-07-21 merge — base PRD scope)* — we don't take outside money; door-openers can earn a cut instead
- **Writing back to the onboarding/invoicing source systems** *(added 2026-07-21 merge — base PRD scope)* — the Mission Control ops/read layer stays read-only, always

## Success Criteria

- Rob runs a full deal — first touch → interactions logged → quote → signed → paid — without leaving the dashboard
- A rep opens a lead and sees: source WITH details (message/form answers/reel topic), deep-scrape talking points, and full activity timeline — nothing that doesn't help close
- A test call dialed from the CRM produces recording + transcript + AI summary w/ action items and buying signals in the timeline, and a RAG query (e.g. "pricing objection") surfaces the right call moment
- Proposal button: click → branded custom proposal sent in <60 seconds while on-call; same seat sends agreement (e-sign) and invoice
- A seeded high-intent lead routes correctly per the routing table (auto-close / rep / bounty hunter / booker)
- github-tool-scout report delivered; keep-vs-adopt base decision logged with weighted scores + source URLs
- Storage-adapter guarantee holds: file-store fallback keeps UI functional if Supabase is unreachable
- Every differentiator in the vision dump maps to ≥1 task or an explicit OUT (verified in this doc)
- **Adding a person to the Network takes < 60 seconds of typing and immediately appears as a node** *(base PRD; now Task M1.1's DoD)*
- **The AI estimator produces revenue/new-node/probability estimates for the Jonathan Polk test case that Rob judges directionally right** *(base PRD; now Task M1.3)*
- **PRD checkboxes and revision history stay current within 24h of any work (living doc)** *(base PRD process criterion — applies to this unified doc)*

---

## Phases + Tasks

### Phase 1: De-Risk & Definition (Research + Sales — runs BEFORE build)

- [x] Task 1.1 [Rob] - **GATE: Brain-dump "how my CRM is different from every other CRM"** | DoD: Captured verbatim → `ROB-CRM-VISION-DUMP-2026-07-17.md`; every differentiator mapped in this v2.0 ✅ 2026-07-17
- [ ] Task 1.2 [Research] - Build-vs-buy scorecard: Attio, Twenty (OSS), Folk, HubSpot Free at <5 seats — cost, ownership, data portability, customization, network-graph fit | DoD: One-page weighted composite scorecard per scoring-pattern rule; source URL + access date per cell
- [ ] Task 1.3 [Research] - Table-stakes feature matrix: what lightweight CRMs (Attio, Twenty, Folk, HubSpot Free, Pipedrive) all ship | DoD: Tool × feature matrix with source URL per cell; flags gaps vs current dashboard
- [ ] Task 1.4 [Research] - Schema-pattern study: how Attio + Twenty model org↔person↔deal↔activity (incl. many-to-many people↔orgs, activity polymorphism) | DoD: Annotated Mermaid ER diagram citing each tool's public docs/repo, mapped against current `lib/types.ts` with gaps flagged
- [ ] Task 1.5 [Research] - Email-sync build cost: DIY Gmail API (watch renewals, quotas, threading, OAuth verification) vs Nylas/Unipile/EmailEngine | DoD: Comparison table (dev-days, $/mo at 5 seats, maintenance) with source URL per claim
- [ ] Task 1.6 [Sales] - Define the CANONICAL pipeline-stage list (supersedes base-PRD Task 7.1, now cross-linked): start from `New Lead → Contacted → Meeting Booked → Meeting Held → Quote Sent → Negotiating → Signed → Stalled → Lost` + `Referral-Sourced` flag, and reconcile base-7.1's post-signature stages (Invoiced → Paid → Delivering) plus entry/exit trigger events per stage | DoD: One stage table, approved by Rob, covering pre- AND post-signature; every existing record maps to exactly one stage; base-PRD 7.1 carries the supersession cross-link (done in base v2.1.2). **⚠️ Merge cross-reference (2026-07-21):** also reconcile with Mission Control Task MC.5 (base 7.6 stalled-deal thresholds/qualified-lead gate/lost-reason enum) — genuine content overlap, not auto-merged; see ledger.
- [ ] Task 1.7 [Sales] - Spec the "Who do I touch today" rules: next-step due/overdue, meeting-no-log >24h, stage-aging thresholds (3d Contacted, 5d Quote Sent, 7d Negotiating) | DoD: Rules doc testable against 10 seeded records covering each trigger. **⚠️ Merge cross-reference (2026-07-21):** overlaps in purpose with Mission Control Task MC.3 (base 7.4 "Needs Action Today" rule set, feeds the Rob-facing daily-priorities panel) — related but distinct audiences (rep next-steps vs Rob/ops SLA rules); reconcile, don't silently merge; see ledger.
- [ ] Task 1.8 [Sales] - Spec the Referral-Chase Queue: promised-intro-date passed with no linked new lead | DoD: Seeded "promised intro, no lead" record flags; clears when referred lead is logged
- [ ] Task 1.9 [Sales] - Define mandatory per-interaction fields: date, contact, channel, referral source, door-opened (Y/N + who), next step + date, stage change | DoD: Save rejected if any required field missing
- [ ] Task 1.10 [Sales] - Define rep-visible vs Rob-only fields (reps: contact/stage/next-step/log; Rob-only: AI contribution $, door-open score, network map) | DoD: Field-visibility matrix signed off by Rob; fixture test proves no Rob-only field renders in the rep view ("only what closes deals" verified, not asserted)
- [ ] Task 1.11 [Sales] - Define AIDRE/AIVA lead-intake payload: product, source, company, vertical, demo dates, assigned rep, stage=New Lead | DoD: Payload schema doc handed to Engineering for Task 5.1
- [x] Task 1.12 [Research] - 🔎 **github-tool-scout FIRST MISSION ✅ 2026-07-17** (docs/research/SCOUT-crm-agents-enrichment-2026-07-17.md; keep-base decision logged) (Rob's search):** OSS platforms approximating the full vision — multi-tier roles, in-app dialer + call recording, AI call summaries, proposal generation, plugin/modular architecture | DoD: Ranked scout report (health scorecards, weighted scores, source URLs); keep-vs-adopt decision logged in Decisions Log; Tasks 1.2–1.5 queue immediately behind it
- [ ] Task 1.13 [Sales] - Role & visibility matrix v2 per the Role Layers table: 4 layers + rep subtypes + bounty-hunter/booker actors, incl. Sales Agent book-of-business protection rules | DoD: Matrix covers every layer × every object type (person/deal/activity/book); ASSUMED cells flagged for Rob
- [ ] Task 1.14 [Sales] - Lead-routing decision table: which high-intent leads go auto-close vs rep vs bounty hunter vs booker (triggers, criteria, fallbacks) | DoD: Routing table resolves 10 seeded lead scenarios with zero ambiguity
- [ ] Task 1.15 [Sales] - Source-context intake spec: per-source detail fields — email replied to + reply text, form questions + answers, ad/reel topic + creative ref, trade-show notes | DoD: Field spec with worked examples for ≥3 source types; feeds Tasks 2.1 and 5.1. **Cross-reference (2026-07-21):** complements Mission Control Task MC.4 (base 7.5 lead-source taxonomy/UTM convention) — 1.15 captures per-lead detail, MC.4 captures channel-level attribution taxonomy; both needed, not duplicative.

### Phase 2: CRM Core — Deals, Activities, Tasks (Engineering)

*Prereqs: (1) base-PRD Task 1.2 (Supabase adapter) complete; (2) Phase 1 definition tasks 1.6–1.15 in hand.*

- [x] Task 2.0 [Engineering] ✅ **DONE 2026-07-21 — critic-rob TICK 97/100 (`docs/reviews/CRITIC-ROB-Q4-orgs-split-2026-07-21.md`).** 🚨 **URGENT (Rob 2026-07-17): split People vs Businesses.** Live `people` table (54 rows at PRD time; live count drifts with Rob's edits — 32 as of 7/21 eve) mixes humans and orgs (e.g. `miga-food-manufacturing`). Add `orgs` table, classify every existing row (human / org / org-as-contact), migrate with edges/FKs preserved | DoD: Zero business entities remain typed as Person; every human links to their org via `org_id`; graph + ledger render both correctly; row-count reconciliation report (N in = N out across both tables, N = live count at apply time) | 7/21 status: 0003 written, amended (verbatim column carry), TWICE defect-fixed pre-apply (data-loss carry list; edges NOT-NULL ordering), and full-SQL rehearsed on live data w/ auto-rollback — all gates green (recon, edge constraints, field preservation). Remaining: ~~adapter dual-schema reads~~ ✅ 7/21 → ~~real apply (+flip `ORGS_SPLIT_READS`)~~ ✅ 7/21 eve **APPLIED TO PROD, LIVE** (post-apply gates == rehearsal exactly: 16+16, 33/47 edges repointed, 0 violations, field-preservation exact; prod curl: all 32 pre-split rows render, money/referral fields spot-checked intact) → ~~person→org `org_id` linking~~ ✅ 7/21 eve (scripts/backfill-org-links.mjs: 11/16 people linked to their org + 15 org_memberships rows — 11 primary + 4 secondary across 3 people w/ secondary affiliations (critic-rob Q4b arithmetic fix 7/21), every link source-cited from the enrichment corpus; 5 honest skips where no org row exists — Trent/Title Base, Cates, George/Guest Genie, Rob+Will/MLE internal; idempotent, gate 11/16 verified twice) → ~~UI merge-view check~~ ✅ 7/21 night (prod redeployed — 6b5faeb's isDemo filter had never shipped, DEMO rows were leaking into prod graph/ledger; post-deploy: 32 nodes/47 edges/0 DEMO/0 dangling, biz badges + Business record header render live) → ~~critic-rob review~~ ✅ 7/21 night TICK 97/100. Post-close notes: (a) export `entityKind` in `/api/network` before Phase-2 deals consumers exist; (b) `people.entity_kind` column is transitional debris — drop after Task 2.2 lands (dated 7/21); (c) Gulf Coast signed-dispute is resolved-by-data since 7/18 (signed date present, `isDisputedSigned` false) — no longer an open ruling.
  - 2026-07-21 (driver): migration `0003_orgs_split.sql` AMENDED before any apply — original draft silently dropped `referred_by_id` (set on ALL 17 company rows), `relationship` (17), `estimate` (11), `phase_one` (4 in-progress), `role`/`business`/`est_time_to_payment_days` + meeting/transcript urls. orgs now carries every people column verbatim (minus `entity_kind`); prune is a later Rob call. Dry-run gained a field-preservation gate (per-column non-null counts, diffable 1:1 post-apply) + flags any people column missing from the carry list. Verified vs live: 35 → 18+17, 33/48 edges repoint, zero dropped columns. NEXT: branch apply + adapter org reads.
- [ ] Task 2.1 [Engineering] - Migration `supabase/migrations/0002_crm_core.sql`: `deals`, `activities` (source-typed: manual|n8n|api|aidre|dialer), `tasks` tables with FKs + `source_context` JSONB per Task 1.15 spec | DoD: Migration applies clean locally + prod; FKs enforce integrity
- [ ] Task 2.2 [Engineering] - Extend `lib/types.ts` with `Deal`, `Activity`, `Task`, `Org` (+ additive `orgId?` on `Person`) | DoD: `npm run build` passes; existing pages compile unchanged
- [ ] Task 2.3 [Engineering] - Extend StorageAdapter with deal/activity/task methods in BOTH Supabase and file stores | DoD: Both adapters pass identical contract test suite (`lib/storage/__tests__/adapter.contract.test.ts`)
- [ ] Task 2.4 [Engineering] - Deal scoring as pure module `lib/scoring/deal.ts` (weighted ladder, `asOf` param, no `Date.now()`) + unit tests | DoD: Deterministic on fixed fixtures; full branch coverage on ladder thresholds
- [ ] Task 2.5 [Engineering] - Deal pipeline kanban `app/deals/page.tsx` + `components/ActivityTimeline.tsx` on person detail | DoD: Dragging a card persists stage via adapter; timeline renders mixed types chronologically
- [ ] Task 2.6 [Engineering] - "Needs action today" endpoint `app/api/tasks/today/route.ts` implementing Task 1.7's rules | DoD: Seeded fixture returns exact expected task IDs. **⚠️ Merge cross-reference (2026-07-21):** overlaps with Mission Control Task MC.13 (base 9.2, "Needs Action Today" widget evaluating MC.3/base-7.4's rule set) — this is the rep-facing endpoint, MC.13 is the Rob/ops-facing widget; likely two consumers of related-but-distinct rule sets, reconcile in Task 1.6/1.7's follow-up; see ledger.
- [ ] Task 2.7 [Engineering] - Backfill script `scripts/backfill-crm.mjs`: synthesize one Deal per existing Person with quoted/signed data | DoD: Dry-run report correct; `--apply` idempotent (re-run = no dupes)

### Phase 3: Capture & Automation (Operations)

- [ ] Task 3.1 [Operations] - ~~URGENT (expires ~2026-07-19)~~ Rotate boostn8n.app.n8n.cloud API key, re-point all workflows | DoD: New key live, old revoked, zero auth failures post-cutover | **Progress 2026-07-21:** urgency cleared — Rob delivered the new key (`N8N_KEY` in .env.local), live-tested 200 on delivery and re-verified 200 during the 7/21 reconciliation sweep. Remaining for DoD: confirm the expired key is revoked in the n8n UI + nothing external still presents it (note: the session-start hook still warns "key expired" from a stale cached copy — hook repoint owed)
- [ ] Task 3.2 [Operations] - n8n Gmail capture: rob@aivoicetech.io ONLY → match to contact → append to activity timeline | DoD: Test email appears on correct timeline <5 min; boostuppayments.com mail never ingested (log-verified — identity rule)
- [ ] Task 3.3 [Operations] - AIDRE call-outcome webhook receiver stub (`/api/webhooks/aidre-call`) → `activities` as type=call, source=aidre | DoD: Synthetic POST creates one correctly-linked activity row; payload schema doc delivered
- [ ] Task 3.4 [Operations] - Overdue follow-up watcher: hourly n8n cron pings Rob on past-threshold follow-ups | DoD: Test past-due record triggers exactly one ping, no dupes on re-run
- [ ] Task 3.5 [Operations] - Nightly dedup detector → `dedup_review` queue (no auto-merge) | DoD: Same-email-different-casing pair surfaces; similar-but-distinct names don't
- [ ] Task 3.6 [Operations] - Silent-failure watchdog for Gmail/AIDRE capture workflows | DoD: Forced workflow error (bad credential) alerts Rob within 15 min
- [ ] Task 3.7 [Operations] - Orphaned-activity check (activities with null/deleted contact_id) as live alert | DoD: Seeded orphan row triggers alert on next scheduled run
- [ ] Task 3.8 [Operations] - Credential-expiry alerting (n8n key, Supabase keys, product API tokens) + homemade-CRM failure-mode doc | DoD: Key within 7 days of expiry alerts Rob; doc lists each failure mode + its detection method

### Phase 4: Contact Lifecycle & Access (Engineering + Operations)

- [ ] Task 4.1 [Engineering] - Full-text search: `tsvector` + GIN index migration + search bar on people page | DoD: "polk" returns Jonathan Polk <200ms on seeded data
- [ ] Task 4.2 [Engineering] - Dedup/merge: pure matcher `lib/dedup/match.ts` (unit-tested) + merge UI folding edges/activities/deals onto surviving person | DoD: Two fixture dupes → one record, zero orphaned FKs
- [ ] Task 4.3 [Engineering] - CSV import/export routes with dedup-on-import (supersedes base-PRD Task 6.3 — built here because import is now CRM-schema-aware) | DoD: 100-row CSV imports clean; dupes flagged, never silently created
- [ ] Task 4.4 [Operations] - CSV import pipeline UX for Rob's real lists: upload → field-mapping template → validation → tagged insert | DoD: 50-row sample with 3 planted dupes → 47 clean + 3 to review, zero silent drops
- [ ] Task 4.5 [Operations] - Close one-time export script — **dry-run only, gated on Rob's explicit scope call** | DoD: Script exists, does not execute until Rob confirms which contacts are legitimately his; output feeds Task 4.4
- [ ] Task 4.6 [Engineering] - RLS + roles implementing Task 1.13's matrix: `profiles` table (super_admin/management/sales_rep/sales_agent), book-of-business protection for sales_agent-imported contacts, policies per layer — rep tiers ship **gated-off** until reps exist | DoD: In test — sales_agent-scoped client cannot expose their protected book to management; rep cannot read another rep's unshared deal | ~~⚠️ KNOWN-OPEN RISK (critic-rob Q4b 7/21): prod `/api/network` UNAUTHENTICATED~~ ✅ RESOLVED 7/21 night (Q10): root cause was `DASHBOARD_PASSWORD` never set in Vercel prod — the ENTIRE dashboard (UI + API) was on the open web, not just /api. Re-armed with the original Phase-0 password + proxy now exempts only `/api/twilio/voice` + `/api/webhooks/*` (Twilio signature-authed). Prod-verified both ways: unauth /, /rep, /api/network, /api/twilio/token all 401; authed all 200 (32 nodes/47 edges); webhook routes reachable unauth (503 env-gate, never 401). This is still the INTERIM gate — Task 4.6 RLS remains the real fix
- [ ] Task 4.7 [Engineering] - Audit trail: auto-log `status_change` activity on every deal/person stage change (adapter-layer, not client-trusted) | DoD: One UI stage change → exactly one status_change row

### Phase 5: Lead Intake & Routing API (Engineering)

- [ ] Task 5.1 [Engineering] - `POST /api/leads` with per-product bearer tokens (AIDRE key, AIVA key): creates/updates Person + logs activity + opens deal at intake stage, payload includes `source_context` per Task 1.15 | DoD: AIDRE test key creates person+deal with source details populated; missing/wrong token → 401
- [ ] Task 5.2 [Engineering] - Rate-limit + idempotency key on `/api/leads` | DoD: Same idempotency key twice → one person, one deal, one activity
- [ ] Task 5.3 [Operations] - Enrichment refresh: lead-enricher re-runs on contacts stale >90 days, results logged as timeline entries (no silent overwrite) | DoD: Stale contact re-enriched on schedule; diff visible in timeline
- [ ] Task 5.4 [Operations] - Dead-lead recycling: no-activity-180-days contacts auto-tag `recycle_candidate`, surfaced in weekly digest (piggybacks base-PRD digest infra) | DoD: Seeded stale contact appears in next weekly digest recycle section
- [ ] Task 5.5 [Engineering] - Routing engine: apply Task 1.14's decision table on intake — assign to auto-close lane / rep / bounty-hunter pool / booker queue, log routing decision as activity | DoD: 10 seeded lead scenarios route exactly per table; every decision auditable in timeline
- [ ] Task 5.6 [Engineering] - Booker-queue + bounty-hunter handoff surfaces (STUB — gated on Q1 mechanics): tracked here so it can't silently drop; scoped fully once Rob answers Q1 | DoD: Once Q1 resolves — booker sees their queue, bounty-hunter handoff works per chosen model (login role vs portal link); until then this task holds the scope

### Phase 6: Productization Groundwork (Marketing + Research — DEFERRED, docs only)

- [ ] Task 6.1 [Marketing] - Positioning hypothesis doc: "The CRM that shows contractors their referral network, not just their job pipeline" vs AccuLynx/JobNimbus | DoD: 1-pager with one-liner + 3 differentiation bullets + "NOT VALIDATED" banner
- [ ] Task 6.2 [Marketing] - Internal codename (AI VoiceTech family, zero STG strings) | DoD: Codename documented in project README + memory
- [ ] Task 6.3 [Marketing] - Dogfood capture list: dated graph screenshots, deal-attribution metrics, usage clips, "aha moment" log — captured from day 1 | DoD: Capture checklist + storage path written
- [ ] Task 6.4 [Marketing] - Productization trigger condition (proposed: 5+ unprompted inbound asks OR 3+ closed deals attributed to network insights, rolling 90 days) | DoD: Trigger written with owner (Rob) + review cadence
- [ ] Task 6.5 [Research] - Roofing/title CRM gripe matrix: AccuLynx, JobNimbus, Leap, SalesRabbit — top complaints around lead-source/referral tracking | DoD: Tool × top-3 complaints × source URL, min 5 sources, confidence level per claim

### Phase 7: Rep Cockpit — Comms & Intelligence (Engineering + Operations) 🆕 v2.0

*The heart of Rob's vision: every conversation captured, understood, and searchable. Rent-first on commodity pieces. **Task 7.1 is pure research — it runs NOW, parallel to Phases 1–2 (no code dependency), so the dialer pick is ready before 7.2 starts.***

- [x] Task 7.1 [Research] - ✅ 2026-07-18: raw Twilio (94.5 composite; docs/research/DIALER-SCORECARD-2026-07-18.md) — Dialer selection (rent-first, UNGATED — runs parallel to Phase 1): JustCall / Aircall / OpenPhone / Twilio-direct — recording API, webhook events, per-seat cost, CRM-embed support | DoD: Weighted scorecard per scoring-pattern rule, source URL per cell; pick logged in Decisions Log
- [ ] Task 7.2 [Engineering] - Click-to-dial from person/deal page via chosen provider; call auto-logged as `activity` type=call source=dialer with recording URL | DoD: Test call from UI → activity row with working recording link. **Progress 2026-07-21:** server side scaffolded env-gated (`lib/twilio.ts` + `/api/twilio/token` + `/api/twilio/voice` TwiML + `/api/webhooks/twilio-recording` signature-checked → activities-ready payload; 12 unit tests). **Progress 2026-07-21 (2):** rep-cockpit Call button wired (`components/CallButton.tsx`, @twilio/voice-sdk dynamic-imported only after a 200 token probe; 503/no-creds or any dial failure → exact pre-dialer tel: link; deployed, prod-verified 503+tel:). Remaining: Twilio creds from Rob (PING-INBOX), live-call test, activity persistence rides on Task 2.1 activities table
- [ ] Task 7.3 [Operations] - Recording → transcript pipeline (provider transcription or Whisper via n8n) → transcript stored on the activity | DoD: Test call yields attached transcript within 10 min of hangup
- [ ] Task 7.4 [Engineering] - Post-call AI pass: summary, action items, key buying signals → written to activity + action items auto-created as `tasks` | DoD: Fixture transcript produces summary + ≥1 correctly-assigned task; buying-signals field populated
- [ ] Task 7.5 [Engineering] - RAG over transcripts/summaries: pgvector embeddings on Supabase + search UI ("what's working" queries) | DoD: Query "pricing objection" returns the relevant call moments from seeded transcripts with links to source activities
- [ ] Task 7.6 [Operations] - Deep-scrape rapport brief on lead assignment: lead-enricher + Firecrawl → talking-points brief on person page | DoD: New lead auto-gets brief with ≥5 talking points, each with source URL
- [ ] Task 7.7 [Operations] - Video-call ingestion: Zoom/Teams recordings via Fathom/Fireflies (already connected) → transcript + summary into timeline, embedded for RAG (extends base-PRD P8) | DoD: Test meeting appears in timeline with transcript, searchable via Task 7.5
- [ ] Task 7.8 [Engineering] - Rep-facing best-practice surfacing ("perfect their craft" — dump line 70): "what's working" digest on the rep cockpit — patterns from won-deal calls (openers, objection handling, buying signals that converted) computed from the RAG corpus | DoD: Digest renders ≥3 evidence-linked patterns from seeded won/lost call fixtures; each pattern links to its source call moments; distinct from excluded management analytics per OUT clause

### Phase 8: In-Call Action Buttons (Engineering) 🆕 v2.0

*Rob: proposal, proof, signature, invoice — while still on the call.*

- [ ] Task 8.1 [Engineering] - Proposal button: person + deal context → proposal generation (reuse `sales-proposal` + PDF skills as the engine) → branded PDF → send via email from rep seat | DoD: Click → sent test proposal in <60 seconds; proposal logged as activity
- [ ] Task 8.2 [Engineering] - Case-study matcher: match prospect (vertical, problem, opportunity) against existing client DB → redacted results view (website screenshots captured via Firecrawl/Playwright on client record creation, outcomes, account specifics stripped) | DoD: Fixture prospect returns ≥1 matched case study with redaction verified (no client-identifying details render); screenshot capture mechanism live for ≥1 seeded client
- [ ] Task 8.3 [Engineering] - Send-for-signature agreement from rep seat (consumes base-PRD P3 / Documenso flow) | DoD: Test agreement sent; signed status lands in timeline automatically
- [ ] Task 8.4 [Engineering] - Send invoice from rep seat (consumes contracts invoicing engine) | DoD: Test invoice sent; payment status visible in timeline

---

### Phase M1: Network Intelligence *(folded in 2026-07-21 from base PRD — Phase 2 "Network Intelligence" in full, plus base Phase 1's two remaining unchecked tasks 1.4/1.5, which had no other natural home; see MERGE-LEDGER-2026-07-21.md)*

*Base PRD Phase 1 tasks 1.1–1.3 are already complete (Supabase live, 54-person dataset loaded) — see ledger, not re-listed. Base Task 1.6 (nightly backup) is merged into Mission Control Task MC.16 (base 9.5 Hardening), which already covers "nightly store/Postgres backup with verification" — judgment call, flagged for Rob.*

- [ ] Task M1.1 [Engineering] *(was base Task 1.4)* - Add-person form (<60s entry) + inline edit | DoD: New person → node appears without redeploy
- [ ] Task M1.2 [Engineering] *(was base Task 1.5)* - Import roofing lists + lead-magnet assets inventory as network seed clusters | DoD: Roofing cluster populated from existing STG-era domain data (data, not branding)
- [ ] Task M1.3 [Engineering] *(was base Task 2.1)* - Claude-powered estimator on live data (replace heuristic): revenue, new nodes, probability, reasoning | DoD: Estimates cached per person; re-run on description change
- [ ] Task M1.4 [Engineering] *(was base Task 2.2)* - Connection suggester: AI scans ledger for non-obvious links (shared verticals, employers, geographies) | DoD: ≥1 suggested connection Rob didn't enter, shown as dashed edge
- [ ] Task M1.5 [Engineering] *(was base Task 2.3)* - Success-rate vs probability overlay (predicted vs actual as deals close) | DoD: Graph toggle shows both per node
- [ ] Task M1.6 [Sales] *(was base Task 2.4)* - Node-activation playbook per node type (connector / phone-attacker / social butterfly / vertical anchor) | DoD: Each type has a 3-step activation play visible on person detail
- [ ] Task M1.7 [Research] *(was base Task 2.5)* - Vertical-anchor scan: payment processing first — displaced payment-processing salespeople w/ deep local books (LinkedIn) | DoD: 10 candidates with source URLs, loaded as unlit nodes (research doc DONE 2026-07-04 → docs/research/payment-processing-candidates.md; node loading pending)
- [ ] Task M1.8 [Engineering] *(was base Task 2.6)* - Cluster analytics: per-vertical aggregate est. revenue + activation % | DoD: Zoom-out view shows per-cluster rollups

### Phase M2: Meeting → Money Flow *(folded in 2026-07-21 from base PRD Phase 3, in full)*

- [ ] Task M2.1 [Engineering] *(was base Task 3.1)* - Low-friction meeting notes capture (Fathom link or paste) attached to person record | DoD: Paste/link → transcript + video links populate ledger fields
- [ ] Task M2.2 [Engineering] *(was base Task 3.2)* - Notes → scope extraction → agreement fields (reuse onboarding PRD's extraction pipeline) | DoD: Test transcript → scoped agreement draft with fields filled
- [ ] Task M2.3 [Engineering] *(was base Task 3.3)* - Signature → invoice-out trigger (reuse invoicing PRD engine) | DoD: Signed test agreement → invoice generated within 5 min
- [ ] Task M2.4 [Engineering] *(was base Task 3.4)* - Time-to-payment tracking per person (est. vs actual) on ledger + overview | DoD: Both values render; overdue turns red
- [ ] Task M2.5 [Operations] *(was base Task 3.5)* - Key-dates timeline per person (met → quoted → signed → invoiced → paid → phase-one complete) | DoD: Timeline renders for any person with ≥2 dates

### Phase M3: Team & Training *(folded in 2026-07-21 from base PRD Phase 4; Task 4.1 "Phase One explainer" already shipped 2026-07-04 — see ledger, not re-listed)*

- [ ] Task M3.1 [Engineering] *(was base Task 4.2)* - Rep chat box (Claude-backed, grounded in training corpus) | DoD: "What is phase one?" answered correctly from corpus, not vibes
- [ ] Task M3.2 [Rob] *(was base Task 4.3)* - Record/approve coaching materials descriptions (Max structures into corpus) | DoD: ≥3 coaching entries live in training corner
- [ ] Task M3.3 [Sales] *(was base Task 4.4)* - Rep onboarding path: day 1 → first call script → first deal | DoD: Checklist page a new rep can self-serve
- [ ] Task M3.4 [Engineering] *(was base Task 4.5)* - Collateral shelf incl. items needed FROM Will (data, collateral) with reminder flags | DoD: Will-owed items generate reminders (Phase M4 wiring)

### Phase M4: Cadence & Automation *(folded in 2026-07-21 from base PRD Phase 5, in full)*

- [ ] Task M4.1 [Engineering] *(was base Task 5.1)* - Daily priorities panel: AI ranks today's actions (nodes to light, follow-ups, Will nudges) | DoD: Opens with ≥3 ranked actions each morning with reasons
- [ ] Task M4.2 [Operations] *(was base Task 5.2)* - Reminders engine: Will's action items + Rob follow-ups (n8n or cron) | DoD: Overdue Will item pings within 24h of due
- [ ] Task M4.3 [Operations] *(was base Task 5.3)* - Scheduling hooks: autonomous runs (estimator refresh, connection scan, daily digest) | DoD: All three run unattended on schedule; failures alert. **Cross-reference (2026-07-21):** the "daily digest" run here is the scheduling mechanism; its content spec is Mission Control Task MC.15 (base 9.4) — related, not duplicate.
- [ ] Task M4.4 [Engineering] *(was base Task 5.4)* - Events section: upcoming events as network opportunities (who's there, which nodes) | DoD: Event with linked people renders on overview
- [ ] Task M4.5 [Operations] *(was base Task 5.5)* - PRD autosave verification for this project path | DoD: Session-end hook updates checkboxes in THIS file
- [ ] Task M4.6 [Operations] *(was base Task 5.6)* - Update-reminders for the Products section (AIDRE/AIVA status staleness) | DoD: Product untouched >7 days flags on overview

### Phase M5: Growth Tooling *(folded in 2026-07-21 from base PRD Phase 6; Task 6.3 already superseded by CRM Tasks 4.3/4.4 pre-merge — see ledger, not re-listed)*

- [ ] Task M5.1 [Research] *(was base Task 6.1)* - Scraper/search pipeline for target groups (e.g., web developers) — names, roles, contact where permissible | DoD: 25-row enriched list from one target group with source URLs
- [ ] Task M5.2 [Sales] *(was base Task 6.2)* - Vertical expansion queue ranked by node-multiplier potential (payment processing, title, roofing next-wave) | DoD: Ranked list with rationale + est. aggregate revenue per vertical
- [ ] Task M5.3 [Marketing] *(was base Task 6.4)* - Reuse roofing lead magnets for network activation campaigns | DoD: ≥2 existing magnets wired to a booking link with source tracking
- [ ] Task M5.4 [Rob] *(was base Task 6.5)* - Recruit first 2 reps; their targets appear as assigned nodes | DoD: Rep column live in ledger; nodes assignable

### Phase Mission Control (super-admin analytics — NEVER in rep views) *(folded in 2026-07-21 from base PRD Phases 7–9, deprioritized-not-dropped in the base PRD, deprioritized-not-dropped again here — consistent with North-Star Principle 1: rep screens carry only what closes)*

**⚠️ Merge finding (2026-07-21):** base Task 7.7 ("GATE G1: Decide whether the Network people ledger IS MLE's CRM system of record, or name a separate CRM") was still UNCHECKED/open in the base PRD, but is functionally answered by this PRD's own 2026-07-16 Decisions Log entry — "Dashboard becomes basis of self-made CRM." **Not unilaterally closed as a task edit; flagged here and in the ledger for Rob's explicit sign-off**, since no one had marked base 7.7 resolved before this merge.

- [ ] Task MC.1 [Sales] *(was base Task 7.2)* - Define 7 sales KPIs with formulas + source fields: Discovery Show Rate (≥75%), Proposal Win Rate (30/60/90d), Weighted Pipeline Value (stage-probability map), Avg Sales Cycle, Time-to-First-Touch (<4 bus. hrs), Signed-to-Cash Lag, Follow-up SLA Compliance | DoD: Each KPI has formula, numerator/denominator source fields, and target benchmark documented; stage→probability mapping approved by Rob
- [ ] Task MC.2 [Marketing] *(was base Task 7.3)* - Define 4 marketing KPIs with formulas + named source systems: Cost per Booked Call, Lead-Magnet Conversion, Source → Close Rate, Booking Volume by Channel | DoD: Each KPI has formula, input-source table, and a worked example
- [ ] Task MC.3 [Sales] *(was base Task 7.4)* - Define "Needs Action Today" rule set (new lead >24h untouched; no 24h-prior discovery reminder; no proposal within 48h of discovery; no follow-up in 3 bus. days; signed-not-invoiced >24h) | DoD: Rule table with trigger, action owed, SLA hours, exact field each rule reads — feeds the daily-priorities panel (M4.1). **⚠️ Overlap flag: reconcile with CRM Task 1.7 ("who do I touch today").**
- [ ] Task MC.4 [Marketing] *(was base Task 7.5)* - Lead-source taxonomy (Cold Email, Referral, Lead Magnet, Organic, Direct/Unknown) + UTM convention + Cal.com hidden-field/UTM passthrough spike | DoD: Taxonomy doc; UTM convention table; Cal.com passthrough yes/no verdict with evidence (or workaround). **Cross-reference: complements CRM Task 1.15 (source-context intake).**
- [ ] Task MC.5 [Sales] *(was base Task 7.6)* - Stalled-deal thresholds per stage, qualified-lead gate (BANT-lite), lost-reason enum (6-8 values) | DoD: Three short tables documented — Rob 2026-07-04: "we'll get there," so this is explicitly last in this phase. **⚠️ Overlap flag: reconcile with CRM Tasks 1.6 (Stalled/Lost are already canonical stages) and 1.7 (stage-aging thresholds 3d/5d/7d already spec'd) — do not duplicate the threshold definitions, do add the still-uncovered qualified-lead gate + lost-reason enum.**
- [ ] Task MC.6 [Research] *(was base Task 8.1)* - Inventory onboarding-PRD data (`clients/<slug>.json` schema, Documenso IDs + signed-PDF URLs, CRM adapter fields) + Cal.com/Fathom/Documenso/Twilio/Retell webhook payload fields with doc URLs | DoD: Consolidated field table per system, each with source URL
- [ ] Task MC.7 [Research] *(was base Task 8.2)* - GATE G3: Confirm invoicing/AR backing store live today (Postgres/Supabase tables vs `invoice-ledger.csv`) | DoD: Written verdict per store with evidence; determines what the AR view reads
- [ ] Task MC.8 [Engineering] *(was base Task 8.3)* - Read-model data contract + read-only role: views for pipeline, e-sign status, action items, delivery phases, invoices/AR, nudge activity; `dashboard_ro` SELECT-only role | DoD: `docs/data-contract.md` committed; INSERT/UPDATE attempt fails in test; views return expected sample rows
- [ ] Task MC.9 [Operations] *(was base Task 8.4)* - n8n ingestion workflows: Cal.com booking (incl. UTM per MC.4), Fathom recording-ready, Documenso sent/viewed/signed/declined, invoicing paid/overdue | DoD: Each test event reflects in its target table within its cadence (60s–5min)
- [ ] Task MC.10 [Operations] *(was base Task 8.5)* - Error workflow + freshness: failures → `sync_failures` table; `last_synced_at` on every table-writing node | DoD: Forced bad payload logs within 60s; every target table's timestamp updates on cadence
- [ ] Task MC.11 [Operations] *(was base Task 8.6)* - Publish Mermaid workflow map (trigger/nodes/target table per workflow) | DoD: Diagram matches n8n workflow list 1:1
- [ ] Task MC.12 [Engineering] *(was base Task 9.1)* - Add ops panels to the dashboard: Pipeline, Onboarding/E-sign, Action Items (ours/theirs), Invoicing/AR, KPI Summary — same app, new faces, super-admin-only | DoD: Each renders live data; smoke test per screen passes
- [ ] Task MC.13 [Engineering] *(was base Task 9.2)* - "Needs Action Today" widget evaluating rule set MC.3 | DoD: Seeded fixture for each rule surfaces exactly the expected items. **⚠️ Overlap flag: reconcile with CRM Task 2.6 ("needs action today" rep-facing endpoint).**
- [ ] Task MC.14 [Operations] *(was base Task 9.3)* - Alerting: stale-data check (30-min), failed-sync push, overdue Rob-owned action items (daily 8am), unpaid-invoice alerts at 7/15/30 days — all with 24h dedup + per-alert-type kill switch | DoD: Each forced condition alerts once within its window; toggling one type off leaves others firing
- [ ] Task MC.15 [Operations] *(was base Task 9.4)* - Daily 7am digest (pipeline count, e-sign pending, overdue items, AR aging) + weekly Monday KPI rollup (revenue, pipeline velocity, sync health) | DoD: Test runs deliver all sections matching live dashboard counts
- [ ] Task MC.16 [Engineering] *(was base Task 9.5, merged with base Task 1.6 "nightly backup")* - Hardening: secrets externalized + repo grep clean, `/api/health` endpoint + uptime check, nightly store/Postgres backup with verification (absorbs base Task 1.6's "simulated store outage → dashboard serves from last backup" requirement), no secrets in client bundle | DoD: `git grep -i password` clean; simulated outage alerts within one cycle; forced-missing-backup flags within 24h; simulated store outage → dashboard serves from last backup (base 1.6's DoD, folded in)
- [ ] Task MC.17 [Rob] *(was base Task 9.6)* - Live sign-off: spot-check 3 records against source systems (with Will) | DoD: Match confirmed; sign-off logged; E2E screenshots archived

**Retired (carried from base PRD — already moot there, kept here so nothing is silently re-lost):**
- G2 Will-access gate → RESOLVED: Will gets access (Rob 2026-07-04 division-of-labor)
- G4 Hetzner capacity check + Docker/Caddy hosting ADR → MOOT: Rob chose Vercel; revisit only if we ever self-host
- Standalone brand-spec task → dashboard shipped with an approved dark-mode look; reopen only if Rob wants a restyle
- Competitive dashboard scan → nice-to-have; pull forward on request

---

## Open Questions

- [ ] Q1: **Bounty hunters + bookers — mechanics.** Bounty hunters: paid per close or per intro? CRM login (a role) or portal/link handoff with no inside access? Bookers: who are they (in-house setters? VAs?) and do they need a seat + queue? (owner: Rob, due: 2026-07-24 — blocks final Task 1.13/1.14 sign-off)
- [ ] Q2: **Sales Agents' book-of-business** — completely invisible to super-admin/management, or visible-but-untouchable? Drives the entire RLS design (Task 4.6). Current ASSUMED default: visible to Rob only, invisible to management, never contacted without agent invitation. (owner: Rob, due: 2026-07-24)
- [ ] Q3: **"Trying to get to close automatically"** — is there a genuinely no-human closing lane (AI conversation → self-serve agreement + payment) for some lead tier? If yes it gets scoped as its own lane in Task 1.14 + a new phase. (owner: Rob, due: 2026-07-24)
- [ ] Q4 *(folded in 2026-07-21, was base PRD Q4)*: Rep discount authority — last open `[CONFIRM WITH ROB]` in phase-one-explainer.md (owner: Rob)
- [ ] Q5 *(folded in 2026-07-21, was base PRD Q5)*: Alert channel for Mission Control — Slack DM, SMS, or both? Client-owned overdue items ever alert the client, or Rob-only? (owner: Rob, needed before Task MC.14)
- [ ] Q6 *(folded in 2026-07-21, was base PRD Q6)*: Data-freshness SLA per table — webhook near-real-time everywhere, or 5-min poll OK for AR/action items? (owner: Rob, needed before Task MC.9)

*Base PRD Q1 (storage), Q2 (25-person brain-dump), Q3 (Anthropic API key) are RESOLVED and already reflected in this PRD's own Decisions Log / Dependencies table below — not re-opened; see ledger.*

## Decisions Log

| Date | Decision | Rationale | Source |
|------|----------|-----------|--------|
| 2026-07-04 | Supabase as store ("supabase go") — *(2026-07-21 merge: enriched with base-PRD detail — adapter built at `lib/storage/supabaseStore.ts`, schema `0001_network.sql`, seed script)* | Base-PRD Task 1.1 gate | Rob |
| 2026-07-16 | Dashboard becomes basis of self-made CRM | Own the system of record; no GHL access, Close is STG's | Rob |
| 2026-07-16 | Build-vs-buy scorecard still runs (Task 1.2) | Rob's rule: CRM selection is merit-based, even for self-build | Max/rules |
| 2026-07-16 | Pipeline stages: CRM-PRD Task 1.6 is CANONICAL; base-PRD 7.1 superseded + cross-linked (base v2.1.2) | Prevent two-PRD drift | quality-evaluator/Max |
| 2026-07-16 | RLS/roles built but gated-off until reps exist | Don't over-build ahead of team | chief-of-staff |
| 2026-07-17 | Research Tasks 1.2–1.5 queue BEHIND Task 1.12 (scout first mission = Rob's vision search) | Rob: "first task related to something I'd like to search for for my vision of the CRM" | Rob |
| 2026-07-17 | **v2.0: vision dump folded in** — role layers, routing engine, rep cockpit (P7), in-call buttons (P8), source-context intake, north-star principles | Rob's verbal brain dump (verbatim file) | Rob |
| 2026-07-17 | Stack stays Next.js/TypeScript/Supabase — no language change | Rob's Q: same family as Twenty; RLS fits role layers; API routes fit partner's terminal agents | Max (Rob's Q answered) |
| 2026-07-17 | Provisional: keep MLE dashboard as base (not OSS adoption) — pending Task 1.12 scout data | Differentiators exist in no OSS CRM; steal schemas, rent modules, own thin core | Max (Rob's Q, data check queued) |
| 2026-07-17 | ASSUMED: "blockchain" = connection-graph metaphor, not literal chain tech | Dump context; flagged in OUT for Rob to veto | Max |
| 2026-07-17 | ASSUMED: Will/partner sits in Management & Tech layer; CRM codebase is Rob-owned with API-first plug points so partner tools integrate without IP absorption | Dump: layer 2 + IP-protective partner + "get it in front of him" | Max |
| 2026-07-17 | ASSUMED: Sales Agent book visible to Rob only, invisible to management, hands-off unless invited | Dump: "We won't reach out to them, except for the degree that they want" — pending Q2 | Max |
| 2026-07-17 | **PAID is the apex signal**: payment ⇒ auto-upgrade to Client with its own GREEN temperature tier; People views show PAID over signed; drop Est-time-to-payment from rep-facing views | Rob: "It's good to know they've signed, it's better to know they've paid" | Rob |
| 2026-07-17 | **Full CRM rebuild w/ logins GREENLIT** — Rob: "let me back off and let you build"; push to GitHub first + push throughout the job | Repo live: github.com/blacklabelbob/mle-rob-dashboard (private) | Rob |
| 2026-07-17 | **Critic Rob evaluator agent mandated**: built from mined history (all rules/feedback/preferences); uncompromising orderliness+precision, Jobs-grade design taste, Musk-grade first-principles engineering; backs down only at perfect; interprets Rob's non-technical phrasing for intent | Rob directive; corpus mining running | Rob |
| 2026-07-17 | **Auto-enrichment mandated** for every business record (phones, firmographics, social connections); current records under-enriched; scout GitHub for existing agents before building | Rob | Rob |
| 2026-07-17 | Enrichment stack (scout-verified): gosom/google-maps-scraper (5.1k★, MIT) as the phone/address/rating engine + fire-enrich architecture for domain→firmographics; NO self-hostable Clearbit exists — social-graph data goes through a paid API in an n8n waterfall | github-tool-scout report, docs/research/SCOUT-crm-agents-enrichment-2026-07-17.md | scout/Max |
| 2026-07-17 | Dialer build shape: official twilio-voice.js SDK + own thin Next.js token/webhook routes (~200 lines); no OSS dialer worth forking. Task 7.1's SaaS-provider scorecard (JustCall/Aircall/OpenPhone vs raw Twilio) still owed before 7.2 | scout report mission 2 | scout/Max |
| 2026-07-17 | Agent imports: wshobson/agents (38k★) + VoltAgent collections as pattern donors (backend-architect, sales-automator, code-reviewer et al) — re-tuned per CR-1/CR-2, not drop-in | scout report mission 3 | scout/Max |
| 2026-07-18 | **Task 7.1 DECIDED: raw Twilio** (twilio-voice.js + own routes) — composite 94.5 vs JustCall 78.25/Aircall 69.25/OpenPhone 67.05; scorecard w/ sources in docs/research/DIALER-SCORECARD-2026-07-18.md; JustCall is the rent-first fallback if Rob vetoes | Weighted composite per scoring-pattern rule; confirms OSS scout | research agent/Max |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Re-center base PRD on The Network; v1 mission-control framing superseded as the *lead* (historical — base PRD's own framing, superseded again by this unified doc) | Rob's directive: network graph, people ledger, themes, training, speed over taxonomy | Rob |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | v1 mission-control scope NOT dead — merged into base PRD as Phases 7–9, deprioritized; now folded into this PRD as the Mission Control phase | Rob: elements of v1 still matter; front-load priorities, keep everything tracked so nothing is missed | Rob |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Hosting = Vercel (v1 gate G4/Hetzner moot for dashboard) | Rob: "open up a dashboard on Vercel" | Rob |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Will gets access; he owns tech delivery + big-network meetings and has action items surfaced here | Rob's division-of-labor statement (closes v1 gate G2) | Rob |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Storage behind adapter; file store day 1; no tool outage may ever stall work (Sheets fallback mandate) | Rob: "plug them into Google Sheets until we get back" | Rob |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | No outside money; door-openers can earn a cut | Rob's core-values statement | Rob |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Lost-reason/stage-probability taxonomy work deprioritized to (now) Mission Control Task MC.5 (kept, not cut) | Rob: "not super interested… we'll get there… I want to be moving" | Rob |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Est. network value labeled directional (referrer estimates may overlap door revenue) until Task M1.5 re-estimation ships | devil-advocate finding #4 — Rob quotes stats to clients; no unsourced/inflated numbers | Max |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Estimate writes fail LOUD on read-only deploys and report save-state in UI; reads always fall back to file store | QE finding #2 — the no-stall guarantee must be code, not prose | Max |
| 2026-07-04 *(carried from base PRD, 2026-07-21 merge)* | Phase One pricing = $10,000 upfront + $1,000/month; upfront pay-in-full due upon receipt | Rob's direct answer — resolves 2 of 3 training-doc flags; estimator economics updated (~$22k yr-1/deal) | Rob |

## Dependencies & Blockers

| Item | Type | Owner | Status |
|------|------|-------|--------|
| ~~Rob's differentiator brain-dump (Task 1.1)~~ | ~~blocker~~ | Rob | ✅ resolved 2026-07-17 |
| ~~Base-PRD Task 1.2: Supabase adapter live~~ | dependency | Max | ✅ resolved 2026-07-17 (mle-network live, local+prod verified) |
| ~~Base-PRD Task 1.3: 25-person brain-dump~~ | dependency | Rob | ✅ resolved (54-person dataset live 7/8; Rob confirmed 7/21) |
| ~~Anthropic API key~~ | dependency | Rob | ✅ resolved — estimator running on claude (est. panel stamps 'source: claude 7/17'; Rob confirmed 7/21) |
| ~~n8n API key~~ | dependency | Rob | ✅ resolved 2026-07-21 — new key delivered in .env.local (N8N_KEY), live-tested 200 vs boostn8n API |
| AIDRE call-outcome payload shape | dependency for Task 3.3 | Max (AIDRE build) | open |
| Q1–Q3 answers (bounty/booker, book visibility, auto-close lane) | refines 1.13/1.14/4.6 | Rob | open |
| ~~Dialer provider decision (Task 7.1 output)~~ | ~~blocker for 7.2–7.3~~ | Max → Rob confirm | **decided 7/18 (raw Twilio, composite 94.5) — 7.2 build proceeding per merit rule; Rob async veto still open (dev-chat #27)** |
| Twilio creds (Account SID + Auth Token + local number, Rob-owned account) | gate for Task 7.2 live-call DoD only (scaffold done, env-gated) | Rob (PING-INBOX ☎️ item) | open |
| Onboarding PRD extraction pipeline *(folded in 2026-07-21, was base PRD dependency)* | dependency for Tasks M2.2, MC.6 | contracts build | open |
| Invoicing PRD engine *(folded in 2026-07-21, was base PRD dependency)* | dependency for Tasks M2.3, MC.7 | contracts build | open |
| ~~G1: CRM system of record (ledger vs separate CRM)~~ *(folded in 2026-07-21, was base PRD gate for 7.7)* | ~~gate~~ | Rob | **functionally resolved** by this PRD's own 2026-07-16 Decision ("Dashboard becomes basis of self-made CRM") — flagged for Rob's explicit confirmation since base 7.7 itself was never checked off; see Mission Control phase note |
| G3: Invoicing backing store confirmed *(folded in 2026-07-21, was base PRD dependency)* | gate for Task MC.7 → AR view | Research → Rob | open |
| Alert channel + freshness SLA (Q5/Q6) *(folded in 2026-07-21, was base PRD dependency)* | gate for Tasks MC.9, MC.14 | Rob | open |

## Related Files

- [`ROB-CRM-VISION-DUMP-2026-07-17.md`](./sources/ROB-CRM-VISION-DUMP-2026-07-17.md) — **verbatim vision dump (source of truth for intent)**
- `docs/archive/plans/PRD-mle-rob-dashboard-v2.md` — archived base PRD (Phases 0–9, v1.0→2.1.2); superseded by this document 2026-07-21 (archived in commit 6bc0b64, tombstoned)
- `WHAT-WE-ARE-DOING.md` — plain-English strategy
- `docs/plans/sources/STORAGE-DECISION.md` — Supabase decision record
- `~/.claude/rules/scoring-pattern.md` — scoring-in-code rule (Tasks 2.4, 1.2, 7.1)
- `~/.claude/rules/email-identity.md` — Gmail capture identity constraint (Task 3.2)
- `/Users/robertacheson/Projects/MyLocalEverything/contracts/docs/plans/` *(folded in 2026-07-21, was base PRD related file)* — onboarding + invoicing PRDs, dependencies for Tasks M2.2/M2.3/MC.6/MC.7
- `~/.claude/plans/snapshots/mle-rob-dashboard/` *(folded in 2026-07-21, was base PRD related file)* — v1.0 original snapshot of the base PRD, predates the archive copy above
- [`MERGE-LEDGER-2026-07-21.md`](./MERGE-LEDGER-2026-07-21.md) — zero-loss proof for this 2026-07-21 unification

---

## Revision History

| Version | Date | What Changed | By |
|---------|------|--------------|-----|
| 3.0.2 | 2026-07-21 | **RACE-LOSS RESTORED (critic-rob unification punch #1):** the driver closed Task 2.0 (orgs split APPLIED TO PROD, TICK 97/100) between the merge snapshot (v2.2.27) and commit; final state + the 6 revision rows below ported verbatim from the archived source (which preserved v2.2.31). Gulf signed-dispute = resolved-by-data since 7/18 (in Task 2.0 post-close notes). Driver now PAUSES during structural PRD ops (crm-driver.pause flag) | Max |
| 3.0.17 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.18 | 2026-07-21 | **Q10 CLOSED — /api security gate SHIPPED.** Root cause worse than the punch item: `DASHBOARD_PASSWORD` was never set in Vercel prod, so proxy.ts was a no-op and the WHOLE dashboard (UI + every API route) was unauthenticated, not just /api/network. Fix: env var re-armed (original Phase-0 password, user rob), proxy exempts only `/api/twilio/voice` + `/api/webhooks/*` (own X-Twilio-Signature auth); recording webhook hardened (config-check before body parse; malformed body → 400 not 500). +3 proxy unit tests (30/30), build green, deployed, prod-curled both ways (unauth 401 on /, /rep, /api/network, /api/twilio/token; authed 200; webhooks reachable 503). Task 4.6 risk annotation resolved — RLS still the real fix | Max (driver) |
| 3.0.15 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.14 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.16 | 2026-07-21 | **Q4b CLOSED — critic-rob independent 5-claim spot-check PASS 5/5, 93/100** (`docs/reviews/CRITIC-ROB-Q4b-prd-spotcheck-2026-07-21.md`; sampled around the sweep's own examples: org-link counts, Anthropic dep row, Q4 open question, GitHub decision entry, rev 2.2.26 backups/fallback/prod claims — all verified against live Supabase/prod/remote). Punch applied same-commit: Task 2.0 membership arithmetic fixed (11 primary + 4 secondary across 3 people); Task 4.6 annotated w/ KNOWN-OPEN RISK — prod /api/network unauthenticated. Queued: /api gate (Q10, security) + revision-table renumber/dedupe (Q11). gh CLI re-auth pinged to Rob (non-blocking) | Max (driver) |
| 3.0.13 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.12 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.11 | 2026-07-21 | **Q4b reconciliation sweep, pass 1 (driver):** every checkbox, dependency row, and open question verified against live state. VERIFIED TRUE: n8n key live (fresh 200 vs boostn8n API), Twilio creds still absent (Q5b gate holds), prod /api/network 32 nodes with NO entityKind export (Task 2.0 punch item (a) accurate), lib/types.ts has entityKind but no orgId (2.2 correctly open), rollback tags + all referenced review/research files exist, phase counts in status diagram exact (2/15, 1/8, 1/8). ONE stale line found+fixed: Task 3.1 still read as un-started urgent rotation — annotated with 7/21 delivery/test state + remaining revoke/repoint sub-items. Remaining for Q4b tick: critic-rob 5-claim spot-check | Max (driver) |
| 3.0.10 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.9 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.8 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.7 | 2026-07-21 | Task 7.2 client wiring: rep-cockpit Call button is now `components/CallButton.tsx` (@twilio/voice-sdk added, dynamic-imported only after a 200 token probe) — one availability probe per page load; 503 (creds unset) or any call failure renders/degrades to the exact pre-dialer tel: link. Deployed + prod-verified (token 503, /rep 200, tel: links render). 7.2 remaining: Twilio creds (Rob), live-call DoD test, activity persistence rides on Task 2.1 | Max (driver) |
| 3.0.6 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.5 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.4 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 3.0.3 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 2.2.30 | 2026-07-21 | **Task 2.0 CLOSED — critic-rob TICK 97/100** (docs/reviews/CRITIC-ROB-Q4-orgs-split-2026-07-21.md; all DoD clauses independently verified vs live Supabase + prod). Same increment: UI merge-view check caught + fixed a prod defect — commit 6b5faeb (isDemo filter) was never deployed, so the 6 DEMO rows were leaking into prod graph/ledger; redeployed, prod now 32 nodes/0 DEMO. Punch-list notes recorded on Task 2.0: export entityKind in /api/network pre-Phase-2; drop people.entity_kind after Task 2.2; Gulf dispute resolved-by-data 7/18 | Max (driver) |
| 2.2.27 | 2026-07-21 | Task 2.0: person→org `org_id` backfill DONE (scripts/backfill-org-links.mjs) — 11/16 people linked to their org with per-link evidence (Sunbiz/DBPR/LinkedIn/Rob-confirmed), 15 `org_memberships` rows incl. secondary affiliations (Gary↔Miga co-owner, Daniella↔Martin Fierro+Oasis, Michael↔Oasis); 5 skips logged where no org row exists (Title Base, Cates, Guest Genie, MLE internal). Idempotent + gated (linked must equal 11). DoD "every human links to their org" now met for every human whose org exists. Remaining on 2.0: UI merge-view check → critic-rob review | Max (driver) |
| 2.2.26 | 2026-07-21 | Task 2.0: **0003 APPLIED TO PROD + `ORGS_SPLIT_READS=1` live** (same-increment Vercel deploy, CLI upgraded 37→56 mid-deploy when the old one was rejected). Pre-apply JSON backups in `backups/`; post-apply gates matched the rehearsal run exactly; prod verified via authed curl (32 nodes, 47 edges, 0 null endpoints, quoted/signed/referrer spot-check intact). `scripts/regen-fallback.mjs` made org-aware (merges orgs as company Persons, coalesces paired FKs — fallback would otherwise have silently lost all 16 companies) and fallback regenerated. Remaining on 2.0: person→org `org_id` backfill, UI merge-view check, critic-rob review | Max (driver) |
| 2.2.25 | 2026-07-21 | Task 2.0: adapter dual-schema mode SHIPPED (env-gated `ORGS_SPLIT_READS=1`, off in prod until 0003 applies) — supabaseStore merges `orgs` rows back as entityKind-company Persons, edges coalesce paired person/org FKs, referred_by_org_id coalesced on read; writes route company rows to `orgs` and org-referrers to the paired column so an edit can never fork a record back into `people`. 7 new unit tests on the mappers (15/15 green), build green. Remaining on 2.0: real apply (flip flag same deploy) → UI merge view → critic-rob review | Max (driver) |
| 2.2.24 | 2026-07-21 | Task 2.0: 0003 rehearsed FULL-SQL against live prod data w/ guaranteed rollback (scripts/orgs-split-rehearsal.sql); caught+fixed a 2nd apply-blocker (edges from_id/to_id nulled before NOT NULL dropped → reordered). All gates pass on live data: 32→16+16 recon, 33/47 edges repointed, 0 constraint violations, field-preservation exact. 0003 apply-ready; next = adapter dual-schema reads, then apply + critic-rob | Max (driver) |
| 2.2.22 | 2026-07-21 | Task 2.0: migration 0003 amended pre-apply — verbatim column carry into `orgs` (original draft would have destroyed referred_by/relationship/estimate/phase_one on all 17 live company rows); dry-run now enforces a field-preservation gate. Also reverted a stray autosave corruption in the vision-dump title line | Max (driver) |
| 3.0 | 2026-07-21 | **UNIFICATION**: merged `PRD-mle-rob-dashboard-v2.md` (base PRD, v1.0→2.1.2, 62 tasks + scope/criteria/questions/decisions/dependencies) into this PRD (v1.0→2.2.28, the skeleton). Base Phase 1 remainder + Phase 2 → Phase M1; Phase 3 → M2; Phase 4 remainder → M3; Phase 5 → M4; Phase 6 remainder → M5; Phases 7–9 remainder → new "Mission Control" phase (super-admin only, per North-Star Principle 1). Completed/superseded/resolved base items recorded as absorbed, not re-listed. Scope OUT gained 2 bullets (outside investment, no write-back); Success Criteria gained 3 bullets; Open Questions gained Q4–Q6; Decisions Log gained 10 rows (incl. 1 enrichment); Dependencies gained 5 rows; Related Files gained 2 entries. 5 content-overlap points flagged (not silently merged) between CRM Phase 1/2 tasks and Mission Control tasks — see ledger. One gate (base 7.7/G1) found functionally-but-not-formally resolved — flagged for Rob. Full task-by-task zero-loss proof: `MERGE-LEDGER-2026-07-21.md`. Base PRD's own revision history (12 rows, v1.0→2.1.2) is preserved intact in the archived source file, not duplicated here. | Max (Rob directive: "unify the two living PRDs... lose NOTHING important") |
| 3.0.2 | 2026-07-21 | Task 7.2 server scaffold: env-gated Twilio routes (token mint w/o SDK dep, TwiML dial w/ dual-channel recording, signature-validated recording webhook emitting the activities-ready payload) + 12 unit tests; deps table: 7.1 dialer decision marked decided (Twilio), new Twilio-creds gate row (live-call DoD only) | Max (driver) |
| 3.0.1 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 2.2.28 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 2.2.27 | 2026-07-21 | Task 2.0: person→org `org_id` backfill DONE (scripts/backfill-org-links.mjs) — 11/16 people linked to their org with per-link evidence (Sunbiz/DBPR/LinkedIn/Rob-confirmed), 15 `org_memberships` rows incl. secondary affiliations (Gary↔Miga co-owner, Daniella↔Martin Fierro+Oasis, Michael↔Oasis); 5 skips logged where no org row exists (Title Base, Cates, Guest Genie, MLE internal). Idempotent + gated (linked must equal 11). DoD "every human links to their org" now met for every human whose org exists. Remaining on 2.0: UI merge-view check → critic-rob review | Max (driver) |
| 2.2.26 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 2.2.26 | 2026-07-21 | Task 2.0: **0003 APPLIED TO PROD + `ORGS_SPLIT_READS=1` live** (same-increment Vercel deploy, CLI upgraded 37→56 mid-deploy when the old one was rejected). Pre-apply JSON backups in `backups/`; post-apply gates matched the rehearsal run exactly; prod verified via authed curl (32 nodes, 47 edges, 0 null endpoints, quoted/signed/referrer spot-check intact). `scripts/regen-fallback.mjs` made org-aware (merges orgs as company Persons, coalesces paired FKs — fallback would otherwise have silently lost all 16 companies) and fallback regenerated. Remaining on 2.0: person→org `org_id` backfill, UI merge-view check, critic-rob review | Max (driver) |
| 2.2.25 | 2026-07-21 | Task 2.0: adapter dual-schema mode SHIPPED (env-gated `ORGS_SPLIT_READS=1`, off in prod until 0003 applies) — supabaseStore merges `orgs` rows back as entityKind-company Persons, edges coalesce paired person/org FKs, referred_by_org_id coalesced on read; writes route company rows to `orgs` and org-referrers to the paired column so an edit can never fork a record back into `people`. 7 new unit tests on the mappers (15/15 green), build green. Remaining on 2.0: real apply (flip flag same deploy) → UI merge view → critic-rob review | Max (driver) |
| 2.2.24 | 2026-07-21 | Task 2.0: 0003 rehearsed FULL-SQL against live prod data w/ guaranteed rollback (scripts/orgs-split-rehearsal.sql); caught+fixed a 2nd apply-blocker (edges from_id/to_id nulled before NOT NULL dropped → reordered). All gates pass on live data: 32→16+16 recon, 33/47 edges repointed, 0 constraint violations, field-preservation exact. 0003 apply-ready; next = adapter dual-schema reads, then apply + critic-rob | Max (driver) |
| 2.2.23 | 2026-07-21 | Auto-touched (session activity) | prd-autosave.sh |
| 2.2.22 | 2026-07-21 | Task 2.0: migration 0003 amended pre-apply — verbatim column carry into `orgs` (original draft would have destroyed referred_by/relationship/estimate/phase_one on all 17 live company rows); dry-run now enforces a field-preservation gate. Also reverted a stray autosave corruption in the vision-dump title line | Max (driver) |
| 2.1.21 | 2026-07-18 | Auto-touched (session activity) | prd-autosave.sh |
| 2.1.20 | 2026-07-18 | Auto-touched (session activity) | prd-autosave.sh |
| 2.1.19 | 2026-07-17 | Auto-touched (session activity) | prd-autosave.sh |
| 2.1.18 | 2026-07-17 | Auto-touched (session activity) | prd-autosave.sh |
| 1.1 | 2026-07-16 | QE fixes (was 83/100 → 95/100): stage canonicity, base-6.3 supersession, Phase 2 gate, task splits, diagram gating | Max |
| 1.1.1–1.1.10 | 2026-07-16/17 | Auto-touched (session activity) | prd-autosave.sh |
| 2.0 | 2026-07-17 | **VISION AMENDMENT** — Rob's verbal dump folded in: north-star principles, role layers (super-admin/mgmt/rep subtypes + bounty-hunter/booker channels), lead-routing engine (1.14, 5.5), source-context intake (1.15), Rep Cockpit phase P7 (dialer/recording/transcript/AI summary/RAG/deep-scrape briefs/video ingestion), In-Call Buttons phase P8 (proposal/case-study matcher/e-sign/invoice), scout first mission (1.12), Task 1.1 ✅, stack + base-structure questions answered in Decisions Log, Q1–Q3 opened with ASSUMED defaults | Max (Rob directive) |
| 2.2 | 2026-07-21 | SYNC PASS (Rob correction: "be SUPER diligent about the living PRD"): dependencies table reconciled (Supabase ✅, brain-dump ✅, Anthropic key ✅ — estimator live; n8n key now EXPIRED, Rob-gated), Tasks 1.12 + 7.1 ticked w/ artifacts, Task 2.0 in-progress notes. PRD-sync now baked into every driver increment (crm-build-driver-prompt.txt) | Max |
| 2.1 | 2026-07-17 | QE fidelity fixes (92/100, 1 vision gap → closed): Task 7.8 added ("perfect their craft" best-practice surfacing — the one unmapped dump item), OUT clause disambiguated (management analytics vs rep-facing closing help), 7.1 ungated to run parallel, 5.6 booker/bounty-hunter stub added (Q1-gated, can't silently drop), 8.2 screenshot mechanism named (Firecrawl/Playwright), 1.10 DoD now proves rep-view minimalism via fixture | Max |
| 1.0 | 2026-07-16 | Initial PRD — army baseline (CoS + all 5 dept heads); explicitly DRAFT pending Rob's differentiator dump → v2.0 | Max |

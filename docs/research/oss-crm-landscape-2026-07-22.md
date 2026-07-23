# OSS CRM Landscape vs The Network — GitHub Scout Synthesis
**Date:** 2026-07-22 · **Version:** 1.1 (post-triple-check) · **Owner:** Max
**Method:** github-tool-scout skill, 4 parallel research agents (full CRM platforms / stack-native / network-graph / money+docs). **45+ repos evaluated, 51 catalogued below.** Every star/license/push-date pulled live via `gh api` on 2026-07-22 (push dates showing 07-23 are UTC rollover). Independently re-verified by a fact-check pass: **43 repos re-checked, star counts matched live values exactly, all 6 tricky license claims verified against actual LICENSE file text.**
**Scope note:** this settles **build-vs-FORK** (which OSS to adopt/steal). CRM-PRD Task 1.2's weighted **SaaS scorecard** (Attio/Folk/HubSpot Free) still must run per Rob's merit-based rule — nothing here exempts it. Delivers inputs to CRM-PRD Tasks 1.2 (partial), 1.3, 1.4. Task 1.5 (email-sync: Nylas/Unipile/EmailEngine vs DIY Gmail) remains **unresearched** — still queued.
**Spec matched against:** `docs/plans/CRM-REQUIREMENTS-2026-07-17.md` + `docs/plans/PRD-mle-crm-evolution-v1.md` (R1–R14 digest below).

## Requirements key (R1–R14)

| ID | Requirement |
|----|-------------|
| R1 | Deals/pipeline stages (New Lead→…→Signed→Invoiced→Paid→Delivering); PROSPECT→CLIENT on payment |
| R2 | Source-typed activity timeline per person/deal |
| R3 | "Who do I touch today" follow-up engine, stage-aging, overdue pings |
| R4 | Referral-chase queue (promised intro passed, no linked lead) |
| R5 | **Referral network graph: dollars + doors, provenance chains — THE differentiator** |
| R6 | FTS, dedup/merge, CSV import/export, audit trail |
| R7 | Roles (owner/rep) + Postgres RLS + field-level visibility |
| R8 | Authenticated lead-intake API (per-product bearer tokens, idempotency) |
| R9 | Receivables: installment plans, due/overdue reminders, loud overdue |
| R10 | Versioned agreements (complete/superseded) + invoices PAID vs OPEN + PDF links |
| R11 | Thousands of accounts; searchable/filterable lists |
| R12 | AI enrichment/estimation hooks |
| R13 | Email capture → timeline; call-outcome webhooks |
| R14 | Stack fit: Next.js App Router + TS + Supabase/Postgres |

## Headline findings (all 4 agents converged; devil-advocate + fact-check confirmed)

1. **R5 is unserved by the entire OSS ecosystem.** 45+ repos across every category: zero model door-value alongside dollar-value, zero implement intro-promise chasing as schema. The Network's Person+Edge model is already ahead of the whole category. **The graph is the moat — never adopt a base that fights it.** (This is the primary reason to reject every fork; license is the second reason.)
2. **The license wall is real — but secondary.** Every at-scale "complete CRM" is AGPL or worse: Twenty (AGPL + commercial-marked files), EspoCRM, Frappe CRM, SuiteCRM, Monica, Documenso, DocuSeal, Midday (all AGPL), erxes (AGPL + SaaS non-compete), Invoice Ninja (Elastic 2.0 — white-label costs a fee), Akaunting (BSL, not open source). AGPL is manageable while Rob merely self-hosts; it becomes an **irreversible rewrite-at-the-worst-moment** trap if the Phase 6 productization trigger or the white-label title-company play ever fires. The MIT survivors are precisely the schema-donor / parts-bin tier — which fits "evolve The Network" better than any wholesale adoption. Every AGPL rejection below also holds on license-independent grounds (stack, graph-as-bolt-on).
3. **R9 installment receivables exist nowhere in OSS in usable form.** Best-in-category (Invoice Ninja) models a single deposit (`partial`/`partial_due_date`), not N-installment schedules; the closest concept anywhere is CiviCRM's nonprofit pledge schedules (AGPL/PHP — reference only). This must be ~3 Supabase tables Rob owns. (Stripe payment plans considered and rejected on the record: first real case pays by *checks*, and Rob requires in-dashboard visibility of ledger truth — a processor can be added later without schema change.)
4. **Recommendation: BUILD on The Network, using MIT donors — do not fork a base CRM.** Fork ≈ 13–20 dev-days to reach parity-plus-graph and leaves two frontends; evolve ≈ 8–15 dev-days with donors and ends in one owned codebase. Detail + per-task effort in Blueprint below.

## Next actions (the Monday answer)

1. **Rob:** differentiator brain-dump (CRM-PRD Task 1.1) — still the gate for any Phase 2 build. Donor priorities below are provisional until it lands (e.g., heavier doc-workflow → DocuSeal moves earlier).
2. **Max, first build move (post-gate):** adapt atomic-crm's Supabase migrations (activity_log view, RLS policies, imports) into `supabase/migrations/0002_crm_core.sql` (~2–3 days incl. contract tests).
3. **Max, second build move:** re-implement nextcrm-app's Invoice_*/ApiKeys patterns as Supabase tables + `/api/leads` bearer-token route (~3–4 days), and stand up the receivables tables seeded from the contracts-repo ledgers (~2 days).

---

## The catalog — all repos, ranked by role

### Tier 1 — Direct donors (MIT, act on these)

| Repo | URL | Stars | License | Stack | What it is | Take |
|------|-----|-------|---------|-------|-----------|------|
| marmelab/atomic-crm | https://github.com/marmelab/atomic-crm | 1,157 | MIT | React/Vite + react-admin + **Supabase** | Full CRM designed to be forked, by the react-admin company (740 forks vs 1,157 stars) | **Schema base.** `supabase/migrations/` is production-grade: per-table RLS, `activity_log` UNION view (R2), CSV import, deals kanban stages (R1). Dedup/merge exists as a Supabase **edge function** (`supabase/functions/merge_contacts` — upstream dropped the SQL fn 2025-12-04), so port the logic, don't expect liftable SQL for that piece. Email CC-to-capture (R13) pattern too. |
| pdovhomilja/nextcrm-app | https://github.com/pdovhomilja/nextcrm-app | 660 | MIT | **Next.js 16 App Router + TS + shadcn** + Prisma/Postgres | Widest-coverage MIT CRM; exact front-end stack match | **Reference for re-implementation (~40% time-save), not a lift.** Schema carries Mongo-migration scars (`__v` fields, stringly-typed `annual_revenue String?`) — re-derive with proper types. Mine: Invoice_* models (R9/R10), Activities+ActivityLinks (R2), AuditLog (R6), Bearer-token API/MCP layer (R8), enrichment + pgvector models (R12), email client (R13). Bus-factor-1: fork-and-own, never track. |
| al1abb/invoify | https://github.com/al1abb/invoify | 6,325 | MIT | Next.js + TS + shadcn | Invoice generator (PDF via Puppeteer) | **Lift** `app/api/invoice/generate\|export\|send` routes + templates near-verbatim (near-standalone code) for the "generate invoices from CRM" phase. |
| shadcnblocks/kibo | https://github.com/shadcnblocks/kibo | 3,869 | MIT | shadcn registry | Component registry: kanban (dnd-kit), table, relative-time, status | **UI blocks** for R1 kanban + R11 tables. Install per-component via shadcn CLI, zero architectural commitment. |
| alephdata/followthemoney | https://github.com/alephdata/followthemoney | 279 | MIT | Python/YAML schema | OCCRP investigative entity/edge data model | **R5 pattern gold:** relationship records as first-class time-bounded entities with source provenance (`recordId`, start/end dates); child schemata declare typed `edge:{source,target}` with named inverses. The formal skeleton for referral-provenance chains. |
| soldatov-ss/django-referral-system | https://github.com/soldatov-ss/django-referral-system | 55 | MIT | Django | Referral/commission tracker | **R4/R5 pattern:** 3-table provenance ledger `Promoter → Referral(status enum) → Commission`. Swap commission-$ for door-value: `Person → Intro(promised/made/converted) → ValueEvent(est_revenue, est_new_nodes, probability)`. The status enum IS the chase queue. |
| timDeHof/shadcn-timeline | https://github.com/timDeHof/shadcn-timeline | 313 | MIT | shadcn/TS | Timeline primitive | R2 UI shell; pair with atomic-crm's activity_log view. |
| carlassmann/tilly | https://github.com/carlassmann/tilly | 64 | MIT | TS PWA | Relationship journal | R2/R3 journal-per-person UX patterns; MIT code usable. |

> **MIT attribution handling (pre-empting the strategy-rule tension):** MIT legally requires retaining copyright notices on copied code. Resolution: all notices live in a repo-level `THIRD-PARTY-LICENSES.md` — never on user-facing surfaces, never in marketing. Satisfies the license AND Rob's no-upstream-attribution rule for what users see.

### Tier 2 — Run as isolated sidecar service (AGPL contained behind API)

| Repo | URL | Stars | License | What | Take |
|------|-----|-------|---------|------|------|
| docusealco/docuseal | https://github.com/docusealco/docuseal | 18,074 | AGPL (server) / **MIT embeds** | Most-starred OSS e-sign (Rails) | R10 agreement lane: self-host untouched, drive via REST API + webhooks; [`docuseal-react`](https://github.com/docusealco/docuseal-react) embed verified MIT. Feature-richer of the two. Verify needed embed mode is free-tier (some are paid Pro). |
| documenso/documenso | https://github.com/documenso/documenso | 14,093 | AGPL | DocuSign alternative (Next.js/TS/Prisma) | Alternative pick if we want a TS codebase we can read; its Webhook/ApiToken/DocumentAuditLog schema is also a clean R8/R6 study. Never vendor code. |

### Tier 3 — Schema/pattern reference only (license or stack blocks code reuse)

| Repo | URL | Stars | License | Why it matters | Blocker |
|------|-----|-------|---------|----------------|---------|
| twentyhq/twenty | https://github.com/twentyhq/twenty | 53,467 | AGPL + commercial-marked files | Best-engineered CRM data model in OSS (metadata→auto REST/GraphQL, role-scoped API keys); study clean-room for custom objects | AGPL kills fork + white-label; NestJS/Redis ≠ our stack; graph would become a bolt-on |
| mattogodoy/nametag | https://github.com/mattogodoy/nametag | 1,026 | AGPL | Structural twin of Person+Edge in Next.js/TS/Prisma/D3: inverse-paired user-defined RelationshipTypes, soft-deleted edges, "indirect connection" ego-edge | AGPL — ideas only |
| sneg55/pingcrm | https://github.com/sneg55/pingcrm | 103 | AGPL | Best "who do I touch today" engine found: two-pool slot-limited queue, deterministic tier ladders, event bonuses, cooldowns — matches our scoring-in-code rule | AGPL — re-derive |
| monicahq/monica | https://github.com/monicahq/monica | 24,888 | AGPL | Relationship-type taxonomy (inverse labels), stay-in-touch cadence | AGPL, PHP, momentum fading (push 2026-04-24, 786 issues) |
| civicrm/civicrm-core | https://github.com/civicrm/civicrm-core | 757 | AGPL | Only full CRM with first-class typed directional contact↔contact relationships; granular Activity model; **pledge installment schedules = closest R9 concept in OSS** | AGPL, PHP-in-CMS |
| espocrm/espocrm | https://github.com/espocrm/espocrm | 3,156 | AGPL | Only CRM with shipped **field-level permissions** (R7 reference) + real dedup/merge UX (R6) | AGPL, PHP |
| krayin/laravel-crm | https://github.com/krayin/laravel-crm | 23,458 | MIT | Highest-star MIT true CRM (Webkul-backed); lead/pipeline/quote schema safe to copy | PHP/Laravel — patterns only despite MIT |
| midday-ai/midday | https://github.com/midday-ai/midday | 14,636 | AGPL | Invoice status + overdue UX + inbox→record matching in Next/Supabase | AGPL; not practically self-hostable |
| InvoiceShelf/InvoiceShelf | https://github.com/InvoiceShelf/InvoiceShelf | 1,762 | AGPL | Clean invoice/payment/estimate migrations (Crater successor) | AGPL, PHP |
| frappe/crm | https://github.com/frappe/crm | 3,003 | AGPL | Nicest unified timeline + telephony-webhook (Twilio) pattern for R13 | AGPL, Python/MariaDB/Vue |
| ArnasDon/wacrm | https://github.com/ArnasDon/wacrm | 1,676 | MIT | Stack-identical (Next+Supabase+RLS): blanket RLS + account_sharing RPCs + custom_fields migrations | 3 months old, WhatsApp-welded; forks(4,380)>stars anomaly |
| djaiss/peopleOS | https://github.com/djaiss/peopleOS | 27 | MIT | `Encounter` primitive (meetings as objects ≠ notes) | **Archived** (last push 2025-08), PHP |
| datenknoten/freundebuch | https://github.com/datenknoten/freundebuch | 2 | AGPL | Honest hand-written SQL for contact↔contact edges + circles | Tiny, AGPL |
| harperreed/crm | https://github.com/harperreed/crm | 26 | **none** | Simplest viable generic typed edge (Go) | No license = all rights reserved |
| vasturiano/react-force-graph | https://github.com/vasturiano/react-force-graph | 3,245 | MIT | Graph viz upgrade path (directional link particles = animated referral flow) | Viz only |
| SolidInvoice/SolidInvoice | https://github.com/SolidInvoice/SolidInvoice | 939 | MIT | Only genuinely-MIT full invoicing app (quote→invoice conversion) | PHP/Symfony; fallback only |
| invoiceninja/invoiceninja | https://github.com/invoiceninja/invoiceninja | 9,898 | **Elastic 2.0** | Closest single tool to R9+R10+R1 (deposits, reminders, client portal) | Source-available NOT OSS; white-label = paid license ([docs](https://invoiceninja.github.io/docs/legal/license), [forum](https://forum.invoiceninja.com/t/white-label-licence/12737)); PHP |

### Rejected loudly (so nobody asks "why not X")

- **Twenty as base** — AGPL + [commercial `@license Enterprise` files in-repo](https://github.com/twentyhq/twenty/blob/main/LICENSE); stack replacement, graph demoted to bolt-on
- **SuiteCRM** ([repo](https://github.com/salesagility/SuiteCRM)) — AGPL, 2013-era SugarCRM fork, 1,415 open issues, v8 rewrite 5+ years "in progress"
- **Odoo** ([repo](https://github.com/odoo/odoo)) — LGPL ERP cruise-ship; CRM inseparable from ~80 modules
- **erxes** ([repo](https://github.com/erxes/erxes)) — **worst license in scout:** AGPL + `ee/` + literal LICENSE.md clause "not permitted to be hosted as a SaaS version to compete with erxes Inc."
- **Corteza** ([repo](https://github.com/cortezaproject/corteza)) — Apache-2.0 but low-code abstraction you configure rather than schema you own; no new major release since the 2024.9 line (Sept 2024; only patch releases since, latest 2024.9.9 on 2026-06-01), velocity weakest of the actives (39 commits/90d)
- **refine app-crm** ([notice](https://github.com/refinedev/refine/tree/main/examples/app-crm)) — flagship CRM example **moved to Enterprise Edition**; and adopting refine-the-framework (MIT) was weighed and rejected on the record: it means rewriting The Network's existing screens into refine's hook model with an Ant-vs-shadcn clash — loses to kibo+shadcn on stack fit
- **customermates** ([repo](https://github.com/customermates/customermates)) — AGPL + commercial `ee/`, 4-month-old, 2 contributors: Twenty's license posture without Twenty's maturity
- **Akaunting** ([repo](https://github.com/akaunting/akaunting)) — LICENSE.txt is **Business Source License** (MariaDB BSL text): not open source
- **Crater** ([repo](https://github.com/crater-invoice/crater)) — dead: last push 2024-08-10; use InvoiceShelf fork
- **Lago / Kill Bill** — subscription/metered billing, wrong shape for 2-installment consulting deals (Kill Bill is Apache but enterprise-Java overkill)
- **OpenSign** ([repo](https://github.com/OpenSignLabs/OpenSign)) — dominated by DocuSeal/Documenso on every axis; AGPL with nonstandard carve-outs
- **InvoicePlane** — no REST API in stable v1 (fails R8); trademark-restricted license
- **claudia** ([repo](https://github.com/kbanc85/claudia)) — closest UX concept to R4 promise-chasing, but PolyForm **Noncommercial** license = hard disqualifier
- **builderz-labs/marketing-dashboard** — integrity red flag: 396★ with **0 forks, 1 contributor** = bought-stars pattern; do not trust
- **jakobo/kit** — 404 (does not exist)
- **Vtiger** ([repo](https://github.com/vtiger-crm/vtigercrm)) — Sugar Public License 1.1.2-derived VPL, SourceForge-centric mirror
- **Stripe payment plans (non-OSS lane) for R9** — rejected on record: first receivable is check-paid; ledger truth must live in-dashboard; a processor can bolt on later without schema change
- **NocoDB/Baserow/Teable (Airtable-likes)** — would fail R5/ownership identically; not individually scored

---

## Alignment matrix — top candidates × requirements

✅ shipped · ◐ partial/pattern · ✖ absent

| Requirement | atomic-crm | nextcrm-app | Twenty | DocuSeal/Documenso | invoify | nametag | pingcrm | ftm* | The Network today |
|---|---|---|---|---|---|---|---|---|---|
| R1 pipeline | ✅ | ✅ | ✅ | ✖ | ✖ | ✖ | ✖ | ✖ | ◐ (statuses, no deals) |
| R2 timeline | ✅ | ✅ | ✅ | ◐ audit | ✖ | ◐ | ◐ | ✖ | ✖ |
| R3 touch-today | ✅ tasks | ✅ tasks | ✅ | ✖ | ✖ | ◐ | ✅✅ | ✖ | ✖ |
| R4 referral-chase | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| R5 network graph | ✖ | ✖ | ✖ | ✖ | ✖ | ◐ edges | ✖ | ◐ pattern | **✅ unique** |
| R6 lifecycle | ✅✅ | ✅ | ✅ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| R7 RLS/roles | ✅ RLS | ◐ app-level | ✅ app-level | ◐ | ✖ | ✖ | ✖ | ✖ | ✖ |
| R8 intake API | ◐ | ✅ tokens | ✅ | ✅ | ◐ | ✖ | ✖ | ✖ | ✖ |
| R9 receivables | ✖ | ✅ invoices | ✖ | ✖ | ◐ gen | ✖ | ✖ | ✖ | ✖ (in contracts repo) |
| R10 doc status | ✖ | ✅✅ | ✖ | ✅✅ | ◐ | ✖ | ✖ | ✖ | ✖ (in contracts repo) |
| R11 scale | ✅ | ✅ | ✅ | — | — | — | — | — | ◐ |
| R12 AI hooks | ◐ | ✅✅ | ◐ | ✖ | ✖ | ✖ | ✅ | ✖ | ✅ estimator |
| R13 email/call | ✅ CC-capture | ✅✅ client | ✅ | ◐ | ✖ | ✖ | ✖ | ✖ | ✖ |
| R14 stack | ◐ Supabase✅/Vite✖ | ◐ Next✅/Prisma✖ | ✖ | ◐/✖ | ✅✅ | ◐ | ✖ | ✖ | ✅✅ |
| License for white-label | MIT ✅ | MIT ✅ | 🚨 AGPL | 🚨 AGPL (MIT embeds) | MIT ✅ | 🚨 AGPL | 🚨 AGPL | MIT ✅ | owned |

*ftm = alephdata/followthemoney (pattern source, not a CRM)

**Read of the matrix:** no single repo covers even half the spec with a usable license+stack. The two MIT donors (atomic-crm schema layer, nextcrm-app feature layer) jointly cover R1/R2/R3/R6/R7/R8/R9/R10/R12/R13 as source material. R4+R5 exist nowhere — they're the build. That's the blueprint.

---

## Blueprint — how this maps onto The Network

### Decision: **Evolve The Network (Option A), don't fork a base CRM (Option B)** — with effort numbers

**Option B steel-manned (devil-advocate pass):** forking atomic-crm gets a running CRM in ~3–5 dev-days (R1/R2/R3/R6/R7 work day one). But it then pays: porting the live Person+Edge graph + door-value estimator + D3 views into a Vite/react-admin SPA (react-admin is a CRUD framework — hostile territory for a custom force-graph centerpiece, ~10–15 days), permanently maintaining a second frontend stack, and **R4/R5/R9/R10 still get built from scratch either way** — the fork saves nothing on the four requirements that are the point.

| Path | Est. dev-days to CRM parity + graph intact | Frontends to maintain | Ends with |
|---|---|---|---|
| **A: Evolve The Network + MIT donors** | **~8–15** | 1 (Next.js) | One owned codebase, moat native |
| B1: Fork atomic-crm, port graph in | ~13–20 | 1 (Vite/react-admin — replaces current) | Someone else's architecture, graph as guest |
| B2: Fork nextcrm-app | ~12–18 (Prisma→Supabase + RLS rebuild) | 1 (Next.js) | Bus-factor-1 upstream, Mongo-scarred schema |
| B3: Self-host Twenty | ~5 setup + graph impossible to integrate | 2 | AGPL trap, moat orphaned |
| Hybrid: run atomic-crm **unforked** beside dashboard on same Supabase project | ~1–2 | 2 | Interim CRM UI this week — but two systems of record, RLS/auth policy collision, throwaway work. Weighed; rejected unless Rob wants a stopgap before Phase 2 |

*Estimates are Max's planning figures (± the usual 50% software error bars), stated so Option A vs B is a quantified delta, not vibes. The formal weighted composite scorecard incl. SaaS options = CRM-PRD Task 1.2, still owed.*

**Option A wins:** The Network already has the ONE thing nobody ships (R5), the exact stack (R14), and a live deployment. The gaps (R1–R3, R6–R13) are exactly what the MIT donor tier provides as proven schema + adaptable code.

### Cost of ownership (the honest section — devil-advocate's strongest objection)

A homemade CRM as company system-of-record means: no vendor SLA, no community, no upgrade path, migrations authored in AI sessions, reps onboarding onto undocumented software. This is the real price of Option A and it is not free. Mitigations, all already in or now added to the CRM PRD:
- **Boring SQL over clever abstractions** — minimal schema surface, no runtime metadata magic (Twenty's cleverness is exactly what we don't self-maintain)
- **Contract tests as executable documentation** (CRM-PRD Task 2.3: both storage adapters pass identical suites)
- **Failure-mode doc + watchdogs + credential-expiry alerts** (CRM-PRD Tasks 3.6–3.8)
- **File-store fallback guarantee** — UI functional even if Supabase is unreachable (base-PRD invariant)
- **Quarterly dependency-update ritual** — add to ops cadence
Why this still beats the alternatives: forking doesn't fix bus-factor (drift makes you sole maintainer of someone else's architecture — strictly worse), and SaaS can't rent R5 — Rob would run two systems anyway. The SaaS option gets its fair weighted hearing in Task 1.2.

### Concrete mapping to CRM-PRD tasks (with effort)

| CRM-PRD task | Donor material | Action | Est. days |
|---|---|---|---|
| 2.1 Migration `0002_crm_core.sql` (deals/activities/tasks) | atomic-crm `supabase/migrations/` ([init](https://github.com/marmelab/atomic-crm/blob/main/supabase/migrations/20240730075029_init_db.sql), activity_log view); nextcrm-app models as reference | Adapt (MIT): deals w/ stage enum from Task 1.6, activities source-typed, tasks. Add `intros` table (R4/R5 below) | 2–3 |
| 2.4 Deal scoring module | pingcrm two-pool ladder design (AGPL — re-derive concept only) | `lib/scoring/deal.ts` per scoring-pattern rule — deterministic ladders, `asOf` param | 1 |
| 2.5 Kanban + timeline UI | kibo kanban + shadcn-timeline; atomic-crm screens as visual reference | Install kibo components; build on shadcn | 2–3 |
| 2.6 "Needs action today" endpoint | pingcrm two-pool queue concept (re-derive) | Active + dormant-revival pools, slot-limited, threshold ladders in code | 1–2 |
| 1.8 + new: Referral-chase (R4) + provenance (R5) | django-referral-system 3-table ledger (MIT) + followthemoney dated/sourced edges (MIT) + nametag inverse-typed soft-deleted edges (AGPL — ideas) | **The differentiator build:** `intros(from_id, to_id, status: promised\|made\|converted, promised_at, evidence_activity_id)` + `value_events(est_revenue, est_new_nodes, probability)`; edges get `startDate`/evidence provenance; `promised` + past-date + no linked lead = chase queue | 3–4 |
| 4.1–4.3 FTS/dedup/CSV | atomic-crm imports migration SQL (directly adaptable) + merge logic from its `supabase/functions/merge_contacts` **edge function** (port to our stack) | Adapt | 2–3 |
| 4.6 RLS roles | atomic-crm RLS policies + wacrm `account_sharing` RPC migrations (both MIT); EspoCRM field-level ACL as design reference | Adapt policy SQL; field-level visibility via column-scoped views | 2 |
| 4.7 Audit trail | nextcrm-app `crm_AuditLog` + Documenso `DocumentAuditLog` (study) | Adapter-layer status_change logging | 1 |
| 5.1–5.2 `/api/leads` tokens | nextcrm-app ApiKeys/Bearer pattern (reference) + Documenso ApiToken schema (study) | Implement per-product tokens + idempotency | 1–2 |
| R9 receivables (fold into Phase 2 migration) | **Build — nothing usable in OSS.** midday/InvoiceShelf schemas + CiviCRM pledge concept as references | 3 tables: `receivables`, `installments`, `payments`; seed from `invoice-ledger.csv` via extended organize.py upsert; overdue = loud red + dashboard-open banner | 2 |
| R10 agreements | DocuSeal self-hosted sidecar (API+webhooks, MIT React embed) — OR keep surfacing contracts-repo ledgers first | **Phase now:** surface `agreement-ledger.csv`/`invoice-ledger.csv` state in CRM (read JSONs/ledgers, never filenames). **Phase later:** DocuSeal for in-app signing; webhook flips status | 1 now / 2–3 later |
| Invoice generation (later) | invoify MIT routes + Puppeteer PDF service (near-verbatim lift) | Lift when "generate from CRM" phase arrives | 1–2 |
| R13 email capture | atomic-crm CC-capture pattern + n8n (base-PRD Task 3.2); **Task 1.5 (Nylas/Unipile/EmailEngine vs DIY) still unresearched** | n8n stays the ingestion spine per existing PRD | per base PRD |

### What stays custom forever (the moat)
- Person/Edge graph with edge kinds + door-value (`estimate` on nodes, value_events on intros)
- Provenance chains back to Rob ("every chain traces back to Rob")
- Door-open score + AI network-value estimator (Rob-only fields)
- Referral-chase queue driven by intro status enums

### Sequencing + PRD hygiene notes
- Blueprint plugs into the existing CRM-PRD phase order unchanged. Still gated on **Task 1.1 — Rob's differentiator dump**; donor priorities are provisional until it lands. Direction of risk favors this doc: any differentiator dump adds *custom* requirements, which strengthens build-on-owned-code and weakens every fork option further.
- **PRD hygiene flag (verified on disk):** the CRM PRD's dependency table lists base-PRD Task 1.2 (Supabase adapter) as *open*, but `lib/storage/supabaseStore.ts` + `fileStore.ts` + migrations `0001_network`…`0005_edge_kind` exist in the repo — the adapter appears materially complete. Reconcile the base PRD.
- Nothing found contradicts the Supabase decision; everything reinforces it (both MIT donors are Postgres-native, one Supabase-native).

---

## Build-vs-fork verdict (input to CRM-PRD Task 1.2 — which still owes the weighted SaaS scorecard)

| Option | Ownership | License risk | Stack fit | R-coverage w/o build | Graph moat | Est. days | Verdict |
|---|---|---|---|---|---|---|---|
| Evolve The Network + MIT donors | 100% owned | None | Native | n/a (build w/ donors) | Preserved | 8–15 | **✅ RECOMMENDED** |
| Fork atomic-crm | High | MIT clean | Supabase ✅ / Vite ✖ | ~6/14 | Bolt-on | 13–20 | Schema donor instead |
| Fork nextcrm-app | High | MIT clean | Next ✅ / Prisma ✖ | ~9/14 | Bolt-on | 12–18 | Parts bin instead |
| Self-host Twenty | Low (their infra) | 🚨 AGPL+commercial | ✖ | ~8/14 | Lost | n/a | Study only |
| SaaS (Attio/Folk/HubSpot Free) | None | Rented | n/a | varies | Lost (can't rent R5) | n/a | **Out of scope for an OSS scout — merit-based weighted scorecard = CRM-PRD Task 1.2, still to run** |

---

## Sources

**Primary (all repo stats/licenses/file paths):** live `gh api` / `gh repo view` / `gh search code` on 2026-07-22, account blacklabelbob; push dates rendered 2026-07-23 are UTC rollover. License claims for the six tricky cases read from actual in-repo LICENSE files: [Twenty](https://github.com/twentyhq/twenty/blob/main/LICENSE) (AGPL + `@license Enterprise` files), [Invoice Ninja](https://github.com/invoiceninja/invoiceninja/blob/master/LICENSE) (Elastic 2.0), [Akaunting](https://github.com/akaunting/akaunting/blob/master/LICENSE.txt) (BSL), [erxes](https://github.com/erxes/erxes/blob/main/LICENSE.md) (AGPL + SaaS non-compete), [claudia](https://github.com/kbanc85/claudia) (PolyForm Noncommercial), [harperreed/crm](https://github.com/harperreed/crm) (no license file). Independent fact-check pass re-verified 43 repos: 41 exact, 2 minor wording fixes (applied above), 0 critical.

**Secondary (non-API claims):**
- Marmelab OSS CRM benchmark (COI — atomic-crm authors): https://marmelab.com/blog/2025/02/03/open-source-crm-benchmark-for-2025.html
- Twenty vs EspoCRM (deploy/RAM/maturity): https://use-apify.com/blog/twenty-crm-vs-espocrm-2026
- Twenty production-readiness + gaps: https://prospeo.io/s/twenty-pricing-reviews-pros-and-cons · https://dev.to/vardhaman619/my-experience-with-modern-open-source-crm-twenty-crm-2hen
- Twenty API capabilities: https://docs.twenty.com/developers/extend/capabilities/apis
- Invoice Ninja white-label license: https://invoiceninja.github.io/docs/legal/license · https://forum.invoiceninja.com/t/white-label-licence/12737
- DocuSeal vs Documenso: https://openalternative.co/compare/documenso/vs/docuseal · https://sliplane.io/blog/5-open-source-docusign-alternatives
- Nametag Show HN (graph-PRM demand signal): https://news.ycombinator.com/item?id=46599958
- Monica v5 stall: https://github.com/monicahq/monica/discussions/7321 · https://github.com/monicahq/monica/issues/6626
- Awesome lists: https://github.com/sneg55/awesome-open-source-crm · https://awesome-selfhosted.net/tags/money-budgeting--management.html

**Full agent reports (raw evidence, preserved):**
- [Slice 1 — full CRM platforms](./agents/2026-07-22-slice1-full-crm-platforms.md)
- [Slice 2 — stack-native Next.js/Supabase](./agents/2026-07-22-slice2-stack-native.md)
- [Slice 3 — network-graph/personal CRMs](./agents/2026-07-22-slice3-network-graph.md)
- [Slice 4 — money + documents](./agents/2026-07-22-slice4-money-docs.md)

**Revision history:** v1.0 2026-07-22 initial synthesis · v1.1 2026-07-22 triple-check applied (fact-check: 2 corrections + 3 precision notes; devil-advocate: 7 amendments incl. build-vs-fork retitle, cost-of-ownership section, dev-day estimates, nextcrm verb downgrade; critic-rob: sources pinned, agent reports archived, Monday actions, MIT-attribution handling)

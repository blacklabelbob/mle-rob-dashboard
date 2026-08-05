# Agent Report — Slice 1: Full open-source CRM platforms (fork-base or schema reference)
**Run:** 2026-07-22 · github-tool-scout methodology · all numbers live via `gh api` (account blacklabelbob)
**Feeds:** docs/research/oss-crm-landscape-2026-07-22.md

**Method note:** All star/fork/push/license numbers came from `gh api repos/<owner>/<repo>` on 2026-07-22/23 (UTC). Commit velocity = commits since 2026-04-23, capped at 100. Nothing estimated. Vtiger checked and dropped (vtiger-crm/vtigercrm: 255 stars, VPL 1.1 license, GitHub is a secondary mirror of SourceForge — fails adoption + license bar simultaneously).

**Framing recap:** R5 (referral network graph with money-can-pay + doors-can-open + provenance chains) exists in **zero** full CRM platforms surveyed. Rob's existing Person/Edge model is already ahead of the entire category on R5. The scouting value here is (a) a permissive-license base that doesn't fight his stack, and (b) schema patterns for R1/R2/R6/R9/R10 that CRMs have spent 15 years refining.

---

### marmelab/atomic-crm
- URL: https://github.com/marmelab/atomic-crm
- Description: A full-featured CRM built with React, shadcn/ui, and Supabase.
- Stars: 1,157 | Forks: 740 | Last push: 2026-07-22 | License: **MIT** | Language: TypeScript | Latest release: v1.5.0
- Stack: React SPA (Vite, not Next.js) + react-admin/Shadcn Admin Kit + shadcn/ui + **Supabase (Postgres, auth, edge functions)** + React Query/Router/Hook Form + Playwright e2e
- Health: 100+ commits in last 90 days; only 14 open issues; maintained by Marmelab (the react-admin company — team-backed, not solo dev); components distributed via Shadcn Registry for updates. Red flag: young project (v1.5.0); fork count (740) unusually high relative to stars — it's marketed explicitly as a fork-and-customize template, which is exactly Rob's use case.
- Alignment: R1 ✅ kanban deal pipeline with configurable stages; R2 ✅ aggregated activity-history logs per contact/deal; R3 ✅ tasks + reminders; R4 ❌; **R5 ❌ (no network graph — nobody has this)**; R6 ✅ contacts, tags, CSV import/export; R7 ⚠️ Supabase auth (Google/Azure/Keycloak/Auth0) but no packaged owner/rep role split — Rob adds RLS himself, and it's already on Supabase so RLS is native; R8 ⚠️ "integrate via API" = Supabase PostgREST + edge functions — bearer-token intake is a thin edge function away; R9 ❌ no invoicing/receivables; R10 ❌; R11 ⚠️ fine at thousands of rows, react-admin datagrids; R12 ⚠️ no AI hooks but edge-function seams exist; R13 ✅ **email-capture-by-CC into activity timeline is a shipped feature**; R14 ✅✅ closest stack match in the entire category (only miss: Vite SPA instead of Next.js App Router)
- Verdict: **BASE-CANDIDATE** — the only surveyed CRM that is simultaneously MIT, Supabase-native, and designed to be forked
- License risk for white-label productization: None — MIT. (Marmelab wrote the "Best Open Source CRM 2025" benchmark that features it — COI noted, repo claims verified directly: https://marmelab.com/blog/2025/02/03/open-source-crm-benchmark-for-2025.html)

### pdovhomilja/nextcrm-app
- URL: https://github.com/pdovhomilja/nextcrm-app
- Description: NextCRM — open-source CRM built with Next.js 16, React 19, PostgreSQL, Prisma 7, shadcn/ui; CRM, projects, invoicing, documents, email client & AI features.
- Stars: 660 | Forks: 242 | Last push: 2026-07-22 | License: **MIT** | Language: TypeScript | Latest release: v0.19.0
- Stack: **Next.js 16 App Router + TS** + PostgreSQL 17 w/ pgvector (migrated off MongoDB) + Prisma 7 + Better Auth + Tailwind v4/shadcn + Inngest jobs + built-in IMAP/SMTP client + OpenAI/Claude enrichment + **MCP server (127 tools, Bearer-token auth)**
- Health: 100+ commits in last 90 days, 1,635 commits total, 35 releases, 23 open issues. Red flags: effectively a **solo maintainer** (Pavel Dovhomilja) at <1k stars — bus factor 1; pre-1.0 (v0.19.0); Prisma not Supabase client (adapter work needed against Rob's StorageAdapter).
- Alignment: R1 ✅ Leads/Opportunities modules with pipeline; R2 ✅ activity tracking (notes/calls/emails/meetings/tasks) + soft-delete audit logs with full change history (also feeds R6 audit trail); R3 ✅ tasks; R4 ❌; **R5 ❌**; R6 ✅ accounts/contacts/leads + audit history; R7 ⚠️ auth yes, owner/rep RLS no (Prisma-level, not Postgres RLS); R8 ✅ **Bearer-token MCP/API access already implemented** — closest existing analog to Rob's per-product intake tokens; R9 ✅ **full invoice lifecycle: draft→issued→paid, line items, multi-currency, tax, PDF, email delivery** — only permissive-license repo in the slice with R9/R10 substance; R10 ⚠️ invoices yes, versioned agreements no; R11 ⚠️ TanStack tables, untested claims at scale; R12 ✅ pgvector semantic search + Claude/OpenAI enrichment workflows built in; R13 ✅ IMAP/SMTP email client; R14 ✅ Next.js+TS+Postgres (miss: Prisma vs Supabase client)
- Verdict: **BASE-CANDIDATE / SCHEMA-ONLY hybrid** — fork candidate on stack grounds, but bus-factor-1 means treat it as a parts bin (invoicing module, audit-log schema, MCP/bearer-token layer) rather than an upstream you track
- License risk for white-label productization: None — MIT. Source for feature claims: https://github.com/pdovhomilja/nextcrm-app README (fetched 2026-07-22)

### twentyhq/twenty
- URL: https://github.com/twentyhq/twenty
- Description: The open alternative to Salesforce, designed for AI.
- Stars: 53,467 | Forks: 8,131 | Last push: 2026-07-23 (UTC) | License: **AGPL-3.0 core + commercial "@license Enterprise" files (dual)** | Language: TypeScript | Latest release: twenty/v2.23.2
- Stack: TypeScript monorepo — NestJS backend + React frontend + PostgreSQL + Redis + GraphQL/REST (auto-generated per workspace schema, incl. custom objects)
- Health: Best in category. 100+ commits/90d, only 108 open issues at 53k stars (exceptional triage ratio), VC-backed company (YC S23), v2.x past the v1.0 "production-ready" line the CTO himself drew (https://prospeo.io/s/twenty-pricing-reviews-pros-and-cons, https://dev.to/vardhaman619/my-experience-with-modern-open-source-crm-twenty-crm-2hen). Community-reported downsides: no mobile app, thin plug-and-play integrations, pre-1.0 era had frequent breaking migrations.
- Alignment: R1 ✅ opportunities/pipeline with custom stages + custom objects for PROSPECT→CLIENT; R2 ✅ timeline activities per record; R3 ✅ tasks; R4 ❌; **R5 ❌** (has generic record relations, not a valued referral graph); R6 ✅ search, import/export, field-level model; R7 ✅ **role-based permissions shipped** (app-level, not Postgres RLS); R8 ✅ API keys scoped to roles, auto-generated REST+GraphQL per custom object (https://docs.twenty.com/developers/extend/capabilities/apis); R9 ❌; R10 ❌; R11 ✅ built for real scale; R12 ⚠️ "designed for AI"/MCP direction, workflow automation; R13 ✅ webhooks on record changes + email sync; R14 ⚠️ TS+Postgres yes, but NestJS+Redis monorepo ≠ Rob's Next.js/Supabase — forking means adopting their entire infra
- Verdict: **SCHEMA-ONLY** — the best-engineered data model in open-source CRM (workspace-scoped metadata → auto API is worth studying), but AGPL kills it as a fork base
- License risk: 🚨 **LOUD FLAG — AGPL-3.0.** Any derivative Rob offers as a hosted/white-labeled product obligates source disclosure of the whole derived work; the "Enterprise"-marked files aren't even AGPL, they're commercial. Study the schema clean-room style; copy zero code.

### krayin/laravel-crm
- URL: https://github.com/krayin/laravel-crm
- Description: Free & open-source Laravel CRM solution for SMEs and enterprises for complete customer lifecycle management.
- Stars: 23,458 | Forks: 1,533 | Last push: 2026-07-17 | License: **MIT** | Language: Blade (Laravel/PHP) | Latest release: v2.2.3
- Stack: Laravel + MySQL + Vue-ish Blade admin
- Health: 100+ commits/90d, 129 open issues, backed by Webkul (the Bagisto company — sustained commercial org). Solid.
- Alignment: R1 ✅ leads/pipelines/stages; R2 ✅ activities; R3 ✅; R4 ❌; **R5 ❌**; R6 ✅ contacts/orgs, import; R7 ⚠️ ACL roles (MySQL, no RLS); R8 ⚠️ REST API package; R9 ⚠️ quotes yes, installment receivables no; R10 ⚠️ quotes/documents basic; R11 ✅; R12 ⚠️ recent AI-lead features; R13 ✅ email parsing into leads; R14 ❌ PHP/Laravel/MySQL — zero stack overlap
- Verdict: **SCHEMA-ONLY** — highest-star MIT-licensed true CRM; its lead/pipeline/quote table design is safe to copy outright (MIT), but the codebase itself is unusable for Rob's stack
- License risk: None — MIT.

### frappe/crm
- URL: https://github.com/frappe/crm
- Description: Fully featured, open source CRM.
- Stars: 3,003 | Forks: 1,249 | Last push: 2026-07-22 | License: **AGPL-3.0** | Language: Vue | Latest release: v1.79.1
- Stack: Frappe Framework (Python) + MariaDB + Vue 3
- Health: Very active (releases weekly), Frappe org-backed (ERPNext company). Fine health, wrong everything else.
- Alignment: R1 ✅ deals/pipeline; R2 ✅ unified activity+communication timeline (one of the nicest implementations — worth a screenshot-level study); R3 ✅; R4 ❌; **R5 ❌**; R6 ✅; R7 ⚠️ Frappe roles; R8 ⚠️ Frappe REST; R13 ✅ email + telephony (Twilio/Exotel call logging into timeline — relevant pattern for Rob's R13 call-outcome webhooks); R14 ❌ Python/MariaDB/Vue
- Verdict: **SCHEMA-ONLY** (timeline + telephony-webhook patterns only) — AGPL + framework lock-in ("Frappe framework has its own conventions and learning curve" — https://use-apify.com/blog/twenty-crm-vs-espocrm-2026)
- License risk: 🚨 AGPL-3.0 — patterns only, no code.

### espocrm/espocrm
- URL: https://github.com/espocrm/espocrm
- Description: EspoCRM – Open Source CRM Application.
- Stars: 3,156 | Forks: 905 | Last push: 2026-07-22 | License: **AGPL-3.0** | Language: PHP | Latest release: 10.0.3
- Stack: PHP + MySQL + custom Backbone-era JS frontend
- Health: Mature (v10), active, small dedicated company. Low RAM footprint (~256–400MB), praised for 5-minute deploys (https://use-apify.com/blog/twenty-crm-vs-espocrm-2026).
- Alignment: R1 ✅; R2 ✅ stream/timeline; R3 ✅; R4 ❌; **R5 ❌**; R6 ✅ incl. dedup/merge — **one of the few with real duplicate-merge UX, the R6 pattern reference**; R7 ✅ granular role + **field-level permissions — the only surveyed CRM with Rob's R7 field-level visibility shipped**; R8 ⚠️ REST API; R9 ⚠️ invoices via paid extension; R13 ✅ email-to-record; R14 ❌ PHP/MySQL
- Verdict: **SCHEMA-ONLY** (steal the field-level ACL design for R7 and merge-flow for R6)
- License risk: 🚨 AGPL-3.0 — patterns only.

### monicahq/monica
- URL: https://github.com/monicahq/monica
- Description: Personal CRM. Remember everything about your friends, family and business relationships.
- Stars: 24,888 | Forks: 2,558 | Last push: 2026-04-24 | License: **AGPL-3.0** | Language: PHP | Latest release: v4.1.2
- Stack: Laravel/PHP + MySQL
- Health: ⚠️ Push 2026-04-24 = 89 days ago, right at the 90-day activity line; 786 open issues; the v5/Chandler rewrite has dragged for years. Momentum is fading.
- Alignment: Mostly ❌ on the R-list (no deals, no receivables, no roles) — **except it is the only candidate whose schema centers person-to-person relationships**: typed relationship entities between contacts, life events, reminders-by-relationship. Closest existing analog to R5's Edge kinds, minus valuation/provenance. R2 ⚠️ per-person activity feed; R3 ✅ reminders/"stay in touch" cadence — a good pattern for Rob's "who do I touch today"; R14 ❌
- Verdict: **SCHEMA-ONLY** (relationship-typing + stay-in-touch cadence patterns for R3/R5)
- License risk: 🚨 AGPL-3.0 — read for ideas, copy nothing.

### civicrm/civicrm-core
- URL: https://github.com/civicrm/civicrm-core
- Description: CiviCRM (Core Application and Framework).
- Stars: 757 | Forks: 889 | Last push: 2026-07-23 (UTC) | License: **AGPL-3.0** | Language: PHP | Latest release: none on GitHub (releases ship via civicrm.org)
- Stack: PHP + MySQL, embeds into Drupal/WordPress/Backdrop
- Health: 20+ year-old nonprofit-sector project, foundation-governed, active daily pushes. Low stars misleading (GitHub is not its community center).
- Alignment: **R5 ⚠️ — the only full CRM with first-class, typed, directional contact-to-contact Relationships** (employer-of, spouse-of, custom types, date-bounded, with permissioned "act on behalf of" chains). No edge valuation or referral provenance, but the `civicrm_relationship` table design (relationship_type + directional labels + start/end dates + is_permission fields) is the single most R5-relevant schema in open source. R2 ✅ activity model famously granular (every touch is an Activity record with type/source/target roles — matches Rob's source-typed timeline); R6 ✅ industrial dedup/merge; R9 ⚠️ pledges/installments exist (nonprofit framing — recurring pledge schedules ≈ Rob's installment plans); R14 ❌ utterly (PHP inside a CMS)
- Verdict: **SCHEMA-ONLY** — highest R5 + R2 + R9 schema value in the slice, least forkable codebase
- License risk: 🚨 AGPL-3.0 — schema concepts only.

### cortezaproject/corteza
- URL: https://github.com/cortezaproject/corteza
- Description: Low-code platform.
- Stars: 2,120 | Forks: 506 | Last push: 2026-07-22 | License: **Apache-2.0** | Language: Go | Latest release: 2024.9.9
- Health: ⚠️ 39 commits/90d (weakest of the actives); latest tagged release 2024.9.9 = ~22 months stale; sponsor company (Planet Crust) pivoting messaging. Drifting.
- Alignment: R1/R2/R3 ⚠️ achievable by configuring its low-code CRM template rather than shipped opinionated features; R7 ✅ RBAC engine genuinely strong; R8 ✅ full REST + auth tokens; **R5 ❌**; R14 ❌ Go/Vue
- Verdict: **REJECT** — permissive license is tempting but you'd be configuring someone else's low-code abstraction instead of owning a schema; release staleness + slowing velocity seal it
- License risk: None (Apache-2.0) — irrelevant given verdict.

### SuiteCRM/SuiteCRM
- URL: https://github.com/SuiteCRM/SuiteCRM
- Stars: 5,589 | Forks: 2,381 | Last push: 2026-07-15 | License: **AGPL-3.0** | Language: PHP | Latest release: v7.15.1
- Health: 1,415 open issues; v7 line is a 2013-era SugarCRM fork; the v8 rewrite has been "in progress" for 5+ years.
- Alignment: R1/R2/R6 ✅ in the legacy-enterprise sense; **R5 ❌**; R14 ❌
- Verdict: **REJECT** — AGPL + legacy PHP + issue backlog; everything it does schema-wise, EspoCRM or CiviCRM does cleaner
- License risk: 🚨 AGPL-3.0.

### odoo/odoo (CRM module)
- URL: https://github.com/odoo/odoo
- Stars: 53,196 | Forks: 33,204 | Last push: 2026-07-23 (UTC) | License: **LGPL-3.0** (community; enterprise modules proprietary) | Language: Python
- Health: Massive company-backed monolith, 10,210 open issues.
- Alignment: R1 ✅, R9/R10 ✅ (full invoicing/accounting), **R5 ❌**, R14 ❌ — but it's an ERP: the CRM is one module of ~80 and cannot be meaningfully extracted.
- Verdict: **REJECT** — wrong-size organism; buying a cruise ship for the lifeboat. Receivables model worth a glance for R9 nomenclature only.
- License risk: ⚠️ LGPL-3.0 — weaker copyleft than AGPL but still copyleft; open-core boundary with proprietary enterprise modules is a known trap.

### erxes/erxes
- URL: https://github.com/erxes/erxes
- Stars: 4,042 | Forks: 1,300 | Last push: 2026-07-22 | License: **AGPL-3.0 + EE directory + explicit "not permitted to be hosted as SaaS to compete with erxes Inc." restriction** (LICENSE.md) | Language: TypeScript | Latest release: 3.0.57
- Health: Active, 940 open issues, plugin microservice architecture (heavy ops).
- Alignment: R1/R2 ✅, R13 ✅ inbox-centric, **R5 ❌**, R14 ⚠️ TS but its own plugin runtime
- Verdict: **REJECT** — LICENSE.md contains a use restriction beyond AGPL, precisely the trap Rob's white-label ambition cannot touch
- License risk: 🚨🚨 **Worst in slice** — AGPL plus a non-compete hosting clause.

---

**Verified but cut (also-rans):** idurar/idurar-erp-crm (8,558★, AGPL-3.0, last push 2026-05-12 — MERN invoicing-first, AGPL kills it); Dolibarr/dolibarr (7,436★, GPL-3.0, PHP ERP); oroinc/crm (680★, OSL-3.0 — network copyleft, Symfony); fatfreecrm/fat_free_crm (3,628★, MIT per MIT-LICENSE file, Ruby — aging Rails, no overlap Krayin doesn't cover better); vtiger-crm/vtigercrm (255★, VPL license); hcengineering/platform (26,995★, EPL-2.0 — PM suite, CRM not its center).

## Ranked top-3 for this slice

1. **marmelab/atomic-crm — BASE-CANDIDATE.** Only repo clearing every hard constraint at once: MIT, Supabase/Postgres-native, shadcn/ui, company-backed, 100+ commits + 14 open issues, explicitly designed to be forked (740 forks vs 1,157 stars). Ships R1/R2/R3/R6/R13 baseline incl. CC-to-capture email→timeline. Costs: Vite/react-admin SPA, not Next.js App Router; nothing for R9/R10. Shape: fork as CRM chassis, keep The Network's Edge graph (R5) as the differentiator layer atomic-crm plugs into — not the other way around.
2. **pdovhomilja/nextcrm-app — BASE-CANDIDATE with a bus-factor asterisk.** Best Next.js-App-Router stack match in existence and only permissive-license repo with real R9 substance, plus Bearer-token API (R8), soft-delete audit logs (R6), pgvector AI enrichment (R12). Held back by: solo maintainer, pre-1.0, Prisma. Use as MIT parts to transplant.
3. **twentyhq/twenty — SCHEMA-ONLY, loudest license warning in the slice.** Category winner on engineering; AGPL+commercial files collide with white-label productization. Study clean-room, copy nothing. No CRM here, Twenty included, has R5's valued referral graph. That stays Rob's moat.

**Sources (non-gh-API claims):**
- https://use-apify.com/blog/twenty-crm-vs-espocrm-2026
- https://prospeo.io/s/twenty-pricing-reviews-pros-and-cons
- https://dev.to/vardhaman619/my-experience-with-modern-open-source-crm-twenty-crm-2hen
- https://docs.twenty.com/developers/extend/capabilities/apis
- https://marmelab.com/blog/2025/02/03/open-source-crm-benchmark-for-2025.html (COI: authors of atomic-crm)
- License texts pulled directly via `gh api repos/<r>/contents/LICENSE*` (Twenty dual-license header, erxes SaaS non-compete clause, Oro OSL-3.0, Odoo LGPL, fat_free_crm MIT)

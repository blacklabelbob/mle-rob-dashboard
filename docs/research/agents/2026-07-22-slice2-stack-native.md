# Agent Report — Slice 2: Stack-native CRMs & partials (Next.js/React/TS/Supabase/react-admin/Refine)
**Run:** 2026-07-22 · github-tool-scout methodology · all numbers live via `gh api` (account blacklabelbob)
**Feeds:** docs/research/oss-crm-landscape-2026-07-22.md

Note upfront: **no candidate models R5 (referral network graph with doors-opened/dollars) — zero repos in this space model person-to-person referral edges. R5 stays a custom build on Rob's existing Edge model; the graph is genuinely his moat.**

### marmelab/atomic-crm
- https://github.com/marmelab/atomic-crm — "A full-featured CRM built with React, shadcn/ui, and Supabase." — 1,157 ★ | 740 forks | pushed 2026-07-22 | **MIT** | TypeScript | v1.5.0 (2026-03-10)
- Stack: **Vite + React SPA (react-admin) — NOT Next.js** — but backend is **pure Supabase with real RLS** (dedicated `sales_policies`, `tags_policy` migrations), PostgREST pagination, shadcn/ui + Radix, TanStack Query, `@hello-pangea/dnd` for the deals kanban. Has `.claude/`, `CLAUDE.md`, `AGENTS.md`, `.mcp.json`.
- Data model (from `supabase/migrations/20240730075029_init_db.sql` + 23 follow-up migrations): `companies`, `contacts`, `contactNotes`, `deals`, `dealNotes`, `sales` (users), `tags`, `tasks`, plus `companies_summary`/`contacts_summary` views. Notable migrations: `20260314120000_activity_log_view.sql` (UNION-ALL event view over companies/contacts/deals/notes, security_invoker=on — exactly the R2 pattern), `20251204172855_merge_contacts_function.sql` (R6 dedup/merge), `20260127140209_imports.sql` (CSV import), `20260128165057_sso_handling.sql`, email/phone as JSONB.
- Health: company-backed (marmelab), 8+ real contributors (fzaninotto 467, slax57 237, jonathanarnault 187…), 100+ commits in last 90 days, 14 open issues.
- Alignment: R1 ✅ (deals kanban w/ custom stages, dnd), R2 ✅ (activity_log view — best-in-slice), R3 ✅ (tasks w/ due dates), R4 ✖, R5 ✖, R6 ✅✅ (merge_contacts fn, CSV import/export, FTS via summary views), R7 ✅ (real Supabase RLS policies per table), R8 ✖ (no token'd intake API), R9/R10 ✖, R11 ✅ (PostgREST Range pagination), R12 partial, R13 partial (inbound email capture in docs), R14 ⚠️ (Supabase ✅, Next.js ✖ — Vite SPA).
- Verdict: **BASE-CANDIDATE (for the Supabase data layer) / SCHEMA-ONLY (for the UI)**
- License risk: none — MIT.

### pdovhomilja/nextcrm-app
- https://github.com/pdovhomilja/nextcrm-app — 660 ★ | 242 forks | pushed 2026-07-22 | **MIT** | TypeScript | v0.19.0 (released 2026-07-22 — same day)
- Stack: **Next.js 16 App Router + TS + shadcn/ui + Prisma 7 on plain Postgres** — NOT Supabase, no RLS (app-level auth). MCP server, e2b sandbox, docker-compose.
- Data model (from `prisma/schema.prisma` — 100+ models): `crm_Accounts`, `crm_Leads`, `crm_Contacts`, `crm_Opportunities` + `crm_Opportunities_Sales_Stages`, `crm_Activities` + `crm_ActivityLinks` (typed activity w/ links — R2), `crm_AuditLog`, `Tasks`/`Boards`, **`Invoices` + `Invoice_LineItems` + `Invoice_Payments` + `Invoice_Series` + `Invoice_TaxRates` + `Invoice_Activity` (R9/R10)**, `crm_Contracts` + `crm_ContractLineItems`, `Documents` + junction tables, `crm_Contact_Enrichment`/`crm_Target_Enrichment` (R12), `crm_Embeddings_*` + `crm_Document_Chunks` (pgvector), `EmailAccount`/`Email`/`EmailsToContacts` (R13), `ApiKeys`/`ApiToken` (R8), campaigns, calendar connections, report scheduling.
- Health: solo maintainer (pdovhomilja: 1,098 commits; next human contributor: 5) — **bus factor 1**, but very active: 100+ commits/90d, release cut day-of-scan, 23 open issues.
- Alignment: R1 ✅, R2 ✅, R3 ✅, R4 ✖, R5 ✖, R6 ✅ (AuditLog; dedup/merge not seen), R7 partial (AppRole enum, no RLS), R8 partial (ApiKeys/ApiToken models), R9 ✅✅, R10 ✅✅, R11 ✅, R12 ✅✅, R13 ✅✅, R14 ⚠️ (Next App Router+TS+shadcn ✅, Prisma ✖).
- Verdict: **BASE-CANDIDATE (feature/schema donor)** — richest R-coverage in the slice; cost = Prisma→Supabase translation + RLS + solo-maintainer risk (fork it, don't depend on it).
- License risk: none — MIT.

### refinedev/refine (+ examples/app-crm-minimal)
- https://github.com/refinedev/refine — 35,357 ★ | 3,165 forks | pushed 2026-06-05 | **MIT** | TypeScript | @refinedev/core@5.0.12 (2026-04-02)
- **`examples/app-crm` README now reads "This example has been moved to the Enterprise Edition"** — community CRM is only `app-crm-minimal`: Vite + Ant Design + nestjs-query GraphQL against refine's hosted demo API. Not Supabase, not shadcn, not Next.
- Health: org-backed, 63 open issues; commit cadence slowed; flagship CRM example pulled into EE = monetization-direction red flag.
- Verdict: **REJECT as CRM source / marginal TACK-ON as framework** — adopting refine means rewriting The Network's screens into refine's hook model with an Ant-vs-shadcn clash.
- License risk: framework MIT; full CRM example now commercial EE — flagged.

### twentyhq/twenty
- https://github.com/twentyhq/twenty — 53,467 ★ | 8,131 forks | pushed 2026-07-23 (UTC) | **AGPL-3.0 + commercial dual** ("certain files… /* @license Enterprise */") | TypeScript | v2.23.2
- Stack: NestJS + GraphQL backend, React SPA (Recoil/Emotion) — monorepo, own metadata-driven ORM. Not Next.js, not Supabase, not embeddable. Metadata-driven model — nothing liftable as SQL.
- Verdict: **REJECT for this slice** — can't tack a NestJS/GraphQL monolith onto a Next+Supabase dashboard; AGPL+enterprise files poison for white-label.
- License risk: **HIGH.**

### ArnasDon/wacrm
- https://github.com/ArnasDon/wacrm — "Self-hostable CRM template for WhatsApp" — 1,676 ★ | **4,380 forks (forks > stars — anomalous; flag)** | pushed 2026-07-21 | **MIT** | TypeScript | created **2026-04-16 (3 months old)**
- Stack: **Next.js + TS + Supabase, RLS on every table** (`supabase/migrations/001_initial_schema.sql`), shadcn.
- Data model: `contacts`, `tags`, `contact_tags`, `custom_fields` + `contact_custom_values`, `contact_notes`, `conversations`, `messages`, `pipelines` + `pipeline_stages`, `automations`, `flows`, `account_sharing` + member/invitation RPCs (017–019 — multi-user roles via RPC).
- Health: solo maintainer, 100+ commits/90d, 3 months old — no track record; 4,380 forks on a 3-month repo is a real anomaly.
- Alignment: R1 ✅, R2 partial, R3 partial, R5 ✖, R7 ✅ (blanket RLS + account-sharing RPC pattern — directly reusable for owner-vs-rep), R13 partial (WhatsApp webhooks), R14 ✅✅ (exact stack).
- Verdict: **SCHEMA-ONLY** — WhatsApp-welded, but its RLS + account_sharing + custom_fields migrations are the best *stack-identical* Supabase reference in the slice.
- License risk: none — MIT.

### customermates/customermates
- https://github.com/customermates/customermates — 275 ★ | 43 forks | pushed 2026-07-22 | **AGPL-3.0 + `ee/` commercial dir** | TypeScript | created 2026-03-19
- Verdict: **REJECT** — AGPL core + commercial ee/ on a 4-month solo repo: worst license posture in the slice with none of Twenty's maturity.

### midday-ai/midday
- https://github.com/midday-ai/midday — 14,636 ★ | 1,764 forks | pushed 2026-06-13 | **AGPL-3.0** | TypeScript | midday-v0.5.0 (2026-02-15)
- Stack: Bun + Turbo monorepo, tRPC, packages incl. `db`, `supabase`, `invoice`, `inbox`, `import`, `jobs`.
- Verdict: **REJECT for code reuse / PATTERN-REFERENCE only** — inbox-matching and invoice-status architecture fine to read, AGPL forbids copying into proprietary white-label CRM.

### documenso/documenso
- https://github.com/documenso/documenso — 14,093 ★ | 2,962 forks | pushed 2026-07-23 (UTC) | **AGPL-3.0** | TypeScript | v2.15.0 (2026-07-21)
- Data model (`packages/prisma/schema.prisma`): `Envelope`/`EnvelopeItem`, `Recipient`, `Field`, `Signature`, `DocumentAuditLog`, `DocumentMeta`, `Webhook`/`WebhookCall`, `ApiToken`, Organisation/Team RBAC — exact R10 agreement-status machinery + clean webhook/API-token implementation worth studying for R8.
- Health: company-backed (YC), 205 open issues, daily pushes.
- Verdict: **TACK-ON as external self-hosted service** (REST API + webhooks; agreement status lives in Rob's DB). Do NOT merge code.
- License risk: **AGPL — fine self-hosted unmodified as separate service; never vendor code.**

### shadcnblocks/kibo (Kibo UI)
- https://github.com/shadcnblocks/kibo — 3,869 ★ | pushed 2026-05-04 | **MIT** | TypeScript
- shadcn registry: **`kanban`** (dnd-kit), **`table`**, `gantt`, `relative-time`, `editor`, `dropzone`, `avatar-stack`, `status`, `contribution-graph`.
- Verdict: **TACK-ON — best building-block source in the slice.** MIT.

### janhesters/shadcn-kanban-board
- https://github.com/janhesters/shadcn-kanban-board — 251 ★ | pushed 2025-05-29 (~14 months stale) | **MIT**
- Zero-dependency shadcn kanban, Next.js Server Actions support, strong a11y.
- Verdict: **TACK-ON (alternate to Kibo's kanban)** — "done" component; Kibo better maintained.

### timDeHof/shadcn-timeline
- https://github.com/timDeHof/shadcn-timeline — 313 ★ | pushed 2026-05-07 | **MIT**
- R2 UI shell only — pair with atomic-crm's activity_log view pattern. Verdict: **TACK-ON.**

### KaraBharat/shadcn-crm-dashboard
- https://github.com/KaraBharat/shadcn-crm-dashboard — 186 ★ | pushed 2025-04-22 (15 months stale) | **MIT**
- Next.js App Router + shadcn, frontend-only with mock data. Verdict: **TACK-ON (UI harvest only).**

### Dropped at screening (with reasons)
- **builderz-labs/marketing-dashboard** (396 ★, MIT) — **REJECT: integrity red flag.** 396 stars with 0 forks, single contributor (25 commits), repo created 2026-02-13 = bought-stars pattern.
- **open-mercato/open-mercato** (1,510 ★, MIT) — adopt-the-whole-framework play, created 2025-09, 737 open issues, MikroORM. Watch-list at most.
- **gorkem-bwl/atlas** (171 ★) — AGPL + sub-scale.
- **hcengineering/platform, nocobase, ever-gauzy, illa/openblocks** — platform/low-code stacks, mixed licenses.
- **Vercel/Supabase official templates** — searched; **no official CRM-schema template exists**. Supabase's ecosystem answer to "CRM on Supabase" is effectively atomic-crm.

## Ranked top 3 for this slice

1. **marmelab/atomic-crm** — the only repo where the *Supabase layer itself* is production-grade and MIT. Treat as **schema + RLS + patterns base**; `supabase/migrations/` is a checklist for evolving The Network's Postgres. What NextCRM does better: invoicing, email capture, AI enrichment models, exact Next.js front-end match.
2. **pdovhomilja/nextcrm-app** — widest R-coverage in one MIT repo on exactly Rob's front-end stack. Second because Prisma-on-plain-Postgres (no RLS) + bus-factor-1. Best use: translate Invoice_*/Activities/Enrichment/Email models into Supabase migrations.
3. **shadcnblocks/kibo** — best-maintained MIT building-block registry (kanban, table, relative-time/status), per-component via shadcn CLI, zero architectural commitment.

**Cross-cutting conclusions:** (a) R5 unserved by the entire OSS CRM space; (b) every "complete product" at scale is AGPL or dual-licensed — MIT survivors are precisely the schema-donor/building-block tier, which fits "evolve The Network" better than wholesale adoption; (c) Documenso is the one AGPL tool worth running anyway — as an untouched sibling service over API for R10.

**Sources:** GitHub API for all metrics; schema files inspected: `marmelab/atomic-crm/supabase/migrations/*.sql`, `pdovhomilja/nextcrm-app/prisma/schema.prisma`, `ArnasDon/wacrm/supabase/migrations/001_initial_schema.sql`, `documenso/documenso/packages/prisma/schema.prisma`, `refinedev/refine/examples/app-crm/README.md` (EE-move notice), `twentyhq/twenty/LICENSE`, `customermates/customermates/LICENSE`, `shadcnblocks/kibo/packages/` listing.

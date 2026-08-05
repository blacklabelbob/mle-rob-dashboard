# Agent Report — Slice 4: Money + Documents (invoicing / receivables / e-sign / quotes)
**Run:** 2026-07-22 · github-tool-scout methodology · all numbers live via `gh api` (account blacklabelbob)
**Feeds:** docs/research/oss-crm-landscape-2026-07-22.md

## Key negative finding first (matters most for R9)

**No credible OSS repo models multi-installment receivables plans (2×$5,000 with due dates) as a first-class object.** Searches for "installment payment plan tracker" / "payment plan receivables" returned zero repos above ~10 stars. Invoice Ninja's `partial`/`partial_due_date` (evidence: `app/Factory/InvoiceFactory.php`, `app/Export/Decorators/InvoiceDecorator.php`) is a **single deposit**, not an N-installment schedule. Kill Bill and Lago model recurring subscriptions, not fixed installment plans. Closest concept found anywhere: CiviCRM's nonprofit pledge schedules (AGPL/PHP — reference only, see Slice 1). R9 must be a Supabase schema Rob owns.

## Survivors

### documenso/documenso
- https://github.com/documenso/documenso · Open-source DocuSign alternative · **14,093 ★ | 2,962 forks | pushed 2026-07-23 (UTC) | AGPL-3.0 | TypeScript | v2.15.0 (2026-07-21)**
- Stack + API: Next.js + Prisma + PostgreSQL — same universe as Rob's dashboard. Public REST API (`packages/api/v1`, Hono) + tRPC + webhooks (`packages/trpc/server/webhook-router/schema.ts`, `packages/lib/server-only/webhooks/create-webhook.ts`, `packages/lib/types/webhook-payload.ts`). Document lifecycle events fire webhooks the CRM can consume to flip agreement status.
- Health: excellent — VC-backed, weekly releases, 205 open issues on 14k stars. Alignment: R10 ✅ (signed/pending states via API), R8 ✅, R14 ✅✅ (only e-sign candidate in Rob's stack). Verdict: **BASE-CANDIDATE (e-sign lane)**
- License risk: **AGPL-3.0 — loud flag.** Fine self-hosted as a separate service called over API (API boundary avoids copyleft contamination); do NOT vendor code into the dashboard.

### docusealco/docuseal
- https://github.com/docusealco/docuseal · Document filling & signing · **18,074 ★ | 1,792 forks | pushed 2026-07-20 | AGPL-3.0 | Ruby | 3.1.5 (2026-07-20)**
- Stack + API: Rails + Vue, ships `docs/api`, `docs/openapi.json`, `docs/webhooks` + full webhook machinery (`app/models/webhook_url.rb`, `webhook_event.rb`, `lib/send_webhook_request.rb`). **MIT-licensed embed SDKs:** `docusealco/docuseal-react` (65★, MIT), `docuseal-js` (MIT) — React embed inside Rob's dashboard carries **no AGPL exposure**.
- Health: excellent, most-starred OSS e-sign, active company. Community consensus ([openalternative comparison](https://openalternative.co/compare/documenso/vs/docuseal), [sliplane roundup](https://sliplane.io/blog/5-open-source-docusign-alternatives)): DocuSeal = "best overall / more features", Documenso = "best product experience + TS codebase". Alignment: R10 ✅, R8 ✅ (openapi.json), R14 ◐ (Ruby service; MIT React embeds close the gap). Verdict: **BASE-CANDIDATE (e-sign lane, feature-richer)**
- License risk: AGPL server (isolated over API = manageable); embeds MIT. Some advanced features (SMS, some embed modes) are paid Pro — verify needed embed mode is free-tier before committing.

### invoiceninja/invoiceninja
- https://github.com/invoiceninja/invoiceninja · Invoice, quote, project app (Laravel) · **9,898 ★ | 2,669 forks | pushed 2026-07-21 | ELASTIC LICENSE 2.0 (verified via LICENSE file — "source-available", NOT OSI) | PHP | v5.13.26 (2026-06-25)**
- Stack + API: full REST API + API tokens + outbound webhooks (`app/Factory/WebhookFactory.php`, `app/Policies/WebhookPolicy.php`). Quotes→invoices→payments, **partial/deposit** (`partial_due_date`), recurring invoices, auto late-payment reminders, client portal. Closest single tool to R9+R10+R1 combined.
- Health: strong (company-backed, monthly releases). Alignment: R9 ◐ (deposits + reminders yes, N-installment plans no), R10 ✅, R1 ✅, R8 ✅, R14 ✖ (PHP/Laravel + MySQL). Verdict: **TACK-ON** (self-hosted invoice engine behind API) — demoted from BASE by license + stack.
- License risk: **Elastic 2.0 — cannot remove branding without the ~$40/yr white-label license ([license page](https://invoiceninja.github.io/docs/legal/license), [forum thread](https://forum.invoiceninja.com/t/white-label-licence/12737)); cannot offer as a service to third parties. Direct conflict with Rob's white-label rule unless the fee is paid.**

### InvoiceShelf/InvoiceShelf
- https://github.com/InvoiceShelf/InvoiceShelf · Community fork of Crater (Crater dead — last push 2024-08-10) · **1,762 ★ | 359 forks | pushed 2026-07-20 | AGPL-3.0 | PHP | 2.4.1 (2026-06-14)**
- Laravel + Vue, REST API (`routes/api.php`), estimates/invoices/payments, overdue tooling (`app/Services/Ai/Tools/ListOverdueInvoicesTool.php`).
- Health: small team, fork-of-dead-project bus-factor risk. Verdict: **SCHEMA-ONLY** — invoice/payment/estimate migrations are a clean reference for Rob's Supabase tables. License: AGPL — concepts only.

### SolidInvoice/SolidInvoice
- https://github.com/SolidInvoice/SolidInvoice · Invoicing + quotes · **939 ★ | 226 forks | pushed 2026-07-22 | MIT ✅ | PHP (Symfony) | 3.0.1 (2026-06-23)**
- Symfony + API Platform REST (`src/ApiBundle/OpenApi/OpenApiFactory.php`). Quotes AND invoices with quote→invoice conversion (R1 fit). No installment evidence.
- Verdict: **TACK-ON** — only genuinely-MIT full invoicing app; fallback if AGPL/Elastic are dealbreakers. License: **MIT — best in category.**

### al1abb/invoify
- https://github.com/al1abb/invoify · Invoice generator, Next.js + TS + shadcn · **6,325 ★ | 722 forks | pushed 2026-06-29 | MIT ✅ | TypeScript | no releases**
- Exact stack match. API routes `app/api/invoice/generate|export|send/route.ts` + `services/invoice/server/generatePdfService.ts` (Puppeteer HTML→PDF). No DB/statuses — generator, not ledger.
- Health: solo-maintainer, activity moderate. Verdict: **TACK-ON (strongest "generate invoices from CRM later" piece — copy routes + templates straight in, MIT)**. License: MIT — strip branding freely (retain copyright notice in THIRD-PARTY-LICENSES.md).

### midday-ai/midday
- https://github.com/midday-ai/midday · Invoicing/time/financial OS · **14,636 ★ | 1,764 forks | pushed 2026-06-13 | AGPL-3.0 | TypeScript | midday-v0.5.0 (2026-02-15)**
- Next.js + **Supabase** + tRPC — only candidate on Rob's exact stack incl. Supabase. But self-hosting not a supported path (no self-host docs; depends on Trigger.dev, banking providers). Invoice statuses: draft/unpaid/overdue/paid.
- Verdict: **SCHEMA-ONLY — best reference for invoice statuses + overdue UX in a Supabase/Next app; copy patterns, not code.** License: AGPL, actively enforced brand.

### getlago/lago
- https://github.com/getlago/lago · Usage-based metering & billing · **10,239 ★ | 706 forks | pushed 2026-07-20 | AGPL-3.0 | Go/Ruby**
- Verdict: **REJECT — wrong shape** (metered subscriptions, not fixed installment receivables). License: AGPL.

### killbill/killbill
- https://github.com/killbill/killbill · Subscription billing platform · **5,629 ★ | 942 forks | pushed 2026-07-21 | Apache-2.0 ✅ | Java**
- Verdict: **REJECT — overkill.** Enterprise Java platform for what is a 2-row installment table. License: clean but irrelevant.

### OpenSignLabs/OpenSign
- https://github.com/OpenSignLabs/OpenSign · DocuSign alternative · **6,702 ★ | 772 forks | pushed 2026-07-14 | AGPL-3.0 with per-directory carve-outs | JavaScript | v2.41.0**
- Parse Server + React; API docs thinner than leaders. Verdict: **REJECT** — dominated by DocuSeal/Documenso on every axis.

## Rejected loudly

- **akaunting/akaunting** (9,969★) — **LICENSE.txt is Business Source License (MariaDB BSL text, Licensor: Akaunting, Inc.). Not open source**; community complaints about core features moved to paid apps. REJECT.
- **crater-invoice/crater** (8,324★, AGPL) — dead: last push 2024-08-10. Use InvoiceShelf. REJECT.
- **InvoicePlane/InvoicePlane** (3,088★) — no REST API in stable v1; trademark-restricted license. Fails R8. REJECT.
- **idurar/idurar-erp-crm** (8,558★, AGPL) — replaces rather than bolts on; weak issue hygiene. REJECT.
- **bigcapitalhq/bigcapital** (3,791★, AGPL, TS) — full double-entry accounting; overkill. REJECT.
- **OnedocLabs/react-print-pdf** (2,553★, Apache-2.0) — stale (2024-09-12), company pivoted. REJECT; prefer invoify or `@react-pdf/renderer` (MIT).
- **VladSez/easy-invoice-pdf** (1,004★) — AGPL client-side generator when invoify is MIT. REJECT.
- **vas3k/TaxHacker** (6,550★, MIT, Next.js+Prisma) — accounts-payable direction. Wrong slice.
- **FOSSBilling** (1,648★, Apache-2.0) — hosting-industry billing. REJECT.
- **kimai/kimai, ever-co/ever-gauzy, frappe/books** — time-tracking / business-platform / desktop-accounting; none receivables-first; all AGPL. REJECT.
- **Quotes/proposals standalone:** category empty — nothing maintained above ~20 stars (verified via `gh search`). Invoice Ninja and SolidInvoice include quotes; otherwise build quotes as doc template + e-sign send.

## Ranked top-3

1. **docusealco/docuseal** (with MIT React embed) *or* **documenso/documenso** (if Rob wants a readable TS codebase) — one self-hosted e-sign service covers the whole R10 agreement lane (send, sign, versions via re-send, webhook → CRM status flip, PDF links). Both AGPL — isolate behind API, never vendor.
2. **al1abb/invoify** (MIT, Next.js/TS) — lift `app/api/invoice/generate` + PDF service + templates into the dashboard for "generate invoices from CRM". Zero license friction, zero new service.
3. **invoiceninja/invoiceninja** — only if Rob wants a full standalone invoicing backend with client portal + auto-reminders and accepts PHP ops + the Elastic white-label fee. Otherwise **SolidInvoice** is the clean-MIT fallback; **midday + InvoiceShelf** are schema references.

## Integrate vs. surface-the-existing-contracts-repo — recommendation

**Surface, don't integrate.** The two PRIMARY requirements split cleanly: R9 (installment receivables, loud overdue, in-app reminders) has **no usable OSS solution** — every invoicing app models at best a single deposit — so it should be ~3 Supabase tables (`receivable`, `installment`, `payment`) + a nightly overdue job, seeded from `invoice-ledger.csv`/`agreement-ledger.csv` by extending organize.py to also upsert into Supabase; midday and InvoiceShelf schemas are design references. R10's agreement lane is the one place a real tool earns its keep: run self-hosted DocuSeal (or Documenso) as a sidecar, drive via REST API/webhooks, store signed-PDF URLs alongside ledger rows — versions (v1 superseded by v2) stay a CRM-side status field, exactly as the contracts repo models them. Adopting Invoice Ninja/Lago/Kill Bill as system-of-record would force migration away from the contracts repo Rob trusts, add a second stack, and still not model installments. Phase 2 (generate from CRM): copy invoify's MIT routes for invoices; templates + e-sign API for agreements.

**Sources:** [awesome-selfhosted money page](https://awesome-selfhosted.net/tags/money-budgeting--management.html) · [Documenso vs DocuSeal](https://openalternative.co/compare/documenso/vs/docuseal) · [5 open-source DocuSign alternatives](https://sliplane.io/blog/5-open-source-docusign-alternatives) · [Invoice Ninja license page](https://invoiceninja.github.io/docs/legal/license) · [white-label forum thread](https://forum.invoiceninja.com/t/white-label-licence/12737) · all stats/licenses/file paths via `gh api` + `gh search code` on 2026-07-22 (Akaunting BSL and Invoice Ninja Elastic 2.0 read directly from in-repo LICENSE files).

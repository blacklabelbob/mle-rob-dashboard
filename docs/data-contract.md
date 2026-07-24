# Read-model data contract (PRD Task MC.8)

> **Generated file — do not hand-edit.** Source of truth is `lib/readModel/contract.ts`;
> regenerate with `node scripts/gen-data-contract.mjs`. A vitest check fails if this file drifts.

The Mission-Control panels (MC.12) read these views and nothing else. Two of the six have no backing store today and say so here rather than shipping an empty view that reads like a working feature.

## Summary

| View | Coverage | Source tables | Unblocked by |
| --- | --- | --- | --- |
| `rm_pipeline` | ✅ buildable now | `deals`, `people`, `orgs` | — |
| `rm_esign_status` | 🟡 buildable, zero rows today | `documents`, `signature_requests` | — |
| `rm_action_items` | ✅ buildable now | `tasks` | — |
| `rm_delivery_phases` | ⛔ blocked — no backing store | — | Q40 (customer Phase 1-3 model + component completion webhook) |
| `rm_invoices_ar` | ⛔ blocked — no backing store | — | MC.9 invoicing leg (scheduled CSV diff → a real table) |
| `rm_nudge_activity` | 🟡 buildable, zero rows today | `signature_events`, `signature_requests` | — |

## `rm_pipeline` — Pipeline

One row per deal with its stage, owner and value — the MC.12 Pipeline panel and every stage-count KPI read this, never the deals table directly.

**Coverage:** ✅ buildable now — deals is live with real rows on prod.

| Column | Source | Note |
| --- | --- | --- |
| `deal_id` | `deals.id` |  |
| `deal_name` | `deals.name` |  |
| `stage` | `deals.stage` | canonical ladder — Task 1.6 |
| `value` | `deals.value` | dollars; COMPED deals are $0 by Rob's 7/23 ruling, render as COMPED not $0 |
| `owner` | `deals.owner_id` | free text until Phase-4 profiles |
| `person_id` | `deals.person_id` |  |
| `org_id` | `deals.org_id` |  |
| `counterparty_name` | `people.name` | coalesced with orgs.name — a deal anchors to exactly one |
| `vertical_id` | `deals.vertical_id` |  |
| `routing_lane` | `deals.routing_lane` |  |
| `stage_entered_at` | `deals.updated_at` | proxy; the precise value is the latest status_change activity (Task 4.7) |
| `created_at` | `deals.created_at` |  |

## `rm_esign_status` — E-sign status

One row per agreement with where it sits in the signature ladder — the Onboarding/E-sign panel. Joins the request to its document so a panel never has to reconstruct the pair.

**Coverage:** 🟡 buildable, zero rows today — Schema is live (migrations 0008/0009/0010) but prod holds ZERO documents and ZERO signature_requests as of 2026-07-24 — the one real agreement to date went out before the flow shipped (MC.6 §2). The view is correct and will populate on first send; a panel built on it must render an empty state, not a broken one.

| Column | Source | Note |
| --- | --- | --- |
| `document_id` | `documents.id` |  |
| `title` | `documents.title` |  |
| `phase` | `documents.phase` |  |
| `document_status` | `documents.status` |  |
| `person_id` | `documents.person_id` |  |
| `org_id` | `documents.org_id` |  |
| `deal_id` | `documents.deal_id` |  |
| `request_id` | `signature_requests.id` |  |
| `request_status` | `signature_requests.status` |  |
| `signer_name` | `signature_requests.signer_name` |  |
| `signer_email` | `signature_requests.signer_email` |  |
| `signer_type` | `signature_requests.signer_type` |  |
| `sent_at` | `signature_requests.created_at` |  |
| `viewed_at` | `signature_requests.viewed_at` |  |
| `signed_at` | `signature_requests.signed_at` |  |
| `expires_at` | `signature_requests.expires_at` |  |
| `countersigned_at` | `documents.countersigned_at` |  |

## `rm_action_items` — Action items

Open work with an owner and a due date, split ours-vs-theirs by assignee — the Action Items panel and the overdue alerting in MC.14.

**Coverage:** ✅ buildable now — tasks is live.

| Column | Source | Note |
| --- | --- | --- |
| `task_id` | `tasks.id` |  |
| `title` | `tasks.title` |  |
| `detail` | `tasks.detail` |  |
| `status` | `tasks.status` |  |
| `due_date` | `tasks.due_date` |  |
| `assigned_to` | `tasks.assigned_to` | free text until Phase-4 profiles; ours-vs-theirs is derived from it |
| `deal_id` | `tasks.deal_id` | nullable — a deal delete strands the task (the orphan path Task 3.7 watches) |
| `person_id` | `tasks.person_id` |  |
| `created_at` | `tasks.created_at` |  |

## `rm_delivery_phases` — Delivery phases

Per-customer Phase 1-3 Blueprint with each phase's component checklist and its live/not-live state.

**Coverage:** ⛔ blocked — no backing store — No phase/component store exists. `documents.phase` is a label on one PDF and `people.phase_one` is free text — neither is a component checklist, and inventing a view over them would fake a feature. The phase model itself is unbuilt.

**Unblocked by:** Q40 (customer Phase 1-3 model + component completion webhook)

_No columns — the view is not creatable against today's schema._

## `rm_invoices_ar` — Invoices / AR

Issued invoices, amounts, due dates and aging buckets.

**Coverage:** ⛔ blocked — no backing store — GATE G3 (MC.7, 2026-07-23) settled this: the ONLY live invoicing store is `invoice-ledger.csv` in the contracts repo — Supabase has no invoice/AR table (all 12 backup tables checked; invoices/invoice/ar/ledger/payments/billing all 404 on REST). A SQL view is structurally impossible, so the AR panel reads a CSV-diff ingestion, not this contract. Named here rather than silently dropped.

**Unblocked by:** MC.9 invoicing leg (scheduled CSV diff → a real table)

_No columns — the view is not creatable against today's schema._

## `rm_nudge_activity` — Nudge activity

Every reminder actually sent on a signature request — the audit trail behind the hourly nudge ladder, so 'did we chase this?' is answerable without reading n8n logs.

**Coverage:** 🟡 buildable, zero rows today — signature_events is live and append-only (DB trigger, service role included), but with zero requests on prod there are zero nudge events today. The hourly ladder (n8n CxFUrjo29NiYMofS) writes these the moment a real request exists.

| Column | Source | Note |
| --- | --- | --- |
| `event_id` | `signature_events.id` |  |
| `request_id` | `signature_events.request_id` |  |
| `event_type` | `signature_events.type` | filtered to nudge/sent/resent — the delivery rungs |
| `occurred_at` | `signature_events.at` |  |
| `meta` | `signature_events.meta` | rung + channel written by the nudge cron |
| `document_id` | `signature_requests.document_id` |  |
| `request_status` | `signature_requests.status` |  |

## Role `dashboard_ro`

A read panel that can write is a read panel that will eventually write. The role holds no base-table grant at all, so even a compromised panel query cannot reach `deals` or `people` directly — it can only see what a view chose to expose.

- **Granted:** SELECT on each rm_* view
- **Denied:** INSERT, UPDATE, DELETE, TRUNCATE, any base-table access

## Never exposed

No read model exposes these — single-use token material, signer forensics and file digests are audit-chain internals, not dashboard data:

- `signature_requests.token_hash`
- `signature_requests.signer_ip`
- `signature_requests.signer_user_agent`
- `signature_requests.sha256_at_sign`
- `documents.sha256_at_upload`
- `documents.sha256_signed`
- `documents.sha256_countersigned`

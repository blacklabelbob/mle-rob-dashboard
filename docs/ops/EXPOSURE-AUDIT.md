# Exposure audit — what is readable today

> **GENERATED — do not hand-edit.** `npm run audit:exposure` (`scripts/exposure-audit.mjs`)
> rebuilds this file from `app/` and `supabase/migrations/*.sql`. Re-run it after any
> route or migration change; a hand-kept copy of this page would be stale within a day.

Q73 audit half (BUILD-QUEUE): Rob is about to add bookers and sales reps as named users.
This is the enumeration of what a person holding the prod URL can reach **before** any
permission layer exists, and what the service-role key can reach behind it.

## Headline

| | count |
|---|---|
| Pages served to anyone with the URL | **15** |
| API routes total | 51 |
| API routes with **no** secret/authorization check | **41** |
| Tables the service-role key can reach | **28** |
| Money columns behind them | **11** |
| Person/PII columns behind them | **26** |

**There is no per-user permission layer today.** Every page and every ungated API route
answers the same to Rob and to a booker who has the link — the dashboard was opened on the
decision that only Rob held the URL (closed 2026-07-27), and named non-owner staff is the
new fact that reopens the population, not that decision.

## Tables reachable by the service-role key

| table | columns | money | PII |
|---|---:|---:|---:|
| `orgs` | 31 | **2** — `quoted_amount`, `equity` | **4** — `name`, `phone`, `email`, `transcript_url` |
| `people` | 33 | **2** — `quoted_amount`, `equity` | **4** — `name`, `phone`, `email`, `transcript_url` |
| `signature_requests` | 20 | 0 | **5** — `signer_name`, `signer_email`, `signer_ip`, `signer_user_agent`, `signer_type` |
| `deals` | 18 | **2** — `value`, `equity` | **1** — `name` |
| `documents` | 22 | 0 | **3** — `countersigner_name`, `countersigner_title`, `countersigner_email` |
| `phase2_returns` | 13 | **3** — `labor_cost_per_hour`, `revenue_since_phase2_start`, `revenue_basis` | 0 |
| `activities` | 16 | 0 | **2** — `recording_url`, `transcript_url` |
| `call_transcript_segments` | 9 | 0 | **2** — `transcript_id`, `text` |
| `invoice_ledger` | 18 | **2** — `invoice_number`, `amount` | 0 |
| `call_transcripts` | 11 | 0 | **1** — `recording_sid` |
| `events` | 7 | 0 | **1** — `name` |
| `projects` | 10 | 0 | **1** — `name` |
| `saved_views` | 9 | 0 | **1** — `name` |
| `verticals` | 3 | 0 | **1** — `name` |
| `edges` | 8 | 0 | 0 |
| `entity_access` | 10 | 0 | 0 |
| `entity_properties` | 7 | 0 | 0 |
| `flags` | 11 | 0 | 0 |
| `generic_email_domains` | 4 | 0 | 0 |
| `invoice_ledger_sync_runs` | 17 | 0 | 0 |
| `org_memberships` | 5 | 0 | 0 |
| `phase_component_state` | 11 | 0 | 0 |
| `phase_scan_picks` | 12 | 0 | 0 |
| `property_definitions` | 8 | 0 | 0 |
| `property_options` | 4 | 0 | 0 |
| `signature_events` | 6 | 0 | 0 |
| `submissions` | 6 | 0 | 0 |
| `tasks` | 12 | 0 | 0 |

**Coverage limit, stated rather than implied:** columns are classified by *name*. PII sitting
inside a free-text or `jsonb` column (`notes`, `payload`, `key_dates`) is **not** counted here —
the structural PII guard (`npm run guard:pii`) is what covers content. Read these counts as a
floor, never as the total.

## Pages — readable by anyone with the prod URL

| route | file |
|---|---|
| `/` | `app/page.tsx` |
| `/companies` | `app/companies/page.tsx` |
| `/companies/[id]` | `app/companies/[id]/page.tsx` |
| `/deals` | `app/deals/page.tsx` |
| `/deals/[id]` | `app/deals/[id]/page.tsx` |
| `/network` | `app/network/page.tsx` |
| `/ops` | `app/ops/page.tsx` |
| `/people` | `app/people/page.tsx` |
| `/people/[id]` | `app/people/[id]/page.tsx` |
| `/projects` | `app/projects/page.tsx` |
| `/rep` | `app/rep/page.tsx` |
| `/rep/accounts` | `app/rep/accounts/page.tsx` |
| `/rep/accounts/[id]` | `app/rep/accounts/[id]/page.tsx` |
| `/sign/[token]` | `app/sign/[token]/page.tsx` |
| `/training` | `app/training/page.tsx` |

## API routes

| route | methods | gate |
|---|---|---|
| `/api/admin/activities` | GET, POST | **open** |
| `/api/admin/call-backfill` | GET, POST | secret/auth checked |
| `/api/admin/call-backfill/summary` | GET, POST | secret/auth checked |
| `/api/admin/call-readiness` | GET | **open** |
| `/api/admin/deals` | PATCH | **open** |
| `/api/admin/deals/phase` | PATCH | **open** |
| `/api/admin/dedup` | GET, POST, PATCH | **open** |
| `/api/admin/dedup/merge` | POST | **open** |
| `/api/admin/equity` | PATCH | **open** |
| `/api/admin/export` | GET | **open** |
| `/api/admin/flags` | GET, PATCH, POST | **open** |
| `/api/admin/generic-domains` | GET, POST, DELETE | **open** |
| `/api/admin/import` | POST | **open** |
| `/api/admin/needs-action` | GET | **open** |
| `/api/admin/org-proposals` | GET, POST | **open** |
| `/api/admin/people` | PATCH, DELETE | **open** |
| `/api/admin/phase2-returns` | POST | **open** |
| `/api/admin/scan-picks` | POST | **open** |
| `/api/admin/search` | GET | **open** |
| `/api/admin/verticals` | POST | **open** |
| `/api/calls/recording` | GET | **open** |
| `/api/calls/transcript` | GET | **open** |
| `/api/cron/backup` | GET | secret/auth checked |
| `/api/cron/dedup` | GET | secret/auth checked |
| `/api/cron/esign-nudges` | GET | secret/auth checked |
| `/api/cron/integrity` | GET | secret/auth checked |
| `/api/cron/overdue` | GET | secret/auth checked |
| `/api/cron/recycle` | GET | secret/auth checked |
| `/api/dev-chat` | GET, POST | **open** |
| `/api/esign/countersign` | POST | **open** |
| `/api/esign/documents` | GET, POST | **open** |
| `/api/esign/generate` | POST | **open** |
| `/api/esign/send` | POST | **open** |
| `/api/esign/sign` | POST | **open** |
| `/api/estimate` | POST | **open** |
| `/api/health` | GET | **open** |
| `/api/leads` | POST | secret/auth checked |
| `/api/network` | GET | **open** |
| `/api/panels` | GET | **open** |
| `/api/tasks/today` | GET | **open** |
| `/api/twilio/token` | GET | **open** |
| `/api/twilio/voice` | POST | **open** |
| `/api/views` | POST, GET, DELETE | **open** |
| `/api/views/page` | GET | secret/auth checked |
| `/api/webhooks/aidre-call` | POST | **open** |
| `/api/webhooks/n8n-email` | POST | **open** |
| `/api/webhooks/n8n-error` | POST | **open** |
| `/api/webhooks/phase-signal` | POST | **open** |
| `/api/webhooks/twilio-recording` | POST | **open** |
| `/api/webhooks/vapi` | POST | **open** |
| `/api/webhooks/voice-law` | POST | **open** |

## What closes this

The audit half of Q73 ends here — it is an inventory, and `npm run audit:exposure` exits 0
by design so it never blocks a build. The **rollout half** (Supabase RLS + a per-role read
test that fails when a booker-role token selects `value`, `paid`, or a phone/email column)
ships only on Rob's explicit go, per the queue item.

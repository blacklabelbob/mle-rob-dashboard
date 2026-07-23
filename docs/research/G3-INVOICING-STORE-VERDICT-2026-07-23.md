# GATE G3 — Invoicing/AR backing-store verdict (Task MC.7)
**Date:** 2026-07-23 · **Author:** Max (build driver) · **Status:** VERDICT DELIVERED — gate closed

> Question (base Task 8.2 / Mission Control MC.7): is invoicing/AR backed by live
> Postgres/Supabase tables today, or by `invoice-ledger.csv`? The answer determines
> what the MC.8 read-model / MC.12 AR panel reads.

## Verdict

**`invoice-ledger.csv` (contracts repo) is the ONLY live invoicing/AR store. No
Postgres/Supabase invoicing table exists anywhere.** The AR view cannot be built as
a plain SELECT against existing tables — it needs an ingestion/sync seam first
(MC.9's "invoicing paid/overdue" workflow would have to CREATE its target table,
not write into an existing one).

## Evidence per store

### Store A — Supabase (project Postgres; the only live DB) → **NO invoicing data**

| Check | Result | Evidence |
|---|---|---|
| Full table registry | 12 tables, zero invoice/AR tables | `lib/integrity/backup.ts` `BACKUP_TABLES` (current as of Q47, 2026-07-23): people, orgs, edges, org_memberships, activities, deals, tasks, flags, dedup_review, verticals, projects, dev_chat |
| Direct REST probes | all 404 (table does not exist) | `GET /rest/v1/{invoices,invoice,ar,ledger,payments,billing}` each returned 404, service-role key, 2026-07-23 |
| Closest columns | stage-level only, no invoice fields | `deals` columns: id/person_id/org_id/…/stage/value/key_dates/… — `stage` can be `invoiced`/`paid` and `value` holds deal dollars, but there is **no** invoice_number, issue_date, due_date, amount-paid, or aging field (probe for `deals.invoice_number` → 42703 column does not exist) |

### Store B — `invoice-ledger.csv` → **LIVE, canonical, human-maintained**

Path: `~/Projects/MyLocalEverything/contracts/invoices/invoice-ledger.csv` (contracts repo, alongside the PDF artifacts and the `phase1-invoice` skill that writes them).

| invoice_number | client | amount | status (verbatim) |
|---|---|---|---|
| MLE-2026-100122 | CG Roofing & Waterproofing + Red Rock Roofing (owner: Caleb) | $10,000.00 | issued — split-payment plan approved 2026-07-16 (2 × $5,000, **first due by 2026-07-24**; Mgmt Change Approval on file) |
| MLE-2026-100123 | Gulf Coast RE Group | $19,000.00 | paid 2026-07-16 (check) |

Columns: invoice_number, issue_date, iso_week, client_slug, client_legal_name, owner, scope_summary, amount, currency, status, pdf. Status is free-text prose (split-plan terms live inside the status string) — machine-parsing it for AR aging is fragile by design intent; it's a human ledger.

## What this determines (consumers)

1. **MC.8 read-model:** the invoices/AR view must be fed — options are (a) a small `invoices` table + one-way sync from the CSV (CSV stays canonical until the contracts engine writes DB-first), or (b) the AR panel reads the CSV via an import step. Either way the data contract should carry a `source: csv-sync` provenance field so nobody mistakes it for engine-written truth.
2. **MC.9 ingestion:** "invoicing paid/overdue" events have no webhook source today — the contracts repo has no event emitter (`scripts/organize.py` + a PDF skill only). Until the contracts invoicing engine emits events, ingestion = scheduled CSV diff.
3. **MC.14 unpaid-invoice alerts (7/15/30d):** blocked on the same seam; due dates currently live inside free-text status strings (e.g. 100122's 2026-07-24 split due date), so alerting needs structured due_date extraction at sync time.
4. **Q40 phase↔invoice cross-check (Master View 2.0 §3.1):** per-phase INVOICE/PAID amounts will need this same seam — one sync, multiple consumers.

## Immediate finding (flagged per findings protocol)

Invoice **MLE-2026-100122** first split payment ($5,000, CG Roofing/Red Rock, owner Caleb) is **due 2026-07-24** — the day after this verdict — and no CRM watcher covers invoice due dates (AR is outside the DB, per this verdict). Filed to the flags ledger so it surfaces in Things to Address on CG Roofing Group's record.

*Written by the 2026-07-23 driver increment (BUILD-QUEUE Q50). Ledger CSV read-only accessed; nothing in the contracts repo was modified.*

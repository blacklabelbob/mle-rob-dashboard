# Dashboard CRM Requirements — from Rob, 2026-07-16/17
**Status:** OPEN — to be folded into the Phase 1+ build. Owner: dashboard session.
**Source of truth for all data below:** `~/Projects/MyLocalEverything/contracts/`
(account JSONs in `prospects/` + `clients/`, `agreements/agreement-ledger.csv`,
`invoices/invoice-ledger.csv`). The filing engine (`contracts/scripts/organize.py`)
keeps filenames/locations in sync with that state — the CRM should read the JSONs/ledgers,
never parse filenames.

## 1. Receivables & reminders INSIDE the dashboard (Rob 2026-07-17: "we want to be able to see all of that from within the Dashboard & CRM")
- Show open receivables with installment plans (first case: CG Roofing MLE-2026-100122,
  2 × $5,000, installment 1 due 2026-07-24 — `prospects/cg_roofing.json` → `receivable`).
- **In-app engagement reminder**: when Rob opens the dashboard, surface due/overdue items
  immediately (banner or modal). This replaces the temporary AGENTS.md standing-reminder hack.
- Overdue state must be visually loud (red flag on the receivable).

## 2. Pipeline stages — correct terminology (Rob 2026-07-17)
- **An account is a PROSPECT until it pays for Phase 1; only then is it a CLIENT.**
- CRM pipeline mirrors the contracts repo: `prospects/` = not yet paid in full,
  `clients/` = paid. Display stage everywhere an account appears.
- Current truth: Gulf Coast RE Group = CLIENT (paid $19,000 by checks 2026-07-16);
  CG Roofing & Red Rock Roofing = PROSPECT (signed, $10,000 open on a split plan).

## 3. Document status surfaced in the CRM (Rob 2026-07-17)
- **Agreements**: show version (v1, v2, …) and whether it is *(complete)* (signed/effective),
  with a link/path to the working PDF; superseded versions live in `agreements/archive/`.
- **Invoices**: show **PAID vs OPEN** prominently ("if an invoice is paid… it should be shown
  to be paid"). Paid invoices are renamed `… (PAID).pdf` and live in `invoices/paid/`;
  the ledger `status` column carries `paid <date> (<method>)`.
- Anticipate THOUSANDS of accounts — list views need search/filter by stage, paid status,
  and overdue flag from day one.

---
**Relationship to `PRD-mle-crm-evolution-v1.md`:** this doc is requirements intake for that PRD
(fold into its Task 1.1 "Rob's differentiator dump → v2.0 scope amendment"). Item 2 (Prospect→Client
on Phase 1 payment) is canonical input to the PRD's pipeline-stages task (CRM Task 1.6).

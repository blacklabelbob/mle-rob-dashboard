-- 0013 — `rm_invoices_ar`: the AR read model, finally creatable.
--
-- PRD Task MC.12 / MC.9. This is the view 0012 deliberately did NOT create.
-- The reason it was withheld is the reason it can exist now: a view over an
-- empty table is how a fake fifth panel ships, so `rm_invoices_ar` stayed
-- `blocked_no_source` until the sync had actually run and prod held Rob's real
-- invoices. It has (inc.10: MLE-2026-100122 and MLE-2026-100123, under a
-- sync-run row carrying the source digest and commit). Now the panel reads
-- data that exists.
--
-- WHAT THIS VIEW IS RESPONSIBLE FOR, AND WHAT IT REFUSES.
--
-- 1. WITHDRAWN ROWS ARE FILTERED OUT HERE, AND ONLY HERE. The sync never
--    deletes: an invoice that vanishes from the CSV is marked `withdrawn_at`
--    and kept, so a truncated read cannot destroy history and a reappearing
--    invoice diffs against what we already hold. The store port therefore
--    LOADS withdrawn rows on purpose. The panel must not show them — a
--    withdrawn invoice on an AR panel is a number Rob would chase. Splitting
--    those two needs is exactly what this view is for.
--
-- 2. NO ARITHMETIC. There is no `balance`, `amount_due` or `amount_paid`
--    column in 0012 and this view does not invent one. Invoice 100122's
--    "2 x $5,000" is prose in `payment_plan_note`; a derived $5,000 balance
--    would be a fabricated number on a money panel. Aging is computed in code
--    (`buildInvoicesArPanel`) against an injected today, per CR-3 — not in SQL
--    with `now()`, which would make the panel untestable and time-dependent.
--
-- 3. COLUMNS ARE EXACTLY WHAT THE CONTRACT PROMISES. `columnList()` generates
--    the SELECT from `contract.ts`, so a column named here but not there is
--    never read, and one named there but missing here fails the read loudly
--    rather than shaping a row with a hole in it. `source_sha256` /
--    `source_commit` / `synced_at` ride along deliberately: a panel that
--    cannot say WHEN its money numbers were last synced looks equally current
--    the day the sync breaks.

-- Every column is aliased explicitly, even where the alias equals the source
-- name: the MC.8 gate parses `as <alias>` out of this file and compares the
-- list, in order, against contract.ts. Bare column refs would parse as zero
-- columns and quietly opt this view out of the one check that keeps the SQL
-- and the contract from drifting.
create or replace view rm_invoices_ar as
select
  il.invoice_number      as invoice_number,
  il.issue_date          as issue_date,
  il.client_slug         as client_slug,
  il.client_legal_name   as client_legal_name,
  il.owner               as owner,
  il.amount              as amount,
  il.currency            as currency,
  il.status_text         as status_text,
  il.payment_state       as payment_state,
  il.due_date            as due_date,
  il.payment_plan_note   as payment_plan_note,
  il.pdf                 as pdf,
  il.source_sha256       as source_sha256,
  il.source_commit       as source_commit,
  il.synced_at           as synced_at
from invoice_ledger il
where il.withdrawn_at is null;

-- Same posture as 0011: NOT `security_invoker`. The view runs as its owner so
-- `dashboard_ro` can hold SELECT on the view while holding nothing at all on
-- `invoice_ledger` — a compromised panel query cannot reach the money table.
-- `dashboard_ro` is named here alongside PUBLIC on purpose: `invoice_ledger`
-- is a base table holding Rob's money, and the role's whole posture (0011) is
-- that it can reach data ONLY through a view. A grant it never received still
-- gets revoked, so the absence is stated rather than assumed.
revoke all on invoice_ledger, invoice_ledger_sync_runs from public, dashboard_ro;
grant select on rm_invoices_ar to dashboard_ro;

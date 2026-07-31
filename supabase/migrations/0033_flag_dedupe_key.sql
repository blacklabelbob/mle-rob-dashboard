-- Q84 inc.8 — a recurring finding must CORRECT its own ledger row, not stack a
-- contradicting copy beside it.
--
-- Observed before this migration: flags #132 ("26 meetings"), #134 ("25 archived
-- meetings") and #136 (the Omega row) were all OPEN at once, all describing the same
-- meeting-archive finding, and two of the three numbers were already wrong. The POST
-- route only ever inserted, so every driver re-run added a fresh contradiction.
--
-- Additive and nullable on purpose: every existing flag keeps a NULL key and behaves
-- exactly as it did. Only callers that opt in by sending `dedupeKey` are deduped.
alter table flags add column if not exists dedupe_key text;

-- The invariant lives in Postgres, not in prose (CR-3): at most ONE open flag per
-- finding. `planFlagWrite` upholds it in code; this index makes a future caller that
-- forgets fail loudly instead of quietly re-creating the mess above. Resolved rows are
-- excluded — a finding that recurs after Rob closed it is allowed to have history.
create unique index if not exists flags_dedupe_key_open_uniq
  on flags (dedupe_key)
  where dedupe_key is not null and status = 'open';

comment on column flags.dedupe_key is
  'Stable identity of a recurring finding (Q84 inc.8). NULL = one-off flag, inserted as before. Non-null = the ledger holds at most one OPEN row for it; a re-run corrects that row in place and supersedes any older open twins with a note.';

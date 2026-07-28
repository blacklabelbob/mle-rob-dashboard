-- Q63 leg (5) inc.3 (2026-07-28): make `phase2_returns.updated_at` tell the truth.
--
-- THE SAME DEFECT 0028 FIXED FOR 0027, CARRIED INTO 0029 AND CAUGHT BY THE
-- INCREMENT THAT FIRST WRITES TO IT. 0029 gives `updated_at` a `default now()` and
-- nothing ever advances it: `default` fires on INSERT only, so an upsert that lands
-- on the conflict target — which is exactly what a CORRECTION is — updates the
-- numbers and leaves `updated_at` frozen at the original insert. The column would
-- then say a measurement has not been touched since March while holding July's
-- restated figures. On a table behind a money guarantee, that is the column a human
-- would reach for to ask "is this figure current?" and be told the wrong thing.
--
-- WHY A TRIGGER AND NOT THE PAYLOAD. Putting `updated_at` in the upsert row would
-- fix it for this one carrier and quietly break for the next writer — an import
-- script, a backfill, a hand-run SQL correction. The database is the only place
-- every writer passes through.
--
-- `when (old.* is distinct from new.*)` — a re-submission of IDENTICAL numbers is
-- traffic, not a change. Stamping it would make `updated_at` a record of how often
-- something was written rather than when it last actually changed, which is the same
-- lie in the other direction: a figure nobody has revised would look freshly revised
-- every time a re-import ran over it.
--
-- INSERTS ARE NOT TOUCHED — 0029's `default now()` is already correct for them, and
-- `created_at` and `updated_at` agreeing on that instant is the truth.
--
-- No data is rewritten. The three rows this table holds today (none — nothing has
-- written to it yet) and any written before this trigger existed report their insert
-- time as `updated_at`, which for an unrevised row is exactly right.

create or replace function public.touch_phase2_returns()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists phase2_returns_touch on public.phase2_returns;
create trigger phase2_returns_touch
  before update on public.phase2_returns
  for each row
  when (old.* is distinct from new.*)
  execute function public.touch_phase2_returns();

-- Q40 leg (6) inc.22 (2026-07-28): make `phase_scan_picks.updated_at` tell the truth.
--
-- THE DEFECT inc.21 FOUND AND NAMED. 0027 gives `updated_at` a `default now()` and
-- nothing ever writes it again: the upsert payload (`ScanPickWriteRow`) does not
-- carry the column, and neither the withdrawal nor the reinstatement patch does. So
-- a pick recorded in June and re-imported with a corrected label in July still
-- reports June. A column named *when this last changed* answering *when this was
-- created* is a lie waiting for its first reader — and the readers are coming: the
-- shortlist is a sales surface, and "when was this pitch last revised" is the first
-- question anyone asks of a pitch they did not write.
--
-- WHY A TRIGGER AND NOT THE PAYLOAD. Adding `updated_at` to the upsert row would fix
-- today's three writers and bind the guarantee to whoever remembers it next. The
-- rule (CR-3) is that guaranteed steps live in code that cannot be skipped, so the
-- stamp belongs where every writer passes — including a hand-run SQL correction,
-- which is exactly the write most likely to be the one somebody later asks about.
-- The column is now unforgeable on update: a caller that supplies its own
-- `updated_at` has it overwritten rather than believed.
--
-- `WHEN (OLD.* IS DISTINCT FROM NEW.*)` IS THE HONEST PART, NOT AN OPTIMISATION.
-- PostgREST issues an UPDATE for every conflicting row of an upsert whether or not
-- anything differs, so an unconditional trigger would re-date the whole shortlist on
-- a re-import that changed nothing — turning "last changed" into "last imported",
-- the same class of lie in a new coat. With the guard:
--
--   • a re-import that corrects a label stamps THAT row, and leaves its neighbours
--     reading the date they last actually changed;
--   • a second withdrawal is already a no-op (inc.19 filters to live rows), so it
--     still cannot move either date;
--   • reinstating a pick that was never withdrawn writes `withdrawn_at = null` over
--     `null` — identical row, no stamp, no invented event.
--
-- INSERTS keep 0027's `default now()`. A row's first write is its creation, and
-- `created_at` and `updated_at` agreeing on that instant is the truth.

create or replace function public.touch_phase_scan_picks()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists phase_scan_picks_touch on public.phase_scan_picks;
create trigger phase_scan_picks_touch
  before update on public.phase_scan_picks
  for each row
  when (old.* is distinct from new.*)
  execute function public.touch_phase_scan_picks();

-- Rows written before this trigger existed report their insert time as `updated_at`
-- and there is no record of what they last changed. They are LEFT ALONE: stamping
-- them now would replace an unknown with a fabricated one, and every such row is a
-- row whose content has never been revised anyway (nothing could revise it without
-- also being the write that this trigger now catches).

-- APPLY-STATUS: PENDING (owner: rob)
--
-- Q84 inc.71 — the confirm button inc.70 handed over cannot be built without a
-- machine channel from the check to the page, and there isn't one.
--
-- THE SHAPE OF THE PROBLEM, stated plainly rather than worked around. The host
-- proposal (`lib/meetings/hostProposal.ts`) is computed by `npm run check:archive`,
-- which reads Fireflies transcripts ON DISK. Prod has no transcripts, so the org
-- page CANNOT recompute the proposal — it can only read what the check already
-- wrote. The check writes exactly one thing: a row in `flags`. Every column on that
-- row is prose a human reads (`title`, `detail`, `resolution_note`) or an address
-- (`entity_id`, `dedupe_key`). None of them can carry "this host, for this org"
-- without either (a) parsing Rob's own prose back out, which breaks the first time
-- a sentence is reworded, or (b) printing a machine token INTO the sentence Rob
-- reads, which is the MS-DOS failure inc.13 named — a ledger row should never
-- contain something addressed at the computer.
--
-- So: one nullable jsonb column, written by the check, read by the page. The prose
-- stays prose. Nothing existing changes shape — `payload` is NULL on all 133 rows
-- on prod today and every reader ignores what it does not ask for.
--
-- WHY jsonb AND NOT MORE COLUMNS: the confirm control is the first structured
-- action a finding has ever carried, and it will not be the last. A column per
-- action type is a migration per action type; a payload is one column that the
-- CODE grades (`lib/flags/hostConfirm.ts` — pure, strict, refuses anything it does
-- not recognise rather than coercing it). CR-3: the shape lives in a tested module,
-- not in a comment.
--
-- NOT APPLIED. This joins 0032 (role grants) and 0034 (dedup_review) on Rob's ONE
-- pending `supabase db push` — it is not a new ask, and the backlog
-- (`npm run migrations:backlog`) is the single place that count lives.
--
-- NOTHING WRITES IT YET, ON PURPOSE. Wiring the check to write a column prod does
-- not have would 400 the ledger write that works today. The writer lands the
-- increment after the push, against a column that exists.

alter table flags add column if not exists payload jsonb;

-- A description, not decoration: `scripts/migration-evidence.mjs` grades this file
-- by reading prod's PostgREST OpenAPI root, which publishes column descriptions —
-- so this comment is what makes the migration provable as applied (inc.57).
comment on column flags.payload is
  'Q84 inc.71 — structured action carried by a finding, read by the page that renders it. NULL on findings that carry no action. Shape is graded by lib/flags/hostConfirm.ts, never by a caller.';

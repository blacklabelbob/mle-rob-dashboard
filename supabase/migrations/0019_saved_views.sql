-- Q67 inc.3 (2026-07-25): `saved_views` — the filter AST, persisted.
-- Design ported (not code-copied) from the 2026-07-25 Macro teardown, 02-crm.md §9.2 B6.
-- Macro is AGPL-3.0; this is retyped against the documented SHAPE.
--
-- WHAT THIS IS: one row per saved view. A view is a name, a target table, and an `Expr`
-- (lib/filters/ast.ts) stored as JSONB. Nothing else. The tree in `filter` is exactly the
-- object `parseExpr()` validates and `compile()` turns into parameterised SQL.
--
-- THE DECISION THAT MAKES THIS A TABLE AND NOT A COLUMN (§9.2 B6, taken verbatim):
--   Views are ROWS, not a `views JSONB[]` column on a user/team record. A whole-list
--   column means every rename of one view rewrites the entire list, so two reps saving
--   views in the same second silently drop one of them — last write wins over a value
--   nobody read. Rows make that a non-event, and they let a single view be fetched,
--   granted, and (later) filtered by RLS on its own.
--
-- SHARE LINKS ARE DELIBERATELY NOT A COLUMN HERE. A share link is the same object
-- base64url'd into the URL (see `encodeShareLink` in lib/filters/savedViews.ts) — it
-- carries the filter, so it needs no token, no row, and no revocation story, and a link
-- keeps working when the sender deletes their copy of the view. The trade is stated
-- rather than hidden: a share link is a bearer of a QUERY, never of DATA. It is worth
-- nothing on its own — whoever opens it still reads through whatever policy guards
-- people/orgs/deals (Q66/Q64). If that ever stops being true, this is the line to revisit.
--
-- WHERE WE DIVERGE FROM MACRO, ON PURPOSE:
--   1. `target` is CHECK-constrained text, not a Postgres ENUM — 0015/0017 precedent
--      (ALTER TYPE ... ADD VALUE cannot run inside a transaction block; a CHECK edit can).
--   2. The JSON size ceiling is enforced HERE as well as in the parser. parse.ts caps a
--      payload at 64 KiB before it will even JSON.parse it; a row that exceeded that cap
--      would be storable but unreadable — a view that saves and then 400s on open. The
--      constraint makes the two limits one limit.
--   3. Nothing is granted to `dashboard_ro` (0011). The read-model role sees views only.
--
-- SCOPE OF THIS INCREMENT — read before assuming anything renders:
--   * the table, its constraints and its indexes exist; the TS accessor + codec exist
--   * NO route reads or writes it, NO UI shows it, and there are ZERO rows.
--   * the server-side paginated route is the NEXT increment. Q67 does not tick on this.
--
-- Additive DDL only. No existing row is read or written. No money, signed, quoted or paid
-- field is touched. Nothing is deleted. STORAGE_SOURCE untouched.

-- The 64 KiB ceiling from lib/filters/parse.ts (MAX_JSON_BYTES), as a constraint.
-- Wrapped in an IMMUTABLE function for the same reason 0015 wrapped its value check:
-- a CHECK wants an immutable expression, and naming it makes the limit greppable from
-- both sides of the wire instead of being a magic number buried in a constraint.
create or replace function saved_view_filter_within_limit(v jsonb)
returns boolean
language sql
immutable
as $$
  select octet_length(v::text) <= 65536;
$$;

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),

  -- Which entity the tree runs against. Mirrors FILTER_TARGETS in lib/filters/ast.ts;
  -- it selects the FROM table, so an unknown value here is a query that cannot be built.
  target text not null check (target in ('person', 'org', 'deal', 'activity')),

  -- Display name. Bounded so a view name cannot be used as a storage channel, and
  -- non-blank so the list cannot render an unclickable empty row.
  name text not null check (length(btrim(name)) between 1 and 120),

  -- The `Expr`. Must be an object — an array or a bare scalar is not a node, and the
  -- parser would reject it on read, so it is refused on write instead.
  filter jsonb not null
    check (jsonb_typeof(filter) = 'object')
    check (saved_view_filter_within_limit(filter)),

  -- personal = one person's view; team = shared with a team. Exactly which id must be
  -- present is enforced below, not by convention.
  scope text not null check (scope in ('personal', 'team')),

  -- Free text today, like 0005's owner_id/assigned_to — Phase 4 / ACCESS (Q64, Q6) is
  -- what turns these into real identities. Deliberately NOT an FK to a table that does
  -- not exist yet; a fake FK now is a migration to undo later.
  owner_id text not null check (length(btrim(owner_id)) > 0),
  team_id text check (team_id is null or length(btrim(team_id)) > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A team view without a team is a view nobody can find; a personal view carrying a
  -- team id claims a sharing it does not have. Both are refused at the row level.
  constraint saved_views_scope_ids check (
    (scope = 'personal' and team_id is null)
    or (scope = 'team' and team_id is not null)
  )
);

-- Name uniqueness, per owner and per team, case-insensitively — two "My overdue quotes"
-- in one sidebar is a support ticket, not a feature.
--
-- TWO PARTIAL INDEXES, NOT ONE COMPOSITE — the 0017 lesson applied a second time:
-- Postgres treats NULL as distinct in a unique index, so a single index over
-- (owner_id, team_id, target, lower(name)) would let a rep save unlimited duplicate
-- PERSONAL views (the ones whose team_id is NULL) while correctly rejecting team ones.
create unique index if not exists saved_views_personal_name_uniq
  on saved_views (owner_id, target, lower(btrim(name)))
  where scope = 'personal';

create unique index if not exists saved_views_team_name_uniq
  on saved_views (team_id, target, lower(btrim(name)))
  where scope = 'team';

-- The two list reads the sidebar will make: "my views" and "my team's views".
create index if not exists saved_views_owner_idx on saved_views (owner_id, target);
create index if not exists saved_views_team_idx on saved_views (team_id, target)
  where scope = 'team';

-- RLS ON, NO POLICIES — the 0006/0015/0017 posture, and load-bearing rather than
-- ceremonial: the anon key ships in the client bundle (dev_chat uses it), so a table
-- without RLS is anon-WRITABLE through PostgREST on an already-open dashboard. Without
-- this line anyone with the URL could insert a view. Real policies ride with Q66.
alter table saved_views enable row level security;

comment on table saved_views is
  'Q67: a named filter Expr (lib/filters/ast.ts) per row. Rows, not a JSONB list column. '
  'Share links carry the same object base64url''d in the URL and store nothing here.';

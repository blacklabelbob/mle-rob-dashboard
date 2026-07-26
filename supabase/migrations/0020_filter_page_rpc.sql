-- Q67 inc.5 (2026-07-26): `filter_page` — the executor for the filter AST.
-- Design ported (not code-copied) from the 2026-07-25 Macro teardown, 02-crm.md §9.2.
--
-- WHAT THIS IS: the one place a compiled filter actually runs. `lib/filters/parse.ts`
-- validates a stranger's tree, `compile(expr, target, { bindStyle: 'jsonb' })` renders it
-- into a WHERE fragment plus a params array, and this function executes that fragment
-- against the right table with keyset pagination.
--
-- WHY AN RPC AT ALL (inc.4's finding, restated here so it survives the transcript):
-- the Data API cannot serve this AST. A `property` literal compiles to an EXISTS over
-- `entity_properties`, and PostgREST has no way to express a correlated subquery inside
-- an `or(...)` group — so custom-field filters, the whole point of §9.2 B3, require raw
-- SQL. Re-emitting the tree as PostgREST syntax would have meant a SECOND value
-- validator, which is how "the saved view and the shared link disagree" gets written.
--
-- WHY THE PARAMS ARRIVE AS ONE JSONB ARRAY: plpgsql cannot spread an N-element array into
-- `EXECUTE … USING` — the arity of USING is literal at write time. So the fragment reads
-- its values out of a single jsonb value (`((p_params->>0)::text)`), which is exactly what
-- `bindStyle: 'jsonb'` renders. The name `p_params` is not a plpgsql variable here:
-- EXECUTE'd SQL cannot see plpgsql variables, so the array is bound as $1 and exposed
-- under that name by a one-row `cross join (select $1::jsonb) as _params(p_params)`.
-- That is the whole trick — every user value still travels as a bound parameter, and the
-- only text ever interpolated is (a) a table name from a closed CASE below and (b) the
-- fragment our own compiler produced.
--
-- THE SECURITY POSTURE, STATED PLAINLY — this function takes SQL TEXT as an argument:
--   * EXECUTE is REVOKED from public/anon/authenticated and granted to service_role ONLY.
--     The anon key ships in the client bundle, so a callable-by-anon dynamic-SQL function
--     is a full read primitive for anyone with the URL. Revocation is not hygiene here,
--     it is the entire boundary. (Postgres grants EXECUTE to PUBLIC by default — the
--     revoke below is mandatory, not decorative.)
--   * SECURITY INVOKER, deliberately NOT DEFINER. A DEFINER function owned by the
--     migration role would run this SQL with that role's rights and bypass the Q66
--     policies for whoever could reach it. INVOKER keeps enforcement where 0018 put it.
--   * The caller is trusted to have produced `p_where` with `compile()`. The cheap
--     structural guards below (no `;`, no comment openers, size cap) exist because a
--     route bug should fail as a filter error, not as a second statement.
--
-- SCOPE — read before assuming anything renders: the function and the keyset indexes
-- exist. NO route calls it, NO UI shows it, zero behaviour changes for any existing page.
-- The `?view=`/`?share=` route is the NEXT increment. Q67 does not tick on this.
--
-- Additive DDL only. No existing row is read or written. No money, signed, quoted or paid
-- field is touched. Nothing is deleted. STORAGE_SOURCE untouched.

-- Keyset order is (created_at desc, id desc) — created_at alone is not unique, and a
-- non-unique sort key makes a cursor skip or repeat rows silently. All four targets carry
-- both columns (people 0001, orgs 0003, deals/activities 0005).
create index if not exists people_keyset_idx on people (created_at desc, id desc);
create index if not exists orgs_keyset_idx on orgs (created_at desc, id desc);
create index if not exists deals_keyset_idx on deals (created_at desc, id desc);
create index if not exists activities_keyset_idx on activities (created_at desc, id desc);

create or replace function filter_page(
  p_target text,
  p_where text,
  p_params jsonb default '[]'::jsonb,
  p_limit int default 50,
  p_after_created_at timestamptz default null,
  p_after_id text default null
)
returns setof jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table text;
  v_sql text;
begin
  -- Target → table is a CLOSED case, mirroring FILTER_TARGETS / DEFAULT_ALIAS in
  -- lib/filters/ast.ts. p_target is never interpolated; only these four literals are.
  v_table := case p_target
    when 'person' then 'people'
    when 'org' then 'orgs'
    when 'deal' then 'deals'
    when 'activity' then 'activities'
    else null
  end;
  if v_table is null then
    raise exception 'filter_page: unknown target %', p_target using errcode = '22023';
  end if;

  if p_where is null or btrim(p_where) = '' then
    raise exception 'filter_page: p_where is required' using errcode = '22023';
  end if;

  -- Structural guards. `compile()` never emits any of these, so their presence means the
  -- text did not come from the compiler and must not be run.
  if p_where like '%;%' or p_where like '%--%' or p_where like '%/*%' then
    raise exception 'filter_page: illegal token in filter sql' using errcode = '22023';
  end if;

  -- Same 64 KiB ceiling as parse.ts / saved_views, so the three limits are one limit.
  if octet_length(p_where) > 65536 then
    raise exception 'filter_page: filter sql too large' using errcode = '22023';
  end if;

  if p_params is null or jsonb_typeof(p_params) <> 'array' then
    raise exception 'filter_page: p_params must be a jsonb array' using errcode = '22023';
  end if;

  -- An unbounded page is a denial-of-service on a list view, and a zero page is a bug
  -- that looks like an empty result.
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'filter_page: p_limit must be between 1 and 200' using errcode = '22023';
  end if;

  -- Half a cursor is worse than none: (created_at, id) < (ts, NULL) is NULL for every
  -- row, so a caller that forgot the id would get an empty page instead of an error.
  if (p_after_created_at is null) <> (p_after_id is null) then
    raise exception 'filter_page: cursor needs both created_at and id, or neither'
      using errcode = '22023';
  end if;

  v_sql := format(
    'select to_jsonb(%1$I) from %1$I '
    'cross join (select $1::jsonb) as _params(p_params) '
    'where (%2$s) '
    'and ($2::timestamptz is null or (%1$I.created_at, %1$I.id) < ($2::timestamptz, $3::text)) '
    'order by %1$I.created_at desc, %1$I.id desc '
    'limit $4',
    v_table,
    p_where
  );

  return query execute v_sql using p_params, p_after_created_at, p_after_id, p_limit;
end;
$$;

-- THE BOUNDARY. Postgres grants EXECUTE on a new function to PUBLIC, so without these
-- three revokes this function is callable with the anon key that ships in the browser.
revoke all on function filter_page(text, text, jsonb, int, timestamptz, text) from public;
revoke all on function filter_page(text, text, jsonb, int, timestamptz, text) from anon;
revoke all on function filter_page(text, text, jsonb, int, timestamptz, text) from authenticated;
grant execute on function filter_page(text, text, jsonb, int, timestamptz, text) to service_role;

comment on function filter_page(text, text, jsonb, int, timestamptz, text) is
  'Q67: executes a compile(expr, target, {bindStyle:''jsonb''}) fragment with keyset '
  'pagination. Takes SQL text — service_role ONLY, SECURITY INVOKER, never anon.';

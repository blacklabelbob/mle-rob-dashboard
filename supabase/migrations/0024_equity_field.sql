-- Q41 inc.2 — the equity split becomes a FIELD.
--
-- WHY: the HomeCloneVault split read 40/60 for five days and was actually 35/65,
-- because it lived in a sentence inside one org's `description`. lib/equity.ts
-- already prefers a structured `equity` object over the prose and labels every
-- prose-derived row as prose-derived on screen. This is that object's column.
--
-- ADDITIVE ONLY. Nothing is backfilled here on purpose: a backfill would copy the
-- prose numbers into the field and thereby PROMOTE a guess to a fact — the screen
-- would stop saying "read out of the description" about numbers that were still
-- read out of the description. The field is written only when a human states it.
--
-- Shape (mirrors EquityCandidate["equity"] in lib/equity.ts):
--   { "counterpartyPct": 35, "ourPct": 65, "state": "verbal", "setBy": "rob",
--     "setAt": "2026-07-28" }
-- `state` may be absent, which means "keep reading the signed-vs-verbal state from
-- the record's prose" — the number is the thing that goes stale silently, the
-- signing language usually is not.

alter table if exists people add column if not exists equity jsonb;
alter table if exists orgs   add column if not exists equity jsonb;
alter table if exists deals  add column if not exists equity jsonb;

-- The gate below is the database's copy of the rule the UI and the API both
-- enforce, so a hand-written row or a future writer cannot store a split the
-- screen would then have to render as nonsense.
--
--   * counterparty_pct is a number 0-100, or json null (= "we hold a stake here
--     but the number is not agreed yet"). It is never absent: a row with no key
--     at all is indistinguishable from a typo'd key name.
--   * when both sides are present they total 100. A 35/60 is a typo or a
--     three-way deal; either way it is a question for Rob, not a fact for a screen.
--   * state, when present, is one of the four the UI knows how to colour.
do $$
declare t text;
begin
  foreach t in array array['people','orgs','deals'] loop
    if to_regclass(t) is not null then
      execute format($f$
        alter table %I drop constraint if exists %I;
        alter table %I add constraint %I check (
          equity is null or (
            jsonb_typeof(equity) = 'object'
            and equity ? 'counterpartyPct'
            and jsonb_typeof(equity->'counterpartyPct') in ('number','null')
            and (
              jsonb_typeof(equity->'counterpartyPct') = 'null'
              or ((equity->>'counterpartyPct')::numeric between 0 and 100)
            )
            and (
              not (equity ? 'ourPct') or jsonb_typeof(equity->'ourPct') = 'null'
              or (
                jsonb_typeof(equity->'counterpartyPct') = 'number'
                and (equity->>'ourPct')::numeric between 0 and 100
                and (equity->>'counterpartyPct')::numeric
                    + (equity->>'ourPct')::numeric = 100
              )
            )
            and (
              not (equity ? 'state') or jsonb_typeof(equity->'state') = 'null'
              or equity->>'state' in ('signed','verbal','draft','unknown')
            )
          )
        );
      $f$, t, t || '_equity_shape', t, t || '_equity_shape');
    end if;
  end loop;
end $$;

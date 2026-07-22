-- Task 4.1 (PRD Phase 4 / BUILD-QUEUE Q33): full-text search over people + orgs.
-- Generated tsvector column + GIN index on each table so PostgREST fts filters
-- hit an index, never a seq-scan ILIKE. 'simple' config on purpose: the corpus
-- is proper nouns (names, businesses) — English stemming would mangle them and
-- buys nothing. Column list here must stay in sync with SEARCH_COLUMNS in
-- lib/search.ts (gate test lib/__tests__/search.test.ts parses this file).
-- Additive DDL only — zero existing rows touched; generated columns backfill
-- themselves on ADD.

begin;

alter table people add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple',
    coalesce(name, '') || ' ' ||
    coalesce(business, '') || ' ' ||
    coalesce(role, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(phone, '') || ' ' ||
    coalesce(relationship, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(notes, ''))) stored;

create index if not exists people_search_tsv_idx
  on people using gin (search_tsv);

alter table orgs add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple',
    coalesce(name, '') || ' ' ||
    coalesce(business, '') || ' ' ||
    coalesce(role, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(phone, '') || ' ' ||
    coalesce(relationship, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(notes, ''))) stored;

create index if not exists orgs_search_tsv_idx
  on orgs using gin (search_tsv);

commit;

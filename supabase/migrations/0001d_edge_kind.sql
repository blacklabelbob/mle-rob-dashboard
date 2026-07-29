-- 2026-07-17 (Rob directive): edges carry a kind so people↔business relationships
-- (works-for / owns / kdm-of) are first-class, distinct from intro/provenance edges.
alter table edges add column if not exists kind text;

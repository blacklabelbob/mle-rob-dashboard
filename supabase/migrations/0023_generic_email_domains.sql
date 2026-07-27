-- Q69 inc.24 — the `generic_email_domains` table Q69's scope names.
--
-- ADDITIONS ONLY, NEVER A REPLACEMENT. `GENERIC_EMAIL_DOMAINS` (lib/comms/
-- genericDomains.ts, ~90 domains) stays the floor in code and is deliberately
-- NOT seeded here. Seeding would create two copies of one list that drift, and
-- worse: an empty or unreadable table would then read as "nothing is generic",
-- which is how an org ends up owning `gmail.com` and anchoring every consumer
-- address on earth to itself. The floor cannot be lowered from the database.
--
-- What this table buys: Rob can block a newsletter/bulk-sender domain the first
-- tranche missed WITHOUT a deploy.
create table if not exists generic_email_domains (
  domain text primary key,
  note text,
  added_by text,
  created_at timestamptz not null default now(),
  -- Stored normalized, so `lower()` at read time is never load-bearing.
  constraint generic_email_domains_normalized check (domain = lower(btrim(domain))),
  -- A bare host and nothing else: no `@`, no scheme, no path, no spaces. An
  -- address ("billing@gmail.com") or a label ("gmail") saved here would sit in
  -- the table looking blocked while matching nothing forever.
  constraint generic_email_domains_host check (domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'),
  -- Must have an interior dot: "com" or ".com" blocks nothing.
  constraint generic_email_domains_has_dot check (position('.' in domain) > 1)
);

comment on table generic_email_domains is
  'Q69 inc.24 — extra generic/bulk email domains, ADDED to the hardcoded floor in lib/comms/genericDomains.ts. Never a replacement for it.';

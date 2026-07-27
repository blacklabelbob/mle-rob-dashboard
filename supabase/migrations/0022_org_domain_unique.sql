-- Q69 (Email → company graph) increment 8: one domain, one company.
--
-- The Q69 scope names this invariant verbatim ("the (team_id, lower(domain))
-- unique index"). This deployment is single-tenant — there is no team_id column
-- on orgs — so the key is lower(domain) alone; a tenant column, if one ever
-- lands, extends this index rather than replacing it.
--
-- WHY IT IS AN INDEX AND NOT A CODE CHECK: the reviewer's create path already
-- refuses a domain it can see is taken (orgFromProposal's `domain-already-known`),
-- but that check reads an index built BEFORE the click. Two reviewers accepting
-- the same queued proposal — or one double-click on a slow route — both read
-- "unknown" and both insert. The result is one company split across two rows,
-- with every later email anchoring to whichever the graph index happened to
-- return first. That split is silent, and unpicking it means moving activities
-- and edges by hand. The constraint makes the second write fail instead.
--
-- Verified against prod before writing: 19 org rows, ZERO conflicting domains
-- across domain/website/email, so this applies without any data cleanup.
--
-- PARTIAL, on purpose: `domain` is nullable and most rows carry NULL or ''. A
-- plain unique index treats NULLs as distinct (fine) but would let a second ''
-- row collide with the first (not fine, and not a real conflict) — so blank is
-- excluded from the key entirely rather than being made to mean something.

begin;

create unique index if not exists orgs_domain_unique
  on orgs (lower(domain))
  where domain is not null and btrim(domain) <> '';

commit;

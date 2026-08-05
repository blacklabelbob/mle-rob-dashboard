-- APPLY-STATUS: PENDING (owner: rob)
--
-- 2026-08-05 — the work we do BEFORE a company pays is the whole GTM, and it is
-- the one thing the CRM does not record.
--
-- ROB, 2026-08-05: *"that isnt their live website but we SHOULD be capturing the
-- mockups we create for them."*
--
-- HOW THIS SURFACED. The domain backfill scored `orgs.website` for Miga Food
-- Manufacturing as `miga-food-manufacturing.pages.dev` — a Cloudflare Pages
-- preview host — and held it rather than writing it as an identity key. The host
-- pattern was the tell, but the real finding is upstream: **that URL is a mockup
-- WE built, sitting in the column meant for THEIR site.** One column was carrying
-- two different facts, so both were wrong: the company looked like it had a
-- website it does not have, and the artifact that actually sells had nowhere to live.
--
-- THIS IS NOT A MIGA PROBLEM. `public/geo/cg-roofing-audit.html` is a GEO audit
-- built for CG Roofing Group, and it is attached to no company record at all. The
-- PVP motion — show up having already done specific, unpaid, valuable work on the
-- prospect's own data — produces one of these per prospect, and every one of them
-- is currently an untracked file or a URL in the wrong field.
--
-- WHY A TABLE AND NOT A COLUMN: a single prospect gets several. Omega alone is
-- already down for a site mockup, a search-volume breakdown, AI avatar examples
-- and a ClearClose dashboard demo. A `demo_url` column would hold the first one
-- and silently lose the rest.
--
-- NOTHING EXISTING CHANGES. `orgs.website` keeps its meaning (their real site);
-- this table is additive, and no reader is affected until something queries it.

create table if not exists client_demos (
  id             text primary key,
  -- Either an org or a person can be the subject; exactly one, enforced below.
  org_id         text references orgs(id) on delete cascade,
  person_id      text references people(id) on delete cascade,
  kind           text        not null,
  title          text        not null,
  -- Where it lives. A hosted preview has a url; a file in the repo has a path.
  url            text,
  artifact_path  text,
  -- WHY it was built and what it was meant to prove — the sentence that makes it
  -- reusable six months later when nobody remembers the pitch.
  purpose        text,
  built_on       date        not null,
  -- Was it actually put in front of them, or does it exist and nobody saw it?
  -- These are different states and conflating them is how work goes unspent.
  shown_on       date,
  status         text        not null default 'built',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- The vocabulary, in Postgres rather than in prose (CR-3). Guarded by name because
-- `add constraint` has no `if not exists` and this file must be re-runnable.
do $$ begin
  alter table client_demos add constraint client_demos_kind_check
    check (kind in ('site_mockup','geo_audit','roi_calculator','avatar_demo',
                    'dashboard_demo','research_brief','lead_magnet','other'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table client_demos add constraint client_demos_status_check
    check (status in ('built','shown','superseded','retired'));
exception when duplicate_object then null;
end $$;

-- A demo with no subject is an orphan; a demo with two is ambiguous. Exactly one.
do $$ begin
  alter table client_demos add constraint client_demos_one_subject
    check (num_nonnulls(org_id, person_id) = 1);
exception when duplicate_object then null;
end $$;

-- It has to be findable. A row that records neither a URL nor a path records nothing.
do $$ begin
  alter table client_demos add constraint client_demos_has_location
    check (num_nonnulls(url, artifact_path) >= 1);
exception when duplicate_object then null;
end $$;

create index if not exists client_demos_org_idx    on client_demos(org_id);
create index if not exists client_demos_person_idx on client_demos(person_id);

comment on table client_demos is
  'The unpaid work built FOR a prospect before they buy — site mockups, GEO audits, ROI calculators, avatar demos. Rob 2026-08-05: "we SHOULD be capturing the mockups we create for them." Distinct from orgs.website, which is THEIR site; a preview host in that column is a mockup filed in the wrong place.';

comment on column client_demos.status is
  'built = exists, nobody has seen it · shown = put in front of them (shown_on set) · superseded = a newer demo replaced it · retired = no longer represents what we would build. built vs shown is the difference between work done and work spent.';

-- Task MC.8 leg 2: the four creatable read-model views + the SELECT-only
-- `dashboard_ro` role. The contract these implement is CODE, not prose:
-- `lib/readModel/contract.ts` (generated into docs/data-contract.md). A test
-- (lib/__tests__/readModelSql.test.ts) parses THIS file and asserts every view
-- exposes exactly the contract's column list — the SQL and the registry cannot
-- drift without failing the suite.
--
-- Only four of the six read models appear here. `rm_delivery_phases` and
-- `rm_invoices_ar` have no backing store in Postgres (see contract.ts for the
-- evidence and the unblocking task); shipping empty views for them would fake
-- two features, so they are deliberately absent rather than silently stubbed.
--
-- SECURITY POSTURE (load-bearing, read before "fixing" the advisor warning):
-- these views are intentionally NOT `security_invoker`. They run as their
-- owner, which is the entire point — `dashboard_ro` is granted SELECT on the
-- VIEWS and holds no grant of any kind on `deals`, `people`, `tasks`,
-- `documents`, `signature_requests` or `signature_events`. A panel connecting
-- as that role can therefore see exactly the columns a view chose to expose
-- and can reach nothing else, including every column in contract.ts's
-- NEVER_EXPOSED list (token hashes, signer IP/UA, file digests). Flipping
-- these to security_invoker would break the role by design, not fix it.
--
-- Additive only: creates views + a NOLOGIN role. Zero rows touched.

begin;

-- ---------------------------------------------------------------------------
-- rm_pipeline — one row per deal (buildable_now)
-- ---------------------------------------------------------------------------
create or replace view rm_pipeline as
select
  d.id                                as deal_id,
  d.name                              as deal_name,
  d.stage                             as stage,
  d.value                             as value,
  d.owner_id                          as owner,
  d.person_id                         as person_id,
  d.org_id                            as org_id,
  coalesce(p.name, o.name)            as counterparty_name,
  d.vertical_id                       as vertical_id,
  d.routing_lane                      as routing_lane,
  d.updated_at                        as stage_entered_at,
  d.created_at                        as created_at
from deals d
left join people p on p.id = d.person_id
left join orgs   o on o.id = d.org_id;

-- ---------------------------------------------------------------------------
-- rm_esign_status — agreement + its signature request (buildable_empty)
-- Left join: a document with no request yet is still a real row the panel
-- must show ("drafted, never sent"), so the request side is nullable.
-- ---------------------------------------------------------------------------
create or replace view rm_esign_status as
select
  doc.id                              as document_id,
  doc.title                           as title,
  doc.phase                           as phase,
  doc.status                          as document_status,
  doc.person_id                       as person_id,
  doc.org_id                          as org_id,
  doc.deal_id                         as deal_id,
  sr.id                               as request_id,
  sr.status                           as request_status,
  sr.signer_name                      as signer_name,
  sr.signer_email                     as signer_email,
  sr.signer_type                      as signer_type,
  sr.created_at                       as sent_at,
  sr.viewed_at                        as viewed_at,
  sr.signed_at                        as signed_at,
  sr.expires_at                       as expires_at,
  doc.countersigned_at                as countersigned_at
from documents doc
left join signature_requests sr on sr.document_id = doc.id;

-- ---------------------------------------------------------------------------
-- rm_action_items — open work with an owner and a due date (buildable_now)
-- ---------------------------------------------------------------------------
create or replace view rm_action_items as
select
  t.id                                as task_id,
  t.title                             as title,
  t.detail                            as detail,
  t.status                            as status,
  t.due_date                          as due_date,
  t.assigned_to                       as assigned_to,
  t.deal_id                           as deal_id,
  t.person_id                         as person_id,
  t.created_at                        as created_at
from tasks t;

-- ---------------------------------------------------------------------------
-- rm_nudge_activity — delivery rungs actually sent (buildable_empty)
-- Filtered to the delivery event types; the rest of signature_events is the
-- certificate chain, not nudge activity.
-- ---------------------------------------------------------------------------
create or replace view rm_nudge_activity as
select
  e.id                                as event_id,
  e.request_id                        as request_id,
  e.type                              as event_type,
  e.at                                as occurred_at,
  e.meta                              as meta,
  sr.document_id                      as document_id,
  sr.status                           as request_status
from signature_events e
join signature_requests sr on sr.id = e.request_id
where e.type in ('nudge', 'sent', 'resent');

-- ---------------------------------------------------------------------------
-- dashboard_ro — SELECT on the views, nothing else, ever.
-- NOLOGIN: it is granted to a connection role, never authenticated directly.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dashboard_ro') then
    create role dashboard_ro nologin;
  end if;
end
$$;

-- Belt and braces: revoke anything inherited from PUBLIC on the base tables so
-- the role's only path to data is a view.
revoke all on deals, people, orgs, tasks, documents, signature_requests,
  signature_events from dashboard_ro;

grant usage on schema public to dashboard_ro;
grant select on rm_pipeline, rm_esign_status, rm_action_items,
  rm_nudge_activity to dashboard_ro;

-- No default privileges: a future table must be granted deliberately, not
-- inherited. (Stated as a comment because the absence of a GRANT is the rule.)

commit;

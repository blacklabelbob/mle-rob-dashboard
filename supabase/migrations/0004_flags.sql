create table if not exists flags (
  id bigint generated always as identity primary key,
  entity_id text,
  entity_name text not null,
  title text not null,
  detail text not null,
  severity text not null default 'medium' check (severity in ('high','medium','low')),
  status text not null default 'open' check (status in ('open','resolved')),
  notified_at date not null default current_date,
  resolved_at date,
  resolution_note text,
  created_at timestamptz not null default now()
);
alter table flags enable row level security;
insert into flags (entity_id, entity_name, title, detail, severity, status, notified_at, resolved_at, resolution_note) values
('cg-roofing-group','CG Roofing Group','Registry conflict: ACTIVE vs dissolved','Official sunbiz.org shows the LLC ACTIVE; registry mirror bisprofiles.com shows voluntarily dissolved 2025-07-23. Verify entity standing before the 3-way CRM partnership contract reaches counsel.','high','open','2026-07-18',null,null),
('miga-food-manufacturing','Miga Food Manufacturing','Name discrepancy: Jaenvega vs Roach','Miga site lists Managing Partner "Daniella Jaenvega"; CRM + Sunbiz say "Daniella Roach".','medium','resolved','2026-07-18','2026-07-22','Rob: same person — Jaenvega recorded as her alias on both records.'),
('red-rock-roofing','Red Rock Roofing (UT)','No public footprint found','No UT entity, no domain; only an expired 2022 license under an unrelated name.','medium','resolved','2026-07-18','2026-07-22','Rob: REAL — Caleb''s new company spinning up soon, part of upcoming MLE work. Keep.');
select count(*) as flags from flags;

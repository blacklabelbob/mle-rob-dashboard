-- Node = person | company | rep (Rob 2026-07-08: "A node could be a person, or a company, or a sales rep")
alter table people add column if not exists entity_kind text
  check (entity_kind in ('person','company','rep'));

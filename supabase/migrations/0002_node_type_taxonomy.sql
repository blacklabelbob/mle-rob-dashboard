-- Taxonomy per Rob's 2026-07-17 rulings (dev-chat batches 3-4):
-- Relationship values simplified; rep archetypes removed; single 'lead'
-- (source moves to its own field with 0003_crm_core). Applied live 2026-07-17;
-- this migration keeps rebuilds truthful.
alter table people drop constraint if exists people_node_type_check;
alter table people add constraint people_node_type_check check (node_type in
  ('mle-admin','partner','lead','client','connector','vertical-anchor','rep-candidate'));

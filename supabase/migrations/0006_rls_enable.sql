-- 2026-07-22: close the RLS gap the 0005 apply surfaced (Supabase advisory).
-- orgs + org_memberships shipped in 0003 WITHOUT row level security — unlike
-- people/edges/flags/deals — and events predates the pattern. The anon key is
-- in the client bundle (dev_chat), so these three were open to direct anon
-- read/write via PostgREST. All app access is server-side service-role (which
-- bypasses RLS), so enabling with no policies changes nothing for the app and
-- slams the anon path shut — identical to every other table.
alter table orgs enable row level security;
alter table org_memberships enable row level security;
alter table events enable row level security;

-- The Network — core schema (Rob's 2026-07-04 storage decision: Supabase)
-- Mirrors lib/types.ts; nested objects live as JSONB.

create table if not exists verticals (
  id text primary key,
  name text not null,
  color text not null
);

create table if not exists people (
  id text primary key,
  name text not null,
  business text,
  role text,
  node_type text check (node_type in ('client','connector','phone-attacker','social-butterfly','vertical-anchor','partner')),
  vertical_id text not null references verticals(id),
  phone text,
  email text,
  website text,
  referred_by_id text references people(id),
  relationship text,
  status text not null check (status in ('lit','warm','unlit')),
  quoted_amount numeric,
  signed boolean not null default false,
  meeting_video_url text,
  transcript_url text,
  est_time_to_payment_days integer,
  key_dates jsonb not null default '{}'::jsonb,
  phase_one text not null default 'not-started' check (phase_one in ('not-started','in-progress','complete')),
  description text,
  estimate jsonb,
  notes text,
  assigned_rep text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edges (
  id text primary key,
  from_id text not null references people(id),
  to_id text not null references people(id),
  relationship text,
  suggested boolean default false
);

create table if not exists projects (
  id text primary key,
  name text not null,
  category text not null check (category in ('revenue-system','product-build','internal')),
  theme text not null check (theme in ('sign-the-agreement','get-paid-fast','reduce-all-friction')),
  completion integer not null default 0 check (completion between 0 and 100),
  owner text not null check (owner in ('Rob','Will','Max')),
  summary text,
  link text,
  will_items jsonb,
  updated_at text not null
);

-- Server-only access: the dashboard uses the service-role key from Next.js
-- server code. Lock the anon role out entirely.
alter table verticals enable row level security;
alter table people enable row level security;
alter table edges enable row level security;
alter table projects enable row level security;

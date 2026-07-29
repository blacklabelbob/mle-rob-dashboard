-- Submissions: intake from the MLE Automated Submission Form (/submit).
-- The full form payload is stored verbatim as JSONB (the paper trail — includes
-- _audit waiver/attestation ISO timestamps and _submittedAt). A few high-signal
-- fields are promoted to columns for querying without digging into the blob:
--   can_pay        = payload.canPay  ("yes" | "no")
--   branch         = payload.branch  ("referral" | "proceed" | null)
--   business_name  = payload.bizname
create table if not exists submissions (
  id text primary key,
  payload jsonb not null,
  can_pay text,
  branch text,
  business_name text,
  created_at timestamptz not null default now()
);

-- Server-only access, same posture as 0001_network.sql: the /api/submit route
-- writes with the service-role key (bypasses RLS). Lock the anon role out.
alter table submissions enable row level security;

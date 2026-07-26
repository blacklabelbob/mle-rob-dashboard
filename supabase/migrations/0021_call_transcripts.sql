-- Q68 (b) inc.2 (2026-07-26): call transcripts, SEGMENT-GRANULAR.
-- Design ported (not code-copied) from the 2026-07-25 Macro teardown, 05-calls-voice.md.
-- Macro is AGPL-3.0; this is retyped against the documented SHAPE.
--
-- WHAT THIS IS: two tables. `call_transcripts` is one row per recording (which call, which
-- provider produced it, what state it is in). `call_transcript_segments` is one row per
-- utterance, with millisecond offsets and a speaker.
--
-- WHY SEGMENTS AND NOT A TEXT BLOB (the queue item says this in one line; here is why it
-- is a schema decision and not a preference): a blob can be read, and nothing else. The
-- two things a rep actually does with a recorded call — jump to the moment a price was
-- said, and follow the words while the audio plays — are both (offset -> text) lookups.
-- A blob answers neither without re-deriving offsets that the provider already gave us
-- and we chose to throw away. Segments also make "who said it" a column instead of a
-- convention buried in a string like "Speaker 1:".
--
-- WHY TWO TABLES AND NOT ONE: a transcript exists before its segments do (a Deepgram job
-- is requested, then returns) and can exist with zero segments (silence, or a failure).
-- One table would force us to encode "requested but not back yet" as an absence, which is
-- indistinguishable from "never requested" — the exact state a retry needs to tell apart.
--
-- IDENTITY IS DERIVED, NEVER RANDOM — the (a) increment's rule, held a second time:
--   * a transcript is keyed by `recording_sid`, unique. Twilio re-POSTs its webhook on any
--     non-2xx and a transcription job can be re-requested; a random id stacks duplicate
--     transcripts on one call instead of upserting the same one.
--   * a segment is keyed by (transcript_id, idx), unique. Re-delivery of the same provider
--     payload therefore overwrites segment 7 rather than appending a second segment 7.
-- Both are what make the whole path idempotent under retry, which is the only mode a
-- webhook ever runs in.
--
-- WHERE WE DIVERGE FROM MACRO, ON PURPOSE:
--   1. CHECK-constrained text, not Postgres ENUMs — 0015/0017/0019 precedent
--      (ALTER TYPE ... ADD VALUE cannot run inside a transaction block; a CHECK edit can).
--   2. Nothing granted to `dashboard_ro` (0011). Call content reaches the read-model role
--      only through a view, deliberately: a transcript is the most sensitive text in this
--      database and it is not going to leak through a role nobody re-audited.
--   3. `activity_id` is a plain text column, NOT a foreign key to `activities`. Activities
--      live behind getStore() and the fallback store is not Postgres (STORAGE_SOURCE); an
--      FK here would make the transcript path fail on exactly the deployments where the
--      activity row does not live in this database.
--
-- SCOPE OF THIS INCREMENT — read before assuming anything renders:
--   * the tables, their constraints and indexes exist; the pure TS accessor exists.
--   * NO route writes them, NO UI shows them, and there are ZERO rows. Deepgram + the
--     model call are Q68 (c). Q68 does not tick on this.
--
-- Additive DDL only. No existing row is read or written. No money, signed, quoted or paid
-- field is touched. Nothing is deleted. STORAGE_SOURCE untouched.

create table if not exists call_transcripts (
  id uuid primary key default gen_random_uuid(),

  -- The Twilio recording this transcribes. UNIQUE: one transcript per recording, so a
  -- re-requested job upserts instead of forking the call into two transcripts.
  recording_sid text not null unique check (length(btrim(recording_sid)) > 0),

  -- The activity row the call was filed on (lib/calls/recordingActivity.ts builds
  -- `dialer-<recordingSid>`). Text, not an FK — see divergence 3 above.
  activity_id text check (activity_id is null or length(btrim(activity_id)) > 0),

  -- 'pending'  = job requested, nothing back yet
  -- 'complete' = provider returned; segments are whatever it returned, possibly zero
  -- 'failed'   = provider returned an error; `error` says which
  -- The three are distinct because a retry must not re-run a completed job and must not
  -- treat a never-requested call as a failed one.
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'failed')),

  provider text not null default 'deepgram' check (length(btrim(provider)) > 0),
  model text check (model is null or length(btrim(model)) > 0),
  language text check (language is null or length(btrim(language)) > 0),

  -- null, never 0 — 0 seconds is a real value meaning "never connected", and using it for
  -- "we do not know" makes an unknown-length call look like a failed one.
  duration_ms integer check (duration_ms is null or duration_ms >= 0),

  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A failure with no reason is an unactionable row; a completed transcript carrying an
  -- error is two contradictory claims about the same call.
  constraint call_transcripts_status_error check (
    (status = 'failed' and error is not null and length(btrim(error)) > 0)
    or (status <> 'failed' and error is null)
  )
);

create table if not exists call_transcript_segments (
  id uuid primary key default gen_random_uuid(),

  transcript_id uuid not null references call_transcripts (id) on delete cascade,

  -- Position in the provider's output. Segment identity, with transcript_id (below).
  idx integer not null check (idx >= 0),

  -- Milliseconds from the start of the recording. Integers, not floats: a float offset
  -- compares unequally to itself across a round-trip, and a seek target that fails an
  -- equality test is a playback bug nobody can reproduce.
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= 0),

  -- Whatever the provider's diarisation called them ('0', 'speaker_1', ...). Free text on
  -- purpose: mapping a diarised channel to a rep or a contact is a JUDGEMENT (Q68 c), and
  -- a guess stored in a column reads later as a fact.
  speaker text check (speaker is null or length(btrim(speaker)) > 0),

  -- Non-blank: a segment with no words is not a moment anyone can jump to.
  text text not null check (length(btrim(text)) > 0),

  -- Provider confidence, 0..1. null when the provider gives none — never defaulted to 1,
  -- which would assert certainty we were not given.
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),

  created_at timestamptz not null default now(),

  -- A segment that ends before it starts is un-seekable and un-sortable. Equal is allowed:
  -- providers do emit zero-length tokens.
  constraint call_transcript_segments_span check (end_ms >= start_ms)
);

-- Segment identity. Re-delivery of the same payload overwrites, never appends.
create unique index if not exists call_transcript_segments_idx_uniq
  on call_transcript_segments (transcript_id, idx);

-- Playback: read one transcript in time order. Covers both the render and the
-- (offset -> segment) seek the player does on every tick.
create index if not exists call_transcript_segments_time_idx
  on call_transcript_segments (transcript_id, start_ms);

-- Moment search across calls: "who mentioned financing". 'simple' (not 'english') matches
-- 0007's people/orgs search so one query language covers the whole dashboard.
create index if not exists call_transcript_segments_fts_idx
  on call_transcript_segments using gin (to_tsvector('simple', text));

create index if not exists call_transcripts_activity_idx
  on call_transcripts (activity_id) where activity_id is not null;

create index if not exists call_transcripts_status_idx
  on call_transcripts (status) where status = 'pending';

-- RLS ON, NO POLICIES — the 0006/0015/0017/0019 posture, and more load-bearing here than
-- anywhere it has been applied before: the anon key ships in the client bundle (dev_chat
-- uses it), the dashboard is currently unauthenticated by Rob's 7/21 call (Q64), and these
-- two tables would hold verbatim customer conversations. Without this line they would be
-- anon-READABLE and anon-WRITABLE through PostgREST. Real policies ride with Q66/Q64.
alter table call_transcripts enable row level security;
alter table call_transcript_segments enable row level security;

comment on table call_transcripts is
  'Q68 (b): one row per recorded call being transcribed. Keyed by recording_sid so a '
  'retried Twilio webhook or a re-requested job upserts instead of forking the call.';

comment on table call_transcript_segments is
  'Q68 (b): one row per utterance with ms offsets — segments, not a blob, because moment '
  'search and playback sync are both (offset -> text) lookups a blob cannot answer.';

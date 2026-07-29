-- Events: upcoming events as network opportunities (PRD 5.4).
-- attendee_ids is a plain jsonb array of people.id — same convention as key_dates/estimate.
create table if not exists events (
  id text primary key,
  name text not null,
  date date not null,
  location text,
  description text,
  attendee_ids jsonb,
  link text
);

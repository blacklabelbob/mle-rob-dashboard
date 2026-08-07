/**
 * Q86 inc.1 — the calendar spine, as arithmetic rather than as a paragraph.
 *
 * Rob, 2026-07-31, verbatim and for the umpteenth time: *"You gotta sort through it and make sure
 * every meeting on my calendar is accounted for by looking through all that shit, email, fathom,
 * fireflies, notion... Transcripts for All."* — and then: *"See that reframes things for you but
 * I've told you that multiple times."* `docs/ops/MEETING-SOURCE-MAP.md` exists because the telling
 * kept not sticking. This module exists because the map is prose, and prose cannot be run.
 *
 * THE GOVERNING RULE, ENCODED: **the calendar is the spine.** A meeting exists because it is on
 * Rob's calendar. Every other system — Fireflies, Gemini, Fathom, Notion, Gmail, Drive, this repo —
 * is a *possible recording of it*, and each one may be missing, partial, duplicated or wrong. So
 * the unit of this report is a CALENDAR EVENT, never a recording, and a source that holds a record
 * nobody's calendar knows about is reported as its own class rather than quietly promoted into a
 * meeting. Q85's whole opening finding was a system that counted recordings and thought it had
 * counted meetings.
 *
 * WHAT IT REFUSES, and each refusal is a row already paid for on this queue:
 *
 *   1. **It never merges on a title.** Rob's DoD says duplicates converge onto ONE meeting record
 *      carrying multiple source links, and *"an uncertain pair is left BOTH and flagged rather
 *      than welded"*. A source record is linked only on an explicit calendar id, or on same-day
 *      AND identical normalized title. Anything weaker than that is `uncertain` — reported beside
 *      the meeting, never counted as coverage for it.
 *   2. **It never converts a reader's silence into a claim about the meeting.** This is
 *      INCIDENT-LEDGER #22/#34, the defect that produced the retracted Omega 7/28 ask. A meeting
 *      with no transcript found is `owed-a-human`, not "no transcript exists". The ONLY reason
 *      this module will state for an absent transcript is one the CALENDAR ITSELF proves: an event
 *      with no conference link and a physical location could not have been joined by any bot.
 *      Every other absence stays an open question with a name on it.
 *   3. **It never reads a clock.** Which events are "past" is the caller's judgement, passed in.
 *      A pure module that asks `Date.now()` reports a different answer to two runs a minute apart.
 *
 * PURE per CR-3: no clock, no network, no Supabase, no Notion, no filesystem. It counts and
 * classifies what it was handed. It never fetches a source, never writes a record, never opens a
 * page, and never summarises a meeting.
 */

/** The seven places a recording of one of Rob's meetings might live. See MEETING-SOURCE-MAP.md. */
export type MeetingSource =
  | "fireflies"
  | "gemini"
  | "fathom"
  | "notion"
  | "gmail"
  | "drive"
  | "local-repo";

/** One past event on Rob's calendar — the spine. Facts as the calendar states them, nothing derived. */
export type CalendarMeeting = {
  id: string;
  title: string;
  /** Local calendar day, `YYYY-MM-DD`. The caller owns the timezone; this module never converts one. */
  day: string;
  /** True when the event carries a Meet/Zoom/Teams link — i.e. a bot COULD have joined it. */
  hasConferenceLink: boolean;
  /** A street address or room, when the event carries one and no conference link. */
  location?: string;
};

/** One record held by one source that MIGHT be a recording of a calendar meeting. */
export type SourceRecord = {
  source: MeetingSource;
  /** That source's own id for the record — a Notion page id, a Fireflies transcript id, a path. */
  id: string;
  title: string;
  /** Local day, `YYYY-MM-DD`, when the source states one. Absent is common and is not a failure. */
  day?: string;
  /** The calendar event id, when the source carries it. The only certain link there is. */
  calendarEventId?: string;
  hasTranscript: boolean;
  hasVideo: boolean;
  url?: string;
};

/**
 * How a source record came to sit under a calendar meeting. Carried on every link so a reader can
 * audit the join without re-deriving it — and so `day-and-title` can be downgraded later without
 * anyone having to guess which links were affected.
 */
export type LinkBasis = "calendar-id" | "day-and-title";

export type SourceLink = {
  source: MeetingSource;
  id: string;
  basis: LinkBasis;
  hasTranscript: boolean;
  hasVideo: boolean;
  url?: string;
};

/**
 * A source record that shares a DAY with a meeting and resembles its title without matching it.
 * Deliberately not a link: it is the thing a human must rule on. Kept beside the meeting so the
 * question is visible at the point it arises, rather than in a separate list nobody opens.
 */
export type UncertainMatch = {
  source: MeetingSource;
  id: string;
  title: string;
  /** Stated in full so the reader never has to reconstruct why this was neither linked nor dropped. */
  why: string;
};

/**
 * What we can honestly say about one calendar meeting's coverage.
 *
 *   - `transcript-and-video` — Rob's bar, fully met on this row.
 *   - `transcript-only`      — his stated minimum ("Transcripts for All"); video is "for most".
 *   - `video-only`           — a recording exists and nothing has been transcribed from it yet.
 *   - `in-person-no-recorder-possible` — the ONE absence the calendar itself explains.
 *   - `owed-a-human`         — nothing found, and nothing about the event explains why. NOT a
 *                              finding about the meeting; a finding about our search.
 */
export type CoverageStatus =
  | "transcript-and-video"
  | "transcript-only"
  | "video-only"
  | "in-person-no-recorder-possible"
  | "owed-a-human";

export type MeetingCoverageRow = {
  meetingId: string;
  title: string;
  day: string;
  status: CoverageStatus;
  links: SourceLink[];
  transcriptSources: MeetingSource[];
  videoSources: MeetingSource[];
  uncertain: UncertainMatch[];
  /**
   * Why this row has no transcript, in words a human can act on. Present ONLY on
   * `in-person-no-recorder-possible` and `owed-a-human`, and the two say very different things
   * on purpose — one is closed, the other is open work.
   */
  reason?: string;
};

/** A source record no calendar event claims. Reported, never promoted into a meeting. */
export type UnclaimedRecord = {
  source: MeetingSource;
  id: string;
  title: string;
  day?: string;
  why: string;
};

export type SpineReconciliation = {
  rows: MeetingCoverageRow[];
  unclaimed: UnclaimedRecord[];
  counts: {
    meetings: number;
    withTranscript: number;
    withVideo: number;
    /** Rows whose absence the calendar itself explains. Closed work. */
    inPerson: number;
    /** Rows owed a human search. Open work — the number Rob is actually asking about. */
    owedAHuman: number;
    /** Meetings carrying at least one unruled near-match. */
    withUncertain: number;
    unclaimed: number;
  };
};

/**
 * Title normalization for the day-and-title link ONLY.
 *
 * Kept deliberately blunt — case, punctuation and whitespace, nothing else. No stemming, no token
 * overlap, no edit distance: Q85 inc.4 refused edit distance for this exact reason, because a
 * scoring function makes "close enough" a number nobody re-reads, and a wrong weld is
 * unrecoverable while a flagged pair is a click.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Words a title shares with another, ignoring the very short ones. Used ONLY to decide whether a
 * same-day record is worth showing a human as `uncertain` — never to link one.
 */
function sharedTokens(a: string, b: string): string[] {
  const left = new Set(normalizeTitle(a).split(" ").filter((t) => t.length > 2));
  const shared: string[] = [];
  for (const t of new Set(normalizeTitle(b).split(" ").filter((w) => w.length > 2))) {
    if (left.has(t)) shared.push(t);
  }
  return shared;
}

/**
 * Reconcile every past calendar meeting against every source record we hold.
 *
 * Both inputs are supplied by the caller. This module does not know how to reach Google Calendar,
 * Fireflies, Fathom, Notion, Gmail or Drive, and must not learn — the fetchers are where the
 * quotas, the auth and the failure modes live, and none of that belongs anywhere a test runs.
 */
export function reconcileCalendarSpine(
  meetings: CalendarMeeting[],
  records: SourceRecord[],
): SpineReconciliation {
  const claimed = new Set<string>();
  const key = (r: SourceRecord) => `${r.source}:${r.id}`;

  const byCalendarId = new Map<string, SourceRecord[]>();
  for (const r of records) {
    const cid = r.calendarEventId?.trim();
    if (!cid) continue;
    const list = byCalendarId.get(cid) ?? [];
    list.push(r);
    byCalendarId.set(cid, list);
  }

  const rows: MeetingCoverageRow[] = meetings.map((m) => {
    const links: SourceLink[] = [];
    const uncertain: UncertainMatch[] = [];
    const linked = new Set<string>();

    const link = (r: SourceRecord, basis: LinkBasis) => {
      if (linked.has(key(r))) return;
      linked.add(key(r));
      claimed.add(key(r));
      links.push({
        source: r.source,
        id: r.id,
        basis,
        hasTranscript: r.hasTranscript,
        hasVideo: r.hasVideo,
        url: r.url,
      });
    };

    // Rung 1 — the calendar's own id. The only certain join, so it is taken first and
    // unconditionally: a source that carries the event id is not guessing, and neither are we.
    for (const r of byCalendarId.get(m.id) ?? []) link(r, "calendar-id");

    // Rung 2 — same day AND identical normalized title. Rung 3 — same day, some shared words:
    // shown, never linked. A record already linked by id can never be re-read here.
    const wanted = normalizeTitle(m.title);
    for (const r of records) {
      if (linked.has(key(r))) continue;
      if (r.calendarEventId && r.calendarEventId.trim() !== m.id) continue;
      if (!r.day || r.day !== m.day) continue;

      if (normalizeTitle(r.title) === wanted) {
        link(r, "day-and-title");
        continue;
      }
      const shared = sharedTokens(m.title, r.title);
      if (shared.length > 0) {
        uncertain.push({
          source: r.source,
          id: r.id,
          title: r.title,
          why:
            `same day (${m.day}) and shares ${shared.length} word(s) — ${shared.join(", ")} — ` +
            `but the titles are not the same. Left unlinked on purpose: a wrong weld is ` +
            `unrecoverable, this question is one click. A human rules on it.`,
        });
      }
    }

    const transcriptSources = links.filter((l) => l.hasTranscript).map((l) => l.source);
    const videoSources = links.filter((l) => l.hasVideo).map((l) => l.source);

    let status: CoverageStatus;
    let reason: string | undefined;
    if (transcriptSources.length > 0) {
      status = videoSources.length > 0 ? "transcript-and-video" : "transcript-only";
    } else if (videoSources.length > 0) {
      status = "video-only";
    } else if (!m.hasConferenceLink && (m.location ?? "").trim().length > 0) {
      status = "in-person-no-recorder-possible";
      reason =
        `in person at "${m.location!.trim()}" — no conference link on the invite, so no bot could ` +
        `ever have joined. A transcript can only come from someone who was in the room.`;
    } else {
      status = "owed-a-human";
      reason =
        `nothing found in any source we searched. This is a statement about OUR search, not about ` +
        `the meeting — do not report it as "no transcript exists" until every source in ` +
        `docs/ops/MEETING-SOURCE-MAP.md has been checked by hand.`;
    }

    return {
      meetingId: m.id,
      title: m.title,
      day: m.day,
      status,
      links,
      transcriptSources,
      videoSources,
      uncertain,
      reason,
    };
  });

  const unclaimed: UnclaimedRecord[] = records
    .filter((r) => !claimed.has(key(r)))
    .map((r) => ({
      source: r.source,
      id: r.id,
      title: r.title,
      day: r.day,
      why: r.day
        ? `no calendar meeting on ${r.day} carries this id or this title — either the event was ` +
          `never on the calendar, or the calendar read did not cover this day.`
        : `this record states no day, so it cannot be placed against the spine at all. It needs ` +
          `its date read before it can be reconciled.`,
    }));

  return {
    rows,
    unclaimed,
    counts: {
      meetings: rows.length,
      withTranscript: rows.filter((r) => r.transcriptSources.length > 0).length,
      withVideo: rows.filter((r) => r.videoSources.length > 0).length,
      inPerson: rows.filter((r) => r.status === "in-person-no-recorder-possible").length,
      owedAHuman: rows.filter((r) => r.status === "owed-a-human").length,
      withUncertain: rows.filter((r) => r.uncertain.length > 0).length,
      unclaimed: unclaimed.length,
    },
  };
}

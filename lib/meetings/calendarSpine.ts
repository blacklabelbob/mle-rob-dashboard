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
  /**
   * Every Google Meet room code the invite carries, lowercased — from the conference link AND from
   * a URL typed into the location box. An event can carry more than one (Rob's 8/3 invite carries
   * two rooms), so this is a list and never a scalar.
   *
   * It is the strongest join in this module after the calendar's own id: a room code is an
   * identifier the recorder wrote down, not a name a human retyped.
   */
  conferenceCodes?: string[];
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
export type LinkBasis = "calendar-id" | "conference-code" | "day-and-title";

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

/**
 * Q86 inc.7 — the days the calendar read actually covered, as the caller declares them.
 *
 * `startDay` inclusive, `endDay` EXCLUSIVE, both local `YYYY-MM-DD` in the same zone the meetings
 * were placed with. It is the caller's, exactly like `toLocalDay` and exactly like which events
 * are "past": this module may not read a clock, and a window it invented would be a claim about a
 * fetch it never performed.
 */
export type SpineWindow = { startDay: string; endDay: string };

/**
 * Where an unclaimed record sits relative to the read — the distinction inc.6 wrote down as
 * "either the event was never on the calendar at all, or one whose invite the read did not reach",
 * and said must not be guessed.
 *
 *   - `undated`             — the record states no day; it cannot be judged against a window at all.
 *   - `unknown-window`      — no window was declared, so nothing here knows what the read covered.
 *   - `outside-window`      — an artefact of how far the read went. Widen the snapshot, then re-ask.
 *   - `in-window-day-empty` — the read covered that day and the calendar holds NO event on it. The
 *                             recording is of something that was never on this calendar.
 *   - `in-window-day-busy`  — the read covered that day, the calendar holds events on it, and none
 *                             of them is this. The candidates are named so a human rules in minutes.
 *
 * The last two are opposite findings with opposite fixes, and folding them together is how a
 * calendar gap and a matching gap end up in one number nobody can act on.
 */
export type UnclaimedPlacement =
  | "undated"
  | "unknown-window"
  | "outside-window"
  | "in-window-day-empty"
  | "in-window-day-busy";

/** A source record no calendar event claims. Reported, never promoted into a meeting. */
export type UnclaimedRecord = {
  source: MeetingSource;
  id: string;
  title: string;
  day?: string;
  placement: UnclaimedPlacement;
  /**
   * Every meeting the spine holds on this record's day, when there are any. Named rather than
   * counted: the whole point of `in-window-day-busy` is that a human can look at three titles and
   * settle in a minute what no title-matching rule is allowed to settle for them.
   */
  sameDayMeetings: { id: string; title: string }[];
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
    /**
     * Unclaimed records the read DID cover — the only unclaimed number that is a finding. The
     * other two are reported beside it and never added into it: `outside-window` is an artefact of
     * the read's reach and `undated` is a record that cannot be judged at all.
     */
    unclaimedInWindow: number;
    unclaimedOutsideWindow: number;
    unclaimedUndated: number;
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
 * Q86 inc.6 — a Google Meet room code as it appears in a recorder's own title.
 *
 * Fireflies, when it joins a room it was not given a title for, names the transcript after the room:
 * `snf-vmxj-dpo`, `bsn-kwzp-wch`, `aob-fada-amf`. Those three sat in the unclaimed list for two
 * increments looking like orphans, while the calendar event they belong to was in the same report,
 * on the same day, carrying that exact code in its invite. The spine had the identifier on both
 * sides and was comparing prose instead.
 *
 * Anchored to word boundaries so a code must be a whole token — a substring hit inside a longer
 * slug is not this format and must not link a meeting.
 */
const MEET_CODE = /(?:^|[^a-z0-9])([a-z]{3}-[a-z]{4}-[a-z]{3})(?![a-z0-9])/g;

/** Every Meet-shaped code in a string, lowercased. Empty for a normal human title, which is the point. */
export function meetCodesIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.toLowerCase().matchAll(MEET_CODE)) found.add(m[1]);
  return [...found];
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
  opts: { window?: SpineWindow } = {},
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

    // Rung 2 — the Meet room code, on the same day. An identifier on both sides: the invite created
    // the room, the recorder titled itself after the room it joined. Stronger than a title, which is
    // retyped by a human, and it is why this rung sits ABOVE `day-and-title` rather than beside it.
    //
    // THE SAME DAY IS REQUIRED, and that is a refusal, not a formality: a recurring invite reuses one
    // room for months, so a code alone would weld January's recording onto June's meeting. Code AND
    // day is an identifier plus a date; a wrong weld here is unrecoverable and this queue has paid
    // for that lesson twice.
    const codes = new Set(m.conferenceCodes ?? []);
    if (codes.size > 0) {
      for (const r of records) {
        if (linked.has(key(r))) continue;
        if (r.calendarEventId && r.calendarEventId.trim() !== m.id) continue;
        if (!r.day || r.day !== m.day) continue;
        const inRecord = [...meetCodesIn(r.title), ...meetCodesIn(r.id)];
        if (inRecord.some((c) => codes.has(c))) link(r, "conference-code");
      }
    }

    // Rung 3 — same day AND identical normalized title. Rung 4 — same day, some shared words:
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

  // Q86 inc.7 — the same-day index is built off the meetings this report actually holds, so a
  // "the calendar has nothing that day" verdict can never be stronger than the read behind it.
  const meetingsByDay = new Map<string, { id: string; title: string }[]>();
  for (const m of meetings) {
    const onDay = meetingsByDay.get(m.day) ?? [];
    onDay.push({ id: m.id, title: m.title });
    meetingsByDay.set(m.day, onDay);
  }

  const placementOf = (day?: string): UnclaimedPlacement => {
    if (!day) return "undated";
    const w = opts.window;
    if (!w) return "unknown-window";
    // End EXCLUSIVE, matching how the window was declared to the fetcher. String compare is exact
    // for `YYYY-MM-DD` and needs no Date, which this module is not allowed to construct.
    if (day < w.startDay || day >= w.endDay) return "outside-window";
    return (meetingsByDay.get(day)?.length ?? 0) > 0 ? "in-window-day-busy" : "in-window-day-empty";
  };

  const unclaimed: UnclaimedRecord[] = records
    .filter((r) => !claimed.has(key(r)))
    .map((r) => {
      const placement = placementOf(r.day);
      const sameDayMeetings = r.day ? (meetingsByDay.get(r.day) ?? []) : [];
      const why =
        placement === "undated"
          ? `this record states no day, so it cannot be placed against the spine at all. It needs ` +
            `its date read before it can be reconciled.`
          : placement === "unknown-window"
            ? `no calendar meeting on ${r.day} carries this id or this title — and no read window ` +
              `was declared, so nothing here knows whether the calendar was even read for that day.`
            : placement === "outside-window"
              ? `${r.day} is outside the window that was read (${opts.window!.startDay} → ` +
                `${opts.window!.endDay}, end exclusive). An artefact of how far the read reached, ` +
                `not a finding about the meeting — widen the snapshot before counting it as one.`
              : placement === "in-window-day-empty"
                ? `the read covered ${r.day} and the calendar holds NO event that day, so this is a ` +
                  `recording of something that was never on the calendar we read. It may have been ` +
                  `on another calendar or never invited at all — that is a question for a human, ` +
                  `not a conclusion from this report.`
                : `the read covered ${r.day} and the calendar holds ${sameDayMeetings.length} ` +
                  `event(s) that day, none of which carries this id, room code or title: ` +
                  `${sameDayMeetings.map((m) => `"${m.title}"`).join(", ")}. One of them may be it; ` +
                  `a human rules, because welding on a resemblance is exactly what this module refuses.`;
      return { source: r.source, id: r.id, title: r.title, day: r.day, placement, sameDayMeetings, why };
    });

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
      unclaimedInWindow: unclaimed.filter(
        (u) => u.placement === "in-window-day-empty" || u.placement === "in-window-day-busy",
      ).length,
      unclaimedOutsideWindow: unclaimed.filter((u) => u.placement === "outside-window").length,
      unclaimedUndated: unclaimed.filter((u) => u.placement === "undated").length,
    },
  };
}

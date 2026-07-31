/**
 * Q84 — check the CRM against the meeting archive.
 *
 * Rob's reason for putting the meeting record in Notion at all (2026-07-30): *"having the
 * Notion in place will help me confirm the validity of what's in the CRM"*. The archive is
 * only useful if something actually compares the two, so this module is that comparison —
 * and nothing else. It is PURE (CR-3): no clock, no network, no Supabase, no Notion. The
 * caller fetches both sides; this decides what agrees and what does not.
 *
 * The output is deliberately three-sided, because the two disagreements mean opposite things:
 *   - `archiveOnly` — a meeting happened and the CRM has no activity for it. The CRM is
 *     BEHIND the record: whatever was said never reached the org/person it belongs to.
 *   - `crmOnly` — the CRM claims a meeting the archive has no row for. Either the archive
 *     is incomplete (in-person, no recorder) or the CRM row is wrong. Both need a human.
 *   - `ambiguous` — a row that could honestly be more than one CRM activity. Reported,
 *     never resolved by guessing; welding the wrong call onto a company is unrecoverable,
 *     an unmatched pair is a click to fix.
 */

export type ArchiveRow = {
  /** Notion page id. */
  id: string;
  title: string;
  /** YYYY-MM-DD. Empty when the row carries no date — those can never match. */
  day: string;
  /** Notion page url, so a report can link straight to the row. */
  url?: string;
  /** Call-recording url on the row (Fireflies), when one is known. */
  recording?: string;
};

export type CrmMeeting = {
  /** activities.id */
  id: string;
  summary: string;
  /** YYYY-MM-DD, derived from occurred_at by the caller (this module owns no clock). */
  day: string;
  transcriptUrl?: string;
  recordingUrl?: string;
  orgId?: string | null;
  personId?: string | null;
};

/** How a pair was matched, strongest first. Carried into the report so nothing is opaque. */
export type MatchHow = "recording-url" | "date+title" | "date-only (sole pair that day)";

export type Matched = { row: ArchiveRow; meeting: CrmMeeting; how: MatchHow };
export type Ambiguous = { row: ArchiveRow; candidates: CrmMeeting[] };

export type ArchiveCheck = {
  matched: Matched[];
  /** Archive rows with no CRM activity — the CRM is missing the meeting. */
  archiveOnly: ArchiveRow[];
  /** CRM meeting activities with no archive row. */
  crmOnly: CrmMeeting[];
  ambiguous: Ambiguous[];
  counts: {
    archiveRows: number;
    crmMeetings: number;
    matched: number;
    archiveOnly: number;
    crmOnly: number;
    ambiguous: number;
  };
};

const norm = (s: string | undefined) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Fraction of the shorter title's significant words that the other title also has. */
export function titleOverlap(a: string | undefined, b: string | undefined): number {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 3));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}

/**
 * A Fireflies url identifies a recording by its id, but the two sides store different url
 * shapes (`app.fireflies.ai/view/<id>` vs a share link). Compare the id, not the string.
 */
export function recordingKey(url: string | undefined): string {
  const s = (url || "").trim();
  if (!s) return "";
  const tail = s.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
  return tail.toLowerCase();
}

const TITLE_MATCH_FLOOR = 0.6;

/**
 * Reconcile one archive against one set of CRM meeting activities.
 *
 * The ladder mirrors `scripts/notion-meetings-sync.mjs` on purpose — the same evidence
 * should mean the same thing on both sides of the seam. Recording id is proof; everything
 * else is inference, and every inference requires the SAME DAY. A title alone never matches.
 */
export function checkArchiveAgainstCrm(
  rows: ArchiveRow[],
  meetings: CrmMeeting[],
): ArchiveCheck {
  const matched: Matched[] = [];
  const ambiguous: Ambiguous[] = [];
  const claimed = new Set<string>();

  const keyOf = (m: CrmMeeting) => recordingKey(m.transcriptUrl) || recordingKey(m.recordingUrl);

  // Pass 1 — recording id. Proof, so it runs to completion before any inference.
  for (const row of rows) {
    const rk = recordingKey(row.recording);
    if (!rk) continue;
    const hit = meetings.find((m) => !claimed.has(m.id) && keyOf(m) === rk);
    if (hit) {
      claimed.add(hit.id);
      matched.push({ row, meeting: hit, how: "recording-url" });
    }
  }

  const unmatchedRows = rows.filter((r) => !matched.some((m) => m.row.id === r.id));

  // Pass 2 — same day, then title. Ambiguity is surfaced, never broken by a tiebreak.
  for (const row of unmatchedRows) {
    if (!row.day) continue;
    const sameDay = meetings.filter((m) => !claimed.has(m.id) && m.day === row.day);
    if (!sameDay.length) continue;

    const strong = sameDay.filter((m) => titleOverlap(row.title, m.summary) >= TITLE_MATCH_FLOOR);
    if (strong.length === 1) {
      claimed.add(strong[0].id);
      matched.push({ row, meeting: strong[0], how: "date+title" });
      continue;
    }
    if (strong.length > 1) {
      ambiguous.push({ row, candidates: strong });
      continue;
    }

    // No title evidence at all. One row, one meeting, one day is the only safe weak match:
    // with a second candidate on either side there is a real chance of picking the wrong one.
    const rowsThatDay = rows.filter((r) => r.day === row.day).length;
    if (sameDay.length === 1 && rowsThatDay === 1) {
      claimed.add(sameDay[0].id);
      matched.push({ row, meeting: sameDay[0], how: "date-only (sole pair that day)" });
    } else if (sameDay.length > 1) {
      ambiguous.push({ row, candidates: sameDay });
    }
  }

  const matchedRowIds = new Set(matched.map((m) => m.row.id));
  const ambiguousRowIds = new Set(ambiguous.map((a) => a.row.id));
  const archiveOnly = rows.filter((r) => !matchedRowIds.has(r.id) && !ambiguousRowIds.has(r.id));
  const crmOnly = meetings.filter((m) => !claimed.has(m.id));

  return {
    matched,
    archiveOnly,
    crmOnly,
    ambiguous,
    counts: {
      archiveRows: rows.length,
      crmMeetings: meetings.length,
      matched: matched.length,
      archiveOnly: archiveOnly.length,
      crmOnly: crmOnly.length,
      ambiguous: ambiguous.length,
    },
  };
}

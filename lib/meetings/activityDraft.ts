// Q85 inc.1 — the first module on the WRITE side of the meeting gap, and it still writes nothing.
//
// Q84 spent sixty-odd increments making the archive tell the truth about itself, and it ended
// with `activityPlan` answering the only question that was ever in the way: WHICH company each
// orphaned meeting belongs to. That answer has never been turned into a row. The two things that
// can write an `activities` row today are `scripts/publish-meeting-activity.mjs` — which takes a
// payload a human hand-built in `data/meetings/*.activity.json` — and nothing else. So the four
// meeting activities in prod are four files somebody typed, and the 46 in the archive are 46 that
// nobody will.
//
// This module is the missing middle: `ActivityPlanRow` → the exact payload that script already
// validates. It is PURE per CR-3 (no clock, no network, no Supabase, no Notion) and it returns a
// DRAFT — the caller decides whether to write it. The plan/act split is Q84's, kept deliberately:
// welding a call onto the wrong company is unrecoverable, and every refusal below is a place that
// would otherwise have happened silently.
//
// FOUR REFUSALS, each earned by a live row this repo has already read:
//
//   1. NOT `attachable` → no draft. The plan's other four dispositions all mean a human has to
//      answer something first; drafting anyway would put this module's guess where their answer
//      belongs. `unknown-company` in particular has a near-miss attached — that is a question,
//      not a match.
//   2. NO DAY → no draft. `occursOn` is the plan's own resolved day and an activity is an event
//      on a day; there is nothing to put in `occurred_at`. The plan already buckets these as
//      `no-date`, so this is belt-and-braces on the one field a wrong value is unrecoverable in.
//   3. BOILERPLATE SUMMARY → drafted WITHOUT a summary, never with. Q84 inc.45 read a page whose
//      entire 1,300-character body was Notion's canned "you've just created a very short (or
//      empty) recording" apology. Copying that into the CRM would put an advert for a Notion
//      feature on a company record as if it were what was said. `detectEmptyRecordingBoilerplate`
//      already decides this — IMPORTED, not re-implemented, because this repo has twice paid to
//      delete a second copy of one rule.
//   4. A TITLE-DERIVED DAY IS NEVER LAUNDERED. `dayFrom` rides into `sourceContext` untouched, so
//      a row dated from a machine stamp in its own title is distinguishable forever from a row a
//      human dated in Notion. The plan refused to collapse those two; so does this.
//
// ON IDEMPOTENCY, and where the DoD's wording does not survive contact with the data. Q85's DoD
// says "idempotent on the Fireflies id". Live prod says only 14 of the 46 orphaned rows have any
// recording on disk at all, and `ArchiveRowDetail.recording` is empty on most of the rest — so a
// Fireflies id cannot be the key without dropping two thirds of the work on the floor. The key is
// the NOTION PAGE ID, which every archive row has by construction (it is what the row IS). The
// recording url is carried into `sourceContext` when present, so the Fireflies link is never lost
// — it is just not what identity is computed from.

import { detectEmptyRecordingBoilerplate } from "./emptyRecordingBoilerplate";
import type { ActivityPlanRow } from "./activityPlan";

/**
 * The `activities` row, in the exact shape `scripts/publish-meeting-activity.mjs` reads out of
 * `data/meetings/*.activity.json`. Named after that contract on purpose: if the two ever drift,
 * the drift should be a type error here rather than a rejected write at 3am.
 */
export type ActivityDraft = {
  id: string;
  orgId: string;
  type: "meeting";
  source: "notion-archive";
  createdBy: string;
  occurredAt: string;
  bookProtected: false;
  /** Absent when the archive's summary is Notion's empty-recording template — see refusal 3. */
  summary?: string;
  sourceContext: {
    system: "notion";
    database: "Master Meetings Database";
    pageId: string;
    pageUrl?: string;
    /** The Call Recording url when the row carries one. Never the identity key — see the header. */
    recording?: string;
    /** "call-date" | "title", carried verbatim from the plan. Never collapsed into the day. */
    dayFrom: "call-date" | "title";
    /** How the plan agreed on the company, so a reader can weigh it without re-running the plan. */
    matchedBy?: "name" | "domain";
  };
};

/** Why no draft was produced. Every one of these is a human's answer, not a retry. */
export type DraftRefusal =
  | { kind: "not-attachable"; disposition: ActivityPlanRow["disposition"]; why: string }
  | { kind: "no-day"; why: string };

export type DraftResult =
  | { drafted: true; draft: ActivityDraft; /** Stated when the summary was dropped. */ droppedSummary?: string }
  | { drafted: false; refusal: DraftRefusal };

/**
 * `A-MTG-<day>-<page-id-head>`. Deterministic and collision-free by construction: the page id is
 * unique in Notion, so two runs over the same row produce the same id and a re-run updates rather
 * than stacks. The day is in the id only so a human scanning `activities` can read it — identity
 * comes from the page id half, which is why the day half is never the thing that disambiguates.
 *
 * Exported because the writer needs to ask "is this row already in the CRM?" before it writes,
 * and it must ask with the same string this module would produce, not a second recipe for one.
 */
export function draftActivityId(pageId: string, day: string): string {
  const head = (pageId || "").replace(/-/g, "").slice(0, 12).toUpperCase();
  return `A-MTG-${day}-${head}`;
}

/**
 * Q85 inc.2 — the scope line of Q85, as a predicate instead of a paragraph.
 *
 * Q85's DoD is "a meeting **a recorder saw** becomes an activity", and it names what it leaves
 * alone: "the rows no recording explains (Q84's separate pass)". Those two sentences are the
 * same rule read from both sides, and the first live run of the writer proved the rule has
 * teeth: the ONE row in the whole archive that clears the company check is a `needs-human-account`
 * row — placeholder title "Meeting 2026-07-30", no Call Date, no summary, and no recording. The
 * only thing anyone knows about it is a company name somebody typed into Notion.
 *
 * Writing that onto C-2005 would put a meeting on a real company record that nothing witnessed,
 * on a screen Rob shows people, and it would be indistinguishable from the recorded ones next to
 * it. That is the unrecoverable weld the plan/act split exists to prevent, so it is refused HERE,
 * in code, rather than left to whoever is reading the plan output at the time.
 *
 * This is a scope gate, not a truth claim: a row failing it is not "not a meeting". It is a
 * meeting only a human can vouch for, and Q84 is the pass that asks them.
 */
export function recorderSawMeeting(row: { recording?: string }): boolean {
  return Boolean((row?.recording || "").trim());
}

/**
 * @param planRow one row of `planMeetingActivities(...)`, any disposition.
 * @param createdBy who to record as the author of the row — the caller's own label (e.g.
 *   `driver:Q85-inc.2`). Passed in rather than hardcoded so a row can always be traced to the run
 *   that made it, and so this module holds no opinion about who is running it.
 */
export function draftActivityFromPlan(planRow: ActivityPlanRow, createdBy: string): DraftResult {
  if (planRow.disposition !== "attachable" || !planRow.org) {
    return {
      drafted: false,
      refusal: {
        kind: "not-attachable",
        disposition: planRow.disposition,
        why:
          `the plan bucketed this row as ${planRow.disposition}, which means a human answers ` +
          "something before any activity is correct — drafting one now would put a guess where " +
          "their answer goes",
      },
    };
  }
  const day = planRow.occursOn || "";
  if (!day) {
    return {
      drafted: false,
      refusal: {
        kind: "no-day",
        why:
          "the plan resolved a company but no day, and an activity is an event on a day — a " +
          "guessed `occurred_at` is a wrong record, not an incomplete one",
      },
    };
  }

  const rawSummary = (planRow.row.summary || "").trim();
  const boilerplate = rawSummary ? detectEmptyRecordingBoilerplate(rawSummary) : null;
  const dropSummary = boilerplate?.verdict === "boilerplate-only";
  const summary = dropSummary ? undefined : rawSummary || undefined;

  const draft: ActivityDraft = {
    id: draftActivityId(planRow.row.id, day),
    orgId: planRow.org.id,
    type: "meeting",
    source: "notion-archive",
    createdBy,
    // Midday UTC, not midnight: a bare `YYYY-MM-DDT00:00:00Z` renders as the PREVIOUS day in every
    // US timezone this CRM is read in, which would put a meeting on a day it did not happen on a
    // screen Rob shows people. The day is the fact; the hour is not claimed to be one, and
    // `dayFrom` below says where the day came from.
    occurredAt: `${day}T12:00:00.000Z`,
    bookProtected: false,
    ...(summary ? { summary } : {}),
    sourceContext: {
      system: "notion",
      database: "Master Meetings Database",
      pageId: planRow.row.id,
      ...(planRow.row.url ? { pageUrl: planRow.row.url } : {}),
      ...(planRow.row.recording ? { recording: planRow.row.recording } : {}),
      dayFrom: planRow.dayFrom || "call-date",
      ...(planRow.matchedBy ? { matchedBy: planRow.matchedBy } : {}),
    },
  };

  return dropSummary
    ? {
        drafted: true,
        draft,
        droppedSummary:
          "the archive's summary is Notion's empty-recording template and nothing else " +
          `(${boilerplate?.matched.length} markers matched, ${boilerplate?.substantiveChars} substantive chars) — ` +
          "it is not what anyone said, so it is not written onto a company record",
      }
    : { drafted: true, draft };
}

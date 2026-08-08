/**
 * Q86 inc.46 — a refused transcript read, on the record it is waiting on.
 *
 * inc.43/44/45 read all three recovered transcripts end to end. Every one of them was then
 * REFUSED by `planTranscriptActivity`, and every one of those refusals landed in exactly two
 * places a working day never touches: a JSON file under `MLE Internal Meetings/transcript-reads/`
 * and a row on the flags ledger. Rob opens a company or a person. Nothing there says *a
 * 131-minute call about you is sitting on disk, and one missing company record is the only thing
 * standing between it and the timeline*. This module is what a record page asks.
 *
 * PURE (CR-3): no clock, no fs, no network, no Supabase. The reads are ARGUMENTS — the loader is
 * a separate file, so the ladder here is testable against the real reads without a filesystem.
 *
 * THE THREE READS ARE NOT THE SAME SHAPE, AND THAT IS THE FINDING THIS MODULE SURFACES RATHER
 * THAN SMOOTHS. `david-cates-2026-08-08.json` (inc.45) carries an explicit
 * `whyItStillCannotBeFiled` block — primary refusal, secondary refusal, and what would unblock
 * it — because by inc.45 the driver had learned to write it down. `john-burns` (inc.43) and
 * `joseph-ontime` (inc.44) do NOT: their refusals live only in the increment's prose and in
 * `planTranscriptActivity`'s output at the time. So:
 *
 *   - When a read STATES its refusals, they are carried verbatim and `refusalsAreStated` is true.
 *   - When it does not, exactly ONE refusal is derived, and only from a field that cannot mean
 *     anything else: `callDate.resolved === false` → `no-day`. `refusalsAreStated` is false and
 *     the surface prints that the list may be incomplete.
 *
 * It would be one line to also derive `not-linked` for joseph-ontime, and that line is
 * deliberately absent. That read carries a HUMAN RULING (the ROOFING title is a filename error)
 * that the linker is built never to act on; turning the absence of a `status: "linked"` field
 * into a refusal on Rob's screen would be this module deciding a question inc.44 explicitly left
 * to a person. An incomplete list that says it is incomplete beats a complete-looking guess.
 *
 * NOTHING HERE FILES ANYTHING. There is no writer in this file and no caller may infer one: a
 * waiting notice is a statement that a conversation exists and where it is stuck, never a draft
 * of the row it would become.
 */

/** A read as it sits on disk. Loose on purpose — three increments wrote three shapes. */
export type TranscriptRead = {
  _what?: string;
  readAt?: string;
  transcriptRef?: string;
  transcriptTitle?: string;
  recordLink?: {
    /** inc.45 shape: `"P-1020 David Cates"`. */
    record?: string;
    /** inc.43/44 shape: `"C-2013 Vive Health (via P-1015 John Burns)"`. */
    linkedRecord?: string;
    status?: string;
  };
  whyItStillCannotBeFiled?: {
    primary?: { refusal?: string; why?: string; theActualGap?: string };
    secondary?: { refusal?: string; why?: string };
    whatUnblocksIt?: string;
  };
  callDate?: {
    resolved?: boolean;
    latestPossible?: string;
    hardCeiling?: string;
    candidates?: string[];
    whatWouldSettleIt?: string;
  };
};

export type WaitingBlocker = {
  /** `no-org`, `no-day`, … — the refusal kind `planTranscriptActivity` returns. */
  kind: string;
  /** Why, in the read's own words where it wrote them down. */
  why: string;
};

export type WaitingCall = {
  transcriptRef: string;
  transcriptTitle: string;
  readAt: string | null;
  /** Every record id the read names, in the order named. */
  recordIds: string[];
  minutes: number | null;
  words: number | null;
  blockers: WaitingBlocker[];
  /** What would let this call be filed, in the read's own words. Null when it never says. */
  unblock: string | null;
  /** False when the read never enumerated its refusals — the surface must say so. */
  refusalsAreStated: boolean;
};

/** `C-2016`, `P-1020` — the only id shape this CRM has ever minted. */
const RECORD_ID = /\b([CP]-\d{4})\b/g;

function idsIn(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(RECORD_ID)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/**
 * Size is read out of the `_what` sentence every read carries, because no read has a numeric
 * field for it and inventing one would mean rewriting three committed files. Absent or
 * unparseable → null, never a guess: "a call is waiting" is the claim, its length is a courtesy.
 */
function sizeOf(what: string | undefined): { minutes: number | null; words: number | null } {
  const minutes = what?.match(/([\d.]+)\s*min\b/);
  const words = what?.match(/([\d,]+)\s*words\b/);
  return {
    minutes: minutes ? Number(minutes[1]) : null,
    words: words ? Number(words[1].replace(/,/g, "")) : null,
  };
}

function blockersOf(read: TranscriptRead): { blockers: WaitingBlocker[]; stated: boolean } {
  const stated = read.whyItStillCannotBeFiled;
  if (stated?.primary?.refusal) {
    const out: WaitingBlocker[] = [
      {
        kind: stated.primary.refusal,
        why: stated.primary.theActualGap ?? stated.primary.why ?? "",
      },
    ];
    if (stated.secondary?.refusal) {
      out.push({ kind: stated.secondary.refusal, why: stated.secondary.why ?? "" });
    }
    return { blockers: out, stated: true };
  }

  // Derived, and only from the one field that cannot mean anything else.
  const date = read.callDate;
  if (date?.resolved === false) {
    const ceiling = date.latestPossible ?? date.hardCeiling;
    const n = date.candidates?.length ?? 0;
    return {
      blockers: [
        {
          kind: "no-day",
          why:
            `the call date is bounded, not proven — ${n} candidate day${n === 1 ? "" : "s"}` +
            (ceiling ? ` under a ${ceiling} ceiling` : ""),
        },
      ],
      stated: false,
    };
  }
  return { blockers: [], stated: false };
}

/** One read → the notice, or null when the read names no record at all to hang it on. */
export function waitingCallFrom(read: TranscriptRead): WaitingCall | null {
  const recordIds = [
    ...idsIn(read.recordLink?.record),
    ...idsIn(read.recordLink?.linkedRecord),
  ].filter((id, i, all) => all.indexOf(id) === i);
  if (recordIds.length === 0) return null;
  if (!read.transcriptRef) return null;

  const { blockers, stated } = blockersOf(read);
  const { minutes, words } = sizeOf(read._what);
  return {
    transcriptRef: read.transcriptRef,
    transcriptTitle: read.transcriptTitle ?? read.transcriptRef,
    readAt: read.readAt ?? null,
    recordIds,
    minutes,
    words,
    blockers,
    unblock: read.whyItStillCannotBeFiled?.whatUnblocksIt ?? read.callDate?.whatWouldSettleIt ?? null,
    refusalsAreStated: stated,
  };
}

/**
 * Every waiting call that names this record — a company OR a person, because a transcript links
 * to whichever the title happened to name and Rob looks at both. A read that names an org AND
 * the person it came through (`C-2013 … via P-1015 …`) surfaces on BOTH pages on purpose: the
 * call is equally missing from each.
 *
 * A call with ZERO blockers is not returned. Nothing is waiting on the record — it is waiting on
 * someone to run the writer, which is a different sentence and belongs to a different surface.
 */
export function waitingCallsFor(recordId: string, reads: TranscriptRead[]): WaitingCall[] {
  return reads
    .map(waitingCallFrom)
    .filter((c): c is WaitingCall => c !== null)
    .filter((c) => c.recordIds.includes(recordId) && c.blockers.length > 0);
}

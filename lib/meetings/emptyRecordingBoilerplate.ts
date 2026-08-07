/**
 * Q84 inc.45 — the row where the FIELDS were right and the BODY was the lie.
 *
 * Found by reading, not by theory. Archive row `2026-06-05T13:56:00.000-04:00`
 * (Notion `3761de57-0199-8054-86a9-cdc63def71a5`) was scheduled top of the work-list's
 * `read-page` list on the strength of "916 chars of readable text are already on this
 * page — it is unread, not unexplainable". The uncapped read returned 20 blocks /
 * 1,300 chars. Every one of those characters is Notion's own canned apology for a
 * recording that captured nothing:
 *
 *     "Hey there! 👋 It looks like you've just created a very short (or empty)
 *      recording. I don't see any transcript or notes to summarize yet."
 *
 * followed by a feature advert — "What I can do with longer recordings", "Try recording
 * again". There is no meeting on the page. No attendee, no company, no date beyond the
 * title, no sentence either party said.
 *
 * WHY THIS NEEDED CODE AND NOT A NOTE. Q84's governing rule, earned over ten increments
 * of rows whose `Meeting Summary` / `Call Recording` / `Export Status` / `Google Doc Link`
 * fields all said "nothing here" above a full transcript, is: WHEN THE FIELDS CLAIM
 * ABSENCE AND THE BODY HAS CONTENT, TRUST THE BODY. The reader prints exactly that —
 * "⚠ 4 field(s) imply 'no record'. CONTRADICTED — the body below HAS the content.
 * Trust the body, not the field."
 *
 * On THIS row that instruction is inverted. The four fields are telling the truth: there
 * is no recording, no summary, no export, no doc. The body is a template that only looks
 * like content to anything counting characters. A rule that has been right ten times in
 * a row is precisely the rule nobody re-checks, which is how a summariser ends up
 * publishing "Hey there! 👋" onto a company record as what was discussed.
 *
 * So the size heuristic gets one narrow exception, expressed as a decision a caller
 * makes rather than a silent filter: a body can be LONG, WELL-FORMED and STILL CARRY NO
 * MEETING. This module names that state. It does not delete the row, does not mark it
 * read, and does not decide the meeting never happened — a caller may still owe the
 * calendar or the recorder a look. It only refuses to let 1,300 characters of Notion
 * marketing copy be mistaken for 1,300 characters of what somebody said.
 *
 * DELIBERATELY NARROW, because a guard that over-matches gets switched off:
 *
 * 1. TWO INDEPENDENT MARKERS REQUIRED, never one. A real meeting about recording quality
 *    ("the recording came out empty, resend it") will hit one phrase and must not be
 *    suppressed. Matching demands a shape only the generated template has.
 *
 * 2. IT NEVER OUTVOTES REAL TEXT. If the template's markers appear alongside substantive
 *    prose beyond the template's own length, the verdict is `mixed` and a human reads it.
 *    A page that carries the boilerplate AND a transcript is not empty.
 *
 * 3. ABSENCE OF THE TEMPLATE IS NOT A PASS. `no-boilerplate` says only "this specific
 *    generated apology is not present" — it makes no claim that the body is a meeting.
 *    That is the same inversion (`not detected` ⇒ `fine`) Q84 exists to kill.
 *
 * Pure per CR-3: no clock, no network, no Supabase, no filesystem.
 */

export type EmptyRecordingVerdict =
  /**
   * The body is Notion's generated "nothing was recorded" template and nothing else.
   * The four "claims absence" fields on such a row are CORRECT — do not overrule them.
   */
  | "boilerplate-only"
  /**
   * The template is present AND there is substantive text beyond it. A human reads this
   * one: the page may carry a real meeting with the apology stapled above or below it.
   */
  | "mixed"
  /** The template is not present. Says NOTHING about whether the body is a meeting. */
  | "no-boilerplate";

export type EmptyRecordingCheck = {
  verdict: EmptyRecordingVerdict;
  /** Which template markers matched, verbatim, so a verdict is checkable by eye. */
  matched: string[];
  /**
   * Characters of body text that are NOT part of a matched template line. This is the
   * number that decides `boilerplate-only` vs `mixed`, and it is reported either way so
   * a caller never has to take the verdict on faith.
   */
  substantiveChars: number;
  /** One line a human can read without opening the page. */
  why: string;
};

/**
 * DETECTION markers — the distinctive phrases that say "this is the generated template".
 *
 * These are Notion's own product voice, not meeting language, which is the whole reason
 * they are safe to key off. Each alone is a coincidence; two together is the template.
 * Kept deliberately short: a longer detection list makes the two-marker rule easier to
 * trip, which is the opposite of narrow.
 */
const TEMPLATE_MARKERS = [
  "very short (or empty) recording",
  "i don't see any transcript or notes to summarize yet",
  "what i can do with longer recordings",
  "try recording again",
  "looking forward to helping you capture your next conversation",
] as const;

/**
 * The REST of the template's copy — its greeting, its lead-ins and its feature bullets.
 *
 * Separate list, and it exists for ONE job: subtracting the template from the body before
 * measuring what is left. It is emphatically NOT used for detection, because these lines
 * are exactly the ones a genuine meeting could also say — "Meeting summaries" and
 * "Capturing decisions" are plausible headings in a real set of notes, and keying
 * detection off them would suppress real pages.
 *
 * Discovered by measurement, not by guesswork: with only the detection markers stripped,
 * the real 2026-06-05 row still reported 583 chars of "other text" — every character of
 * it template. A subtraction that leaves the template behind lets the template's own
 * length vote for itself.
 */
const TEMPLATE_FILLER = [
  "hey there!",
  "when you record a longer meeting or voice note",
  "i'll distill the main ideas and topics discussed",
  "i'll highlight tasks and next steps that need to be done",
  "i'll note any important decisions that were made",
  "i'll work with any notes you jot down during the recording",
  "feel free to start a new recording and speak for a bit longer",
  "summarizing key points",
  "identifying action items",
  "capturing decisions",
  "enhancing your notes",
  "meeting summaries",
  "voice notes and ideas",
  "lecture or presentation notes",
  "interview transcripts",
] as const;

/** Every line the template can occupy — detection copy plus filler. Stripping only. */
const ALL_TEMPLATE_LINES = [...TEMPLATE_MARKERS, ...TEMPLATE_FILLER];

/** Below this, a leftover fragment is noise, not a meeting. One short sentence. */
const SUBSTANTIVE_CHAR_FLOOR = 120;

/**
 * Does this body carry Notion's generated "nothing was recorded" template?
 *
 * @param bodyText The page body as read, joined however the caller joined it. Block
 *   markup (`[paragraph]`, `[bulleted_list_item]`) may be present or absent; matching is
 *   on the prose, so both forms work.
 */
export function detectEmptyRecordingBoilerplate(bodyText: string): EmptyRecordingCheck {
  const haystack = bodyText.toLowerCase();
  const matched = TEMPLATE_MARKERS.filter((m) => haystack.includes(m));

  if (matched.length < 2) {
    return {
      verdict: "no-boilerplate",
      matched: [...matched],
      substantiveChars: countProse(bodyText),
      why:
        matched.length === 0
          ? "Notion's empty-recording template is not on this page. That is not a finding about " +
            "whether the body is a meeting — it says only that this one template is absent."
          : `Only one template phrase matched («${matched[0]}»), which a real conversation about ` +
            "recordings can say. One marker is a coincidence; the template needs two.",
    };
  }

  // Every line that belongs to the template is removed, then what is LEFT is measured.
  // Measuring the whole body instead would let the template's own length vote for itself.
  const substantiveChars = countProse(stripTemplateLines(bodyText));

  if (substantiveChars >= SUBSTANTIVE_CHAR_FLOOR) {
    return {
      verdict: "mixed",
      matched: [...matched],
      substantiveChars,
      why:
        `Notion's empty-recording template is here (${matched.length} markers) but ` +
        `${substantiveChars} chars of other text sit alongside it. Not empty — a human reads ` +
        "this one; the apology may be stapled to a real meeting.",
    };
  }

  return {
    verdict: "boilerplate-only",
    matched: [...matched],
    substantiveChars,
    why:
      `The body is Notion's generated apology for a recording that captured nothing ` +
      `(${matched.length} template markers, ${substantiveChars} chars of anything else). ` +
      "There is no meeting on this page. The row's empty 'claims absence' fields are CORRECT " +
      "here — the usual 'trust the body, not the field' rule is inverted on this row class.",
  };
}

/**
 * Drop the lines a matched template marker sits on. Line-granular on purpose: the reader
 * emits one block per line, so a line is the smallest unit that is wholly template or
 * wholly not, and a cleverer span-splice would start guessing at sentence boundaries.
 */
function stripTemplateLines(bodyText: string): string {
  return bodyText
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !ALL_TEMPLATE_LINES.some((m) => lower.includes(m));
    })
    .join("\n");
}

/**
 * Characters of actual prose: block-type tags (`[paragraph]`) and whitespace are the
 * reader's own scaffolding, and counting them as content is how 20 empty containers
 * become "1,300 chars of readable text".
 */
function countProse(text: string): number {
  return text
    .replace(/\[[a-z_0-9]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim().length;
}

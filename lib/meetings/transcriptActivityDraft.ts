// Q86 inc.42 — DoD (b)'s writer, as a PLAN: the first module that says what an activity for a
// transcript-on-disk would BE, and it still writes nothing.
//
// Where this sits. inc.39 proved the three Drive recordings were transcribed on 2026-07-28 and are
// linked to nothing. inc.40 gave `transcriptRecordLink` a record to propose. inc.41 read
// `joseph-ontime.txt` and settled the $7,000 question by hand — it is the moving company, the file
// is mis-titled, and **C-2016 has had a 26-minute recording of its own discovery call attached to
// nothing for eleven days**. Every one of those increments ended the same way: attaching it is a
// WRITE, and a write needs a caller that can answer for it. This is that caller's plan half.
//
// PURE per CR-3 — no clock, no fs, no network, no Supabase. The day, the intel and the rows already
// in the CRM are all ARGUMENTS. It returns a payload; something else decides to send it.
//
// THE IDENTITY KEY IS THE TRANSCRIPT REF, and the DoD says so. That is a deliberate departure from
// `activityDraft`, whose key is the Notion page id — correct there, useless here: these three calls
// have no Notion page, which is the entire reason they were invisible. Two consequences, both
// built rather than assumed:
//
//   1. The id is DERIVED from the ref, so two runs over the same file produce the same id and the
//      second is an update, never a second row.
//   2. That is NOT SUFFICIENT and the module does not pretend it is. A human can already have
//      published this same call under a different id — `data/meetings/*.activity.json` is exactly
//      that path, and four such rows are in prod. So the caller passes what the CRM already holds
//      and this refuses on a MATCHING REF under ANY id. Checking only for its own id would stack a
//      duplicate meeting onto a company record, which is the failure Q86(c) names by name.
//
// FIVE REFUSALS, each earned by a live row this repo has read rather than imagined:
//
//   1. NOT `linked` → no draft. `uncertain` is a question with a near-miss attached (inc.41: the
//      title says ROOFING, the record is a moving company, and the code deliberately declined to
//      rule). Drafting on `uncertain` would put this module's guess where a human's read belongs.
//   2. NO ORG → no draft. `activities.org_id` is where a meeting lands, and a transcript can link
//      to a PERSON record — Joseph Green is `P-`, his company is `C-2016`. The registry knows that
//      edge; this module is not given it, so it asks for it rather than inferring one.
//   3. NO DAY → no draft. An activity is an event on a day. A transcript header carries the day it
//      was TRANSCRIBED (2026-07-28 for all three), which is NOT the day the call happened — using
//      it would date a 7/17 conversation eleven days late, forever, in the one field a wrong value
//      is unrecoverable in.
//   4. NO INTEL → no draft, and this is not fussiness: `scripts/publish-meeting-activity.mjs`
//      REFUSES a row whose `sourceContext.intel` is empty ("writing this row would add a meeting
//      with nothing to render"). A draft that the only writer in the repo would reject is not a
//      draft, it is a fiction. Extracting intel from these three bodies is the next increment, and
//      naming it here is how it stops being invisible.
//   5. ALREADY IN THE CRM → no draft, said out loud with the id that holds it.
//
// WHAT IT NEVER DOES: no money, quoted, signed or paid field appears in the payload at all — an
// activity is a record that a conversation happened, and inc.41 read a $7,000 quote out of one of
// these calls without writing it anywhere on purpose.

import type { TranscriptRecordLink } from "./transcriptRecordLink";
import { transcriptStem } from "./transcriptRecordLink";

/** An `activities` row already in the CRM, in the only two fields identity is judged on. */
export type ExistingActivity = {
  id: string;
  /** The transcript this row already accounts for, when it carries one. */
  transcriptRef?: string | null;
};

/** Intel the caller extracted from the body. Never invented here — see refusal 4. */
export type TranscriptIntel = {
  kind: string;
  text: string;
  /** Where in the transcript this came from. "somewhere in the call" is not traceability. */
  sourceRef: string;
};

export type TranscriptActivityDraft = {
  id: string;
  orgId: string;
  personId?: string;
  type: "meeting";
  source: "local-transcript";
  createdBy: string;
  occurredAt: string;
  bookProtected: false;
  sourceContext: {
    system: "local-transcript";
    /** The filename under the transcripts directory — how a human opens the evidence. */
    transcriptRef: string;
    /** The title as the transcriber wrote it, carried VERBATIM even when it is wrong. */
    transcriptTitle: string;
    /**
     * Q86 inc.41's finding, preserved on the row rather than corrected into it: the only "On Time"
     * recording we hold is titled ROOFING and the record is a moving company. Present whenever the
     * link carried unexplained title words, so a reader of the CRM sees the discrepancy that a
     * renamed file would have destroyed.
     */
    titleWordsRecordCannotAccountFor?: string[];
    /** Which signals agreed, so a reader can weigh the pair without re-running the linker. */
    linkedBy: { nameMatched: string | null; slugMatched: boolean };
    intel: TranscriptIntel[];
  };
};

export type TranscriptDraftRefusal =
  | { kind: "not-linked"; status: TranscriptRecordLink["status"]; why: string }
  | { kind: "no-org"; why: string }
  | { kind: "no-day"; why: string }
  | { kind: "no-intel"; why: string }
  | { kind: "already-present"; existingId: string; why: string };

export type TranscriptDraftResult =
  | { drafted: true; draft: TranscriptActivityDraft }
  | { drafted: false; refusal: TranscriptDraftRefusal };

export type TranscriptDraftInput = {
  link: TranscriptRecordLink;
  /** The org the meeting lands on. Required — see refusal 2. */
  orgId?: string | null;
  /** The person on the record, when the link resolved one and the caller wants it carried. */
  personId?: string | null;
  /** The day the CALL happened, `YYYY-MM-DD`. Never the transcription date — see refusal 3. */
  occurredOn?: string | null;
  intel?: TranscriptIntel[];
  existing?: readonly ExistingActivity[];
  createdBy?: string;
};

/**
 * `A-TR-<day>-<stem>` — deterministic from the transcript ref, which is what identity is.
 *
 * The day rides along so a human scanning `activities` can read it; it is never what
 * disambiguates. Exported because the writer must ask "is this already in the CRM?" using the same
 * string this module would produce, not a second recipe for one.
 */
export function transcriptActivityId(ref: string, day: string): string {
  const stem = transcriptStem(ref)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `A-TR-${day}-${stem}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Plan the activity for one linked transcript. Returns a draft or a stated refusal — never a
 * partial row, and never a write.
 */
export function planTranscriptActivity(input: TranscriptDraftInput): TranscriptDraftResult {
  const { link } = input;

  if (link.status !== "linked" || !link.record) {
    return {
      drafted: false,
      refusal: {
        kind: "not-linked",
        status: link.status,
        why:
          link.status === "uncertain"
            ? `${link.transcript.ref}: one signal, not two — a human reads this pair before it becomes a row on a company record`
            : `${link.transcript.ref}: no registry record answers to this transcript`,
      },
    };
  }

  const orgId = (input.orgId ?? "").trim();
  if (!orgId) {
    return {
      drafted: false,
      refusal: {
        kind: "no-org",
        why: `${link.transcript.ref}: linked to ${link.record.id} (${link.record.entityKind}) but no org was supplied — activities land on a company, and this module will not infer which one`,
      },
    };
  }

  const day = (input.occurredOn ?? "").trim();
  if (!DAY.test(day)) {
    return {
      drafted: false,
      refusal: {
        kind: "no-day",
        why: `${link.transcript.ref}: no call date. The transcript header carries the day it was TRANSCRIBED, which is not the day the call happened`,
      },
    };
  }

  const intel = (input.intel ?? []).filter((i) => i && i.text?.trim() && i.sourceRef?.trim());
  if (intel.length === 0) {
    return {
      drafted: false,
      refusal: {
        kind: "no-intel",
        why: `${link.transcript.ref}: nothing extracted from the body. publish-meeting-activity.mjs refuses a row with empty sourceContext.intel, so a draft without it would be rejected at the write boundary`,
      },
    };
  }

  const id = transcriptActivityId(link.transcript.ref, day);
  const clash = (input.existing ?? []).find(
    (a) => a.id === id || (a.transcriptRef && a.transcriptRef === link.transcript.ref),
  );
  if (clash) {
    return {
      drafted: false,
      refusal: {
        kind: "already-present",
        existingId: clash.id,
        why: `${link.transcript.ref} is already accounted for by ${clash.id} — writing again would stack a second copy of one meeting`,
      },
    };
  }

  const draft: TranscriptActivityDraft = {
    id,
    orgId,
    type: "meeting",
    source: "local-transcript",
    createdBy: input.createdBy?.trim() || "max",
    occurredAt: day,
    bookProtected: false,
    sourceContext: {
      system: "local-transcript",
      transcriptRef: link.transcript.ref,
      transcriptTitle: link.transcript.title,
      linkedBy: { nameMatched: link.signals.nameMatched, slugMatched: link.signals.slugMatched },
      intel,
    },
  };
  const personId = (input.personId ?? "").trim();
  if (personId) draft.personId = personId;
  if (link.unexplainedTitleWords.length > 0) {
    draft.sourceContext.titleWordsRecordCannotAccountFor = [...link.unexplainedTitleWords];
  }
  return { drafted: true, draft };
}

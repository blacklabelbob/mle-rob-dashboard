/**
 * Q85 inc.25 — WHOSE GAP IS IT: the archive's, or ours?
 *
 * inc.24 measured the person half of Q85's DoD at **0 of 4** and named the fix at source as
 * "the counterparty's full name in the Notion archive's `Non MLE Attendees` column" — i.e. it
 * put the whole gap on a human filling a Notion cell, and made inc.25 wait on Rob or a scribe.
 *
 * That claim was never checked against the archive. It could not have been: the four stored
 * rows came from Q89 inc.6's HAND-AUTHORED `data/meetings/*.activity.json` payloads, whose
 * `attendeesOther` is whatever the author typed that day — not a read of the Notion columns.
 * So there are two very different worlds behind the same null `person_id`:
 *
 *   1. the Notion cell is genuinely empty  → only a human who was there can close it (Rob's);
 *   2. the Notion cell HAS the name and our payload never carried it → the fix is a re-publish
 *      and needs nobody. Waiting on Rob for that one is inc.20's defect wearing a new hat.
 *
 * This module tells those two apart, and it can do it exactly because every stored row carries
 * `sourceContext.pageId` — the Notion page it was authored from. The join is an id, not a name
 * or a date; there is no fuzzy matching here and there must never be.
 *
 * WHAT IT DOES NOT DO. It never proposes a person, never picks between two names, never writes.
 * It answers one question per row — *who has to act* — and the answer for a row where the
 * archive turns out to be richer than our payload is "nobody, re-publish it".
 *
 * IDENTIFYING IS `archiveAttendees`'s RULE, IMPORTED, NOT RE-DECIDED. A single-token name
 * ("Dani") identifies nobody, and a second ladder saying otherwise is how two answers drift —
 * the same reason inc.24 refused to re-read Notion for the audit's own ladder.
 *
 * PURE (CR-3): no clock, no network, no Notion, no Supabase.
 */

import {
  readArchiveAttendees,
  resolvableCounterparties,
  type ArchiveAttendeeFields,
} from "@/lib/meetings/archiveAttendees";
import { normalizeName } from "@/lib/dedup/match";

/** The slice of a stored activity's `source_context` this comparison needs. Everything optional
 *  because a hand-authored payload is free to omit any of it — and the omission is the finding. */
export type StoredAttendeeContext = {
  /** The Notion page the payload was authored from. Absent → nothing to compare against. */
  pageId?: string;
  /** Counterparty names the payload carried. Absent or `[]` both mean "our row names nobody". */
  attendeesOther?: string[];
};

export type ProvenanceVerdict =
  /** No `pageId` on the stored row — we cannot say whose gap it is without inventing a join. */
  | "no-archive-link"
  /** `pageId` present but that page was not in the archive read handed to us. */
  | "archive-row-missing"
  /** Archive names an identifying counterparty our payload does not carry. OUR fix: re-publish. */
  | "payload-dropped"
  /** Neither side names an identifying counterparty. inc.24's claim holds — a human must type it. */
  | "archive-thin"
  /** Both sides name the same identifying counterparties. Nothing to recover here. */
  | "agrees";

export type ProvenanceDecision = {
  activityId: string;
  pageId: string | null;
  verdict: ProvenanceVerdict;
  /** Identifying counterparty names the ARCHIVE holds, as the archive spells them. */
  archiveNames: string[];
  /** Counterparty names the STORED payload holds, as stored. Includes non-identifying ones. */
  storedNames: string[];
  /** Archive-only identifying names — the recoverable part, and empty unless `payload-dropped`. */
  missingFromStored: string[];
  /** Who has to act, in one line. */
  detail: string;
};

const clean = (names: string[] | undefined): string[] =>
  (names ?? []).map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);

/**
 * One row's verdict. `archiveRow` is the archive's four attendee columns for the SAME page id,
 * or `null` when the caller's archive read did not contain that page.
 */
export function decideAttendeeProvenance(
  stored: { activityId: string; context: StoredAttendeeContext | null },
  archiveRow: ArchiveAttendeeFields | null
): ProvenanceDecision {
  const ctx = stored.context ?? {};
  const pageId = (ctx.pageId ?? "").trim() || null;
  const storedNames = clean(ctx.attendeesOther);

  const base = { activityId: stored.activityId, pageId, storedNames, missingFromStored: [] as string[] };

  if (!pageId) {
    return {
      ...base,
      verdict: "no-archive-link",
      archiveNames: [],
      detail:
        "stored row carries no `pageId`, so there is no archive row to compare against — " +
        "the payload would have to be re-authored before anything can be recovered.",
    };
  }
  if (!archiveRow) {
    return {
      ...base,
      verdict: "archive-row-missing",
      archiveNames: [],
      detail: `page ${pageId} was not in the archive read — cannot say whose gap this is.`,
    };
  }

  // The archive's own rule for who may be resolved: counterparty side, two-token floor.
  const archiveNames = resolvableCounterparties(readArchiveAttendees(archiveRow)).map((a) => a.name);
  const storedKeys = new Set(storedNames.map(normalizeName));
  const missingFromStored = archiveNames.filter((n) => !storedKeys.has(normalizeName(n)));

  if (missingFromStored.length > 0) {
    return {
      ...base,
      verdict: "payload-dropped",
      archiveNames,
      missingFromStored,
      detail:
        `the archive already names ${missingFromStored.join(", ")} and the stored payload does not — ` +
        "this is OURS to fix by re-publishing the row from the archive, and needs nobody.",
    };
  }
  if (archiveNames.length === 0) {
    return {
      ...base,
      verdict: "archive-thin",
      archiveNames,
      detail:
        "the archive names no identifying counterparty either — only a human who was in the room " +
        "can close this, by filling `Non MLE Attendees` on the Notion row.",
    };
  }
  return {
    ...base,
    verdict: "agrees",
    archiveNames,
    detail: `stored row already carries every identifying counterparty the archive holds (${archiveNames.join(", ")}).`,
  };
}

export type ProvenanceSummary = {
  rows: number;
  /** Rows we can fix ourselves. If this is non-zero, inc.24's "blocked on Rob" was too broad. */
  recoverable: number;
  /** Rows that genuinely need a human who was there. */
  needsHuman: number;
  /** Rows we cannot even ask the question of. */
  unjoinable: number;
};

export function summarizeProvenance(decisions: ProvenanceDecision[]): ProvenanceSummary {
  return {
    rows: decisions.length,
    recoverable: decisions.filter((d) => d.verdict === "payload-dropped").length,
    needsHuman: decisions.filter((d) => d.verdict === "archive-thin").length,
    unjoinable: decisions.filter((d) => d.verdict === "no-archive-link" || d.verdict === "archive-row-missing")
      .length,
  };
}

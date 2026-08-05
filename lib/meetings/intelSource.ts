/**
 * Q89 inc.3 — the seam between a stored meeting and the gate.
 *
 * `meetingIntel.ts` decides what may be CLAIMED; `MeetingIntelSection` decides how it
 * READS. Neither knows where a meeting lives. This module is the only thing that does,
 * and it does exactly one job: turn activity rows into `IntelCandidate[]`. It extracts
 * nothing from prose, infers nothing from a summary, and never reads a transcript —
 * an extractor that guesses is precisely the door the gate exists to close.
 *
 * The storage contract (deliberately an existing column, not a new table):
 *   activity.type === "meeting"
 *   activity.sourceContext.intel = [{ kind, text, sourceRef, excerpt?, url?, owner?,
 *                                     status?, rank? }, ...]
 *
 * Two rules here that look like strictness and are actually anti-silence:
 *
 * 1. A MALFORMED ENTRY IS NEVER DROPPED — it is passed through with whatever
 *    provenance it has, so the gate rejects it *visibly* with a named reason. Filtering
 *    it out here would make a badly-written entry indistinguishable from a meeting
 *    where nothing was said, which is the one confusion this whole surface exists to end.
 *    The only entries that cannot be passed through are ones with no usable `kind`,
 *    because a candidate with no block has nowhere to be rejected; those are counted
 *    and reported separately rather than vanishing.
 *
 * 2. NO LINK IS EVER FABRICATED. An item's `url` comes from the entry alone. It is
 *    tempting to fall back to the meeting's `recordingUrl`, and that would be a lie of
 *    exactly the shape Q84 is about: a link that opens the meeting is not a link that
 *    opens the LINE, and a reader who clicks expecting the sentence and gets a 90-minute
 *    recording has been told the claim is checkable when it is not.
 *
 * Pure per CR-3: no clock, no network, no Supabase, no filesystem.
 */

import type { Activity } from "@/lib/types";
import { INTEL_BLOCK_KINDS, type IntelBlockKind, type IntelCandidate } from "./meetingIntel";

/** What a meeting row yielded. `unusable` is stated, never swallowed. */
export type IntelSource = {
  candidates: IntelCandidate[];
  /** Meeting activities seen — the denominator the surface prints. */
  meetingCount: number;
  /** Entries whose `kind` names no block, so they could not even be rejected by name. */
  unusable: { activityId: string; reason: string }[];
};

function isMeeting(a: Activity): boolean {
  return a.type === "meeting";
}

function asKind(v: unknown): IntelBlockKind | null {
  return typeof v === "string" && (INTEL_BLOCK_KINDS as readonly string[]).includes(v)
    ? (v as IntelBlockKind)
    : null;
}

/** Present-and-non-empty strings only. `""` is absence wearing a costume. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function status(v: unknown): "open" | "done" | undefined {
  return v === "open" || v === "done" ? v : undefined;
}

/**
 * One meeting row → its candidates. The activity id IS the meeting id, so every rendered
 * item addresses a row that exists in this CRM rather than an id from some other system.
 */
export function candidatesFromActivity(a: Activity): {
  candidates: IntelCandidate[];
  unusable: { activityId: string; reason: string }[];
} {
  const raw = (a.sourceContext as Record<string, unknown> | undefined)?.intel;
  if (!Array.isArray(raw)) return { candidates: [], unusable: [] };

  const candidates: IntelCandidate[] = [];
  const unusable: { activityId: string; reason: string }[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      unusable.push({ activityId: a.id, reason: "intel entry is not an object" });
      continue;
    }
    const e = entry as Record<string, unknown>;
    const kind = asKind(e.kind);
    if (!kind) {
      // No block to belong to means no block to be rejected in. Counted, not hidden.
      unusable.push({
        activityId: a.id,
        reason: `intel entry has no recognised kind (got ${JSON.stringify(e.kind)})`,
      });
      continue;
    }

    // `text` may be missing — the gate rejects that as `empty-text` where Rob can see it.
    candidates.push({
      kind,
      text: str(e.text) ?? "",
      provenance: {
        meetingId: a.id,
        sourceRef: str(e.sourceRef),
        excerpt: str(e.excerpt),
        url: str(e.url), // entry only — never a.recordingUrl. See the header.
      },
      owner: str(e.owner),
      status: status(e.status),
      rank: num(e.rank),
    });
  }

  return { candidates, unusable };
}

/**
 * Every meeting on a record → one candidate list, in occurrence order (oldest first) so
 * "source order" on an unranked block means something stable a reader can follow. Rows
 * with no `occurredAt` sort last rather than being dropped.
 */
export function intelSourceFromActivities(activities: Activity[]): IntelSource {
  const meetings = activities.filter(isMeeting).slice().sort((x, y) => {
    const a = x.occurredAt || "";
    const b = y.occurredAt || "";
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a < b ? -1 : 1;
  });

  const candidates: IntelCandidate[] = [];
  const unusable: { activityId: string; reason: string }[] = [];
  for (const m of meetings) {
    const got = candidatesFromActivity(m);
    candidates.push(...got.candidates);
    unusable.push(...got.unusable);
  }

  return { candidates, meetingCount: meetings.length, unusable };
}

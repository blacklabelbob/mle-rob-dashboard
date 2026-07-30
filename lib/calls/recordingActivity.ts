import type { CallActivityPayload } from "@/lib/twilio";
import type { Activity, Person } from "@/lib/types";
import { normalizePhone } from "@/lib/vapi";

// BUILD-QUEUE Q68 (a): the decision layer between a Twilio recording webhook
// and the activities table. Pure per CR-3 — no network, no clock (`nowISO` is
// injected) — because every judgement here is about WHOSE timeline a recorded
// call lands on, and filing a call on the wrong contact is worse than not
// filing it at all.

export type CallResolution =
  | {
      kind: "resolved";
      personId: string;
      matchedOn: "from" | "to";
      direction: "inbound" | "outbound";
    }
  | {
      kind: "unmatched";
      reason: "no-numbers" | "only-our-lines" | "no-crm-party" | "our-lines-unknown";
    }
  | { kind: "ambiguous"; personIds: string[] };

/**
 * Which CRM contact was on this call.
 *
 * Our own lines are subtracted first (`ourNumbers` = TWILIO_CALLER_ID and any
 * other number we dial from): on an outbound call our number is `From`, on an
 * inbound one it is `To`, so the remaining side IS the contact. Without that
 * subtraction a rep whose own mobile is also a person row makes every call
 * they place look like a call *about them*.
 *
 * Ambiguity is never resolved by picking the first hit — two different people
 * matching is either a real two-contact call or duplicate rows in the CRM, and
 * both cases need a human, not a guess on someone's timeline.
 *
 * And when `ourNumbers` is empty we do not know which side is ours, so a single
 * match cannot be told apart from our own line matching a person row — the exact
 * wrong-contact filing the subtraction exists to prevent. That case files
 * nothing (`our-lines-unknown`): an unfiled call is a visible absence, a call on
 * the wrong contact is a lie a rep cannot see. This is why the arming chain
 * lists `TWILIO_CALLER_ID` under `filing` — with it unset, nothing files.
 */
export function resolveCallParty(
  people: readonly Person[],
  payload: Pick<CallActivityPayload, "from" | "to">,
  ourNumbers: readonly (string | undefined)[] = []
): CallResolution {
  const ours = new Set(
    ourNumbers
      .map((n) => (n ? normalizePhone(n) : ""))
      .filter((n): n is string => n.length > 0)
  );

  const sides = (["from", "to"] as const)
    .map((side) => ({ side, digits: normalizePhone(payload[side] ?? "") }))
    .filter((s) => s.digits.length > 0);
  if (sides.length === 0) return { kind: "unmatched", reason: "no-numbers" };

  const candidates = sides.filter((s) => !ours.has(s.digits));
  if (candidates.length === 0) return { kind: "unmatched", reason: "only-our-lines" };

  const hits: { side: "from" | "to"; personIds: string[] }[] = candidates.map((c) => ({
    side: c.side,
    personIds: [
      ...new Set(
        people
          .filter((p) => p.phone && normalizePhone(p.phone) === c.digits)
          .map((p) => p.id)
      ),
    ],
  }));

  const matched = hits.filter((h) => h.personIds.length > 0);
  if (matched.length === 0) return { kind: "unmatched", reason: "no-crm-party" };

  const distinct = [...new Set(matched.flatMap((h) => h.personIds))];
  if (distinct.length > 1) return { kind: "ambiguous", personIds: distinct };

  // One match, and no idea whether it is the contact or us. Checked AFTER
  // ambiguity so the more specific answer still wins, and after `no-crm-party`
  // so a call involving nobody in the CRM is still reported as such.
  if (ours.size === 0) return { kind: "unmatched", reason: "our-lines-unknown" };

  const hit = matched[0];
  return {
    kind: "resolved",
    personId: hit.personIds[0],
    matchedOn: hit.side,
    // They dialled us (contact on `From`) = inbound; we dialled them = outbound.
    direction: hit.side === "from" ? "inbound" : "outbound",
  };
}

/** Twilio timestamps are RFC-2822 (`Fri, 13 Sep 2024 12:00:00 +0000`), not ISO. */
export function callOccurredAt(raw: string | null, nowISO: string): string {
  if (!raw) return nowISO;
  const ms = Date.parse(raw);
  // Unparseable would throw at insert → a non-2xx → Twilio retries a payload
  // that can never succeed. Receipt time is wrong by seconds, not by a call.
  return Number.isNaN(ms) ? nowISO : new Date(ms).toISOString();
}

/**
 * The activity row for a resolved call.
 *
 * The id is derived from `recordingSid`, never random: Twilio re-POSTs this
 * webhook on any non-2xx, and a random id would stack duplicate calls on the
 * timeline instead of upserting the same one. A payload with no `recordingSid`
 * therefore has no stable identity and must not be persisted (see
 * `callActivityId`).
 */
export function callActivityId(payload: Pick<CallActivityPayload, "recordingSid">): string | null {
  const sid = (payload.recordingSid ?? "").trim();
  return sid ? `dialer-${sid}` : null;
}

export function buildCallActivity(
  payload: CallActivityPayload,
  resolution: Extract<CallResolution, { kind: "resolved" }>,
  nowISO: string
): Activity | null {
  const id = callActivityId(payload);
  if (!id) return null;
  return {
    id,
    personId: resolution.personId,
    type: "call",
    source: "dialer",
    sourceContext: {
      callSid: payload.callSid || undefined,
      recordingSid: payload.recordingSid,
      direction: resolution.direction,
      matchedOn: resolution.matchedOn,
      from: payload.from ?? undefined,
      to: payload.to ?? undefined,
      // null, never 0 — a zero-second call reads as "never connected".
      durationSec: payload.durationSec,
    },
    // `summary` stays empty until Q68 (c) puts a real one there; a placeholder
    // string would make an un-summarised call look like a summarised one.
    recordingUrl: payload.recordingUrl || undefined,
    bookProtected: false,
    occurredAt: callOccurredAt(payload.occurredAt, nowISO),
    createdAt: nowISO,
  };
}

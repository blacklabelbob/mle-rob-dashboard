// Q47 e-sign audit events: builders for 0008 signature_events rows (append-only
// in the DB — trigger-enforced) and the certificate-page chain formatter.
// Pure: `at` is always passed in; no clock reads (CR-3).

export const EVENT_TYPES = [
  "created",
  "sent",
  "resent",
  "viewed",
  "consent",
  "signed",
  "voided",
  "nudge",
  "copy_delivered",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface SignatureEventRow {
  request_id: string;
  type: EventType;
  at: string; // ISO timestamp
  ip: string | null;
  meta: Record<string, unknown>;
}

export function buildEvent(
  requestId: string,
  type: EventType,
  at: string,
  opts: { ip?: string | null; meta?: Record<string, unknown> } = {}
): SignatureEventRow {
  if (!EVENT_TYPES.includes(type)) throw new Error(`esign event: unknown type ${type}`);
  if (!requestId) throw new Error("esign event: request_id required");
  if (Number.isNaN(Date.parse(at))) throw new Error(`esign event: bad timestamp ${at}`);
  return { request_id: requestId, type, at, ip: opts.ip ?? null, meta: opts.meta ?? {} };
}

// Audit-certificate chain lines (walkthrough step 6: "the page that wins the
// court fight"). Deterministic order by time then type for identical input.
export function formatEventChain(
  events: { type: string; at: string; ip: string | null }[]
): string[] {
  return [...events]
    .sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type))
    .map((e) => `${e.at}  ${e.type.toUpperCase().padEnd(14)}${e.ip ? `  ip ${e.ip}` : ""}`);
}

// Q84 inc.71 — the codec for the one structured action a finding carries today: "this host
// is proposed for this org's second slot, and a click may write it".
//
// WHY A CODEC AND NOT A PARSER OF ROB'S PROSE. inc.70 left the button as the only thing
// missing, and building it exposed that nothing can carry the host to the page. The proposal
// is computed by `npm run check:archive` off transcripts on disk; prod has none, so the org
// page cannot recompute it. The only channel from the check to the page is a `flags` row, and
// every column on it is either prose a human reads or an address. Reading the host back out
// of `detail` would make a reworded sentence a silent breakage; writing a token INTO that
// sentence would put machine text on the page Rob reads (the MS-DOS failure of inc.13). So
// the host rides in `flags.payload` (0035, PENDING) and the prose stays prose.
//
// STRICT ON PURPOSE, IN BOTH DIRECTIONS. This is the boundary between a script's output and a
// button that WRITES to a CRM record, so it refuses rather than coerces: an unknown `kind`, a
// missing field, a non-string, a host that names no host, an id that is not a minted org id —
// all read as "no action", which renders as no button. A malformed payload must never become
// a half-filled confirm; the failure direction is always "Rob sees the finding without the
// shortcut", never "Rob sees a button pointing somewhere unverified".
//
// IT DOES NOT DECIDE WHETHER THE WRITE IS SAFE. That is `hostClaimConflict` + `hostWriteSlot`
// (inc.68/69), which the PATCH route enforces server-side as a 409. This module only carries
// the proposal across the wire — the guard is re-run at the moment of the click, on the table
// as it is THEN, not as it was when the check ran. A payload is a suggestion with a timestamp
// on it; the server is the authority.
//
// Pure per CR-3: no clock, no network, no Supabase.

import { extractHost } from "@/lib/meetings/activityPlan";

/** The only `kind` this repo currently mints. New actions add a member, never a free string. */
export const HOST_CONFIRM_KIND = "host-confirm" as const;

/**
 * A confirmable second-host write.
 *
 * @property host  the host to store, already reduced by the SAME `extractHost` every other
 *   host comparison in this tree uses — a fifth parser is how two ladders drift apart.
 * @property orgId the org whose `domain` slot the click would fill.
 */
export type HostConfirm = { kind: typeof HOST_CONFIRM_KIND; host: string; orgId: string };

/** Minted org ids are `C-` + digits (0031, stable record ids). Anything else is not an org. */
const ORG_ID = /^C-\d+$/;

/**
 * Build the payload a finding carries. Returns `null` — meaning "write no payload" — when
 * either half is unusable, so a caller cannot persist an action it could not honour.
 */
export function hostConfirmPayload(host: string, orgId: string): HostConfirm | null {
  const clean = extractHost(host || "");
  if (!clean) return null;
  if (!ORG_ID.test((orgId || "").trim())) return null;
  return { kind: HOST_CONFIRM_KIND, host: clean, orgId: orgId.trim() };
}

/**
 * Read a payload off a stored row. `unknown` in, because this comes from jsonb and every
 * assumption about its shape has to be earned here rather than at the call site.
 */
export function readHostConfirm(payload: unknown): HostConfirm | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  if (row.kind !== HOST_CONFIRM_KIND) return null;
  if (typeof row.host !== "string" || typeof row.orgId !== "string") return null;
  // Re-graded on the way OUT as strictly as on the way in: a row written before a rule
  // tightened, or by hand, is not trusted just because it parsed.
  return hostConfirmPayload(row.host, row.orgId);
}

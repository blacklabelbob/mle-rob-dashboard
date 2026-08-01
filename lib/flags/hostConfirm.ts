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
 * Q84 inc.72 — WHAT THE FIRST WRITER PROVED: ONE FINDING CARRIES MORE THAN ONE ACTION.
 *
 * inc.71 built the codec for "this host, for this org" as if a payload were a single action,
 * because at that point nothing had ever written one. Building the writer showed the shape was
 * wrong the moment it met the row it exists for: the CRM-gap finding is **one** `flags` row
 * (`dedupe_key: meeting-archive/crm-gap`, prod #133) and it lists **two** confirmable hosts
 * today — `cgroofing.net → C-2017` and `gulfregroup.com → C-2018`. A one-action payload could
 * only ever offer Rob the first of them.
 *
 * Changing it costs nothing and is stated rather than glossed: **no payload has ever been
 * written** — 0035 is still pending, the route does not persist the column, all 133 prod rows
 * read NULL. This is finishing a design at the first moment evidence contradicted it, not a
 * migration of stored data.
 *
 * The kind stays `host-confirm`: it is still one kind of action, carried in the plural.
 */
export type HostConfirmPayload = { kind: typeof HOST_CONFIRM_KIND; actions: HostConfirm[] };

/**
 * Grade a whole finding's worth of proposals into the payload it carries, or `null` for
 * "write no payload at all".
 *
 * PER-ACTION, NOT ALL-OR-NOTHING: one unusable pair drops itself and the others survive,
 * because each action is a separate button under a separate host line — and inc.71's pinned
 * failure direction is "Rob sees the finding without the shortcut", which is exactly what a
 * dropped action renders as.
 *
 * TWO ACTIONS POINTING AT ONE ORG ARE BOTH DROPPED. An org has exactly ONE free `domain` slot
 * (inc.68), so two hosts proposed for the same org is two buttons where at most one can
 * succeed — the second click would hit the server's `occupied` refusal. That is a tie, and
 * this tree does not break ties: `ambiguous-orgs`, `ambiguous-company` and `proposalText`'s
 * two-candidate case all report and pick neither. A human says which host that org gets.
 *
 * A REPEATED HOST IS COLLAPSED, NOT DROPPED — the same host proposed for the same org twice
 * is one action stated twice (a host can be heard on several meetings), so de-duping it loses
 * nothing. The same host proposed for two DIFFERENT orgs is a genuine disagreement and both go.
 */
export function buildHostConfirmPayload(
  pairs: Array<{ host: string; orgId: string }>,
): HostConfirmPayload | null {
  const graded = pairs.map((p) => hostConfirmPayload(p.host, p.orgId)).filter((a): a is HostConfirm => !!a);

  const byHost = new Map<string, HostConfirm[]>();
  for (const action of graded) {
    const at = byHost.get(action.host) ?? [];
    if (!at.some((a) => a.orgId === action.orgId)) at.push(action);
    byHost.set(action.host, at);
  }

  const orgCount = new Map<string, number>();
  const oneOrgEach: HostConfirm[] = [];
  for (const [, list] of byHost) {
    if (list.length !== 1) continue; // one host, two orgs — a tie, never broken
    oneOrgEach.push(list[0]);
    orgCount.set(list[0].orgId, (orgCount.get(list[0].orgId) ?? 0) + 1);
  }

  const actions = oneOrgEach
    .filter((a) => orgCount.get(a.orgId) === 1) // two hosts, one org — one free slot, so neither
    .sort((a, b) => a.host.localeCompare(b.host));

  return actions.length ? { kind: HOST_CONFIRM_KIND, actions } : null;
}

/**
 * Read the payload off a stored row. `unknown` in, because this comes from jsonb and every
 * assumption about its shape has to be earned here rather than at the call site. Re-graded on
 * the way OUT through the same builder, so a hand-written row — or one written before a rule
 * tightened — is not trusted for having parsed.
 */
export function readHostConfirmPayload(payload: unknown): HostConfirmPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  if (row.kind !== HOST_CONFIRM_KIND) return null;
  if (!Array.isArray(row.actions)) return null;
  const pairs: Array<{ host: string; orgId: string }> = [];
  for (const raw of row.actions) {
    const one = readHostConfirm(raw);
    if (!one) return null; // a malformed member means the row is not trustworthy, not that it is shorter
    pairs.push({ host: one.host, orgId: one.orgId });
  }
  return buildHostConfirmPayload(pairs);
}

/**
 * Read ONE action. `unknown` in, because this comes from jsonb and every assumption about its
 * shape has to be earned here rather than at the call site.
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

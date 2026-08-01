// Q84 inc.64 — the plan's biggest bucket is `no-company` (34 of 41), and for a third of it
// the answer is already on disk.
//
// `activityPlan` reports every one of those rows as *"the archive row never says who this was
// with — only someone who was there can"*. That is TRUE for the in-person rows and FALSE for the
// recorded ones: 13 of the 41 have a Fireflies body on disk, and the manifest carries each one's
// `organizerDomain` + `participantDomains`. A meeting whose attendee list contains
// `proplogix.com` names its company as plainly as the Notion field would have.
//
// WHAT THIS PASS IS ALLOWED TO READ, and it is a short list on purpose: attendee EMAIL DOMAINS,
// matched exactly against hosts the CRM already stores on an org. Nothing is read out of the
// transcript prose. A company name spoken in a call is not evidence — "we should call Gulf Coast"
// names a company nobody in the room worked for, and welding that meeting onto Gulf Coast's record
// is the unrecoverable write this whole module tree exists to refuse. A domain is different: it is
// the counterparty's own registered address, and the CRM's own Domain field is the other half of
// the comparison.
//
// THE RULES ARE THE TIMID ONES ALREADY IN USE HERE:
//   - Exact host match only. `cgroofing.net` is never equated with `cgroofinggroup.com`
//     (inc.17 established that those are genuinely different hosts on this data).
//   - Two external hosts landing on ONE org resolve — that is one company using two domains.
//   - Two DISTINCT orgs in the room is `ambiguous-orgs` and is never picked. A meeting with two
//     companies in it is a real thing, and choosing the first would be a coin flip on a record.
//   - Nothing is written. This returns what a row WOULD attach to, exactly like `activityPlan`.
//
// NO SECOND COPY OF ANY RULE. The free-mail/consumer list is `genericDomainSet()` from the comms
// ladder, the host parser is `extractHost` from `activityPlan`, and the org→host index is that
// module's own `indexOrgsByHost` — this repo has twice paid to delete a duplicated predicate
// (inc.4/inc.5), and a second host ladder that could drift is the same defect.

import { genericDomainSet } from "@/lib/comms/genericDomains";
import { extractHost, indexOrgsByHost, type CrmOrg } from "./activityPlan";
import { recordingKey } from "./archiveCheck";

/**
 * Rob's own hosts — the ones that appear on BOTH sides of every meeting and therefore identify
 * no counterparty. `fireflies.ai` is here because the notetaker bot is an attendee.
 *
 * Provenance, not invention: this is the identity map in `~/.claude/rules/email-identity.md`
 * (aivoicetech.io = AI VoiceTech, boostuppayments.com = BoostUp — two identities that are never
 * to be linked), and it is the same set `scripts/notion-meetings-sync.mjs` was carrying inline.
 * It lives here now so the sync and this pass cannot drift apart about whose domain is whose.
 */
export const OWN_MEETING_HOSTS: readonly string[] = [
  "aivoicetech.io",
  "boostuppayments.com",
  "fireflies.ai",
];

export function ownMeetingHostSet(extra: Iterable<string> = []): Set<string> {
  const set = new Set(OWN_MEETING_HOSTS);
  for (const host of extra) {
    const clean = extractHost(host);
    if (clean) set.add(clean);
  }
  return set;
}

/**
 * The attendee domains that could name a counterparty: every value parsed to a host, with Rob's
 * own hosts and every generic/consumer/disposable provider removed, deduped, order preserved.
 *
 * Accepts full email addresses OR bare domains, because the two live sources disagree — the
 * Fireflies body carries addresses and the redacted manifest carries domains — and a caller that
 * had to know which one it held would eventually hold the other.
 *
 * A real counterparty mailing from gmail.com (a one-man roofer, routinely) is dropped here and
 * that is correct rather than a loss: `gmail.com` identifies no company, so it cannot answer the
 * question this pass asks. Those rows stay in the human pile, where they already were.
 */
export function externalGuestHosts(
  values: Iterable<string | null | undefined>,
  opts: { ownHosts?: Iterable<string>; extraGeneric?: Iterable<string> } = {}
): string[] {
  const own = ownMeetingHostSet(opts.ownHosts ?? []);
  const generic = genericDomainSet(opts.extraGeneric ?? []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const host = extractHost(value);
    if (!host || own.has(host) || generic.has(host)) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

/**
 * What the attendee list can honestly say about which company a meeting belongs to.
 *
 *   - `resolved`      — every external host in the room belongs to ONE CRM org. A pipeline could
 *                       attach this meeting unattended.
 *   - `ambiguous-orgs`— more than one CRM org is in the room (or one host sits on two org rows,
 *                       which is a dedupe finding in its own right). Never picked.
 *   - `unknown-hosts` — external attendees exist and the CRM carries none of their hosts. Cheap
 *                       and permanent to fix: put the host on the right org's Domain field once.
 *   - `no-external`   — everyone in the room was Rob's side or on a free mailbox. The transcript
 *                       genuinely cannot name a company; this row stays a human's.
 */
export type AttendanceResolution =
  | { kind: "resolved"; org: CrmOrg; hosts: string[] }
  | { kind: "ambiguous-orgs"; orgs: CrmOrg[]; hosts: string[] }
  | { kind: "unknown-hosts"; hosts: string[] }
  | { kind: "no-external" };

/**
 * @param values attendee emails or domains — organizer included; it is an attendee like any other.
 * @param orgs every CRM org, so a host can be matched against `domain` and `website` alike.
 */
export function resolveCompanyFromAttendance(
  values: Iterable<string | null | undefined>,
  orgs: CrmOrg[],
  opts: { ownHosts?: Iterable<string>; extraGeneric?: Iterable<string> } = {}
): AttendanceResolution {
  const hosts = externalGuestHosts(values, opts);
  if (!hosts.length) return { kind: "no-external" };

  const hostIndex = indexOrgsByHost(orgs);
  const hit: CrmOrg[] = [];
  const matchedHosts: string[] = [];
  for (const host of hosts) {
    const bucket = hostIndex.get(host);
    if (!bucket?.length) continue;
    matchedHosts.push(host);
    for (const org of bucket) if (!hit.some((o) => o.id === org.id)) hit.push(org);
  }

  if (!hit.length) return { kind: "unknown-hosts", hosts };
  if (hit.length > 1) return { kind: "ambiguous-orgs", orgs: hit, hosts: matchedHosts };
  return { kind: "resolved", org: hit[0], hosts: matchedHosts };
}

/**
 * Q84 inc.65 — the join, so the answer above reaches the report that asks the question.
 *
 * `resolveCompanyFromAttendance` reads an attendee list, and an archive row does not carry one:
 * it carries a Call Recording url. The recordings on disk carry the attendee domains and their
 * own Fireflies id. So the two sides meet on the recording ID — the same key
 * `checkArchiveAgainstCrm` already matches CRM activities on, imported rather than re-derived,
 * because two url parsers that disagree would silently join the wrong meeting to the wrong room.
 *
 * A row with no recording url joins to nothing and gets `null`. That is the honest answer for
 * the 25+ in-person rows: no recorder was there, so no attendee list exists to read.
 */
export type MeetingRecording = {
  /** The Fireflies id, or any url ending in it — `recordingKey` reduces both to the same key. */
  id: string;
  title?: string;
  /** Attendee emails or bare domains; organizer included. Either shape is accepted upstream. */
  attendeeDomains: readonly (string | null | undefined)[];
};

/**
 * Recordings keyed by Fireflies id. FIRST WINS on a duplicate id, and the duplicate is not
 * silently merged: two manifest entries with one id is a manifest defect, and quietly unioning
 * their attendee lists would invent a meeting that had everyone from both in the room.
 */
export function indexRecordingsByKey(recordings: MeetingRecording[]): Map<string, MeetingRecording> {
  const index = new Map<string, MeetingRecording>();
  for (const rec of recordings) {
    const key = recordingKey(rec.id);
    if (!key || index.has(key)) continue;
    index.set(key, rec);
  }
  return index;
}

export type RowAttendance = { recording: MeetingRecording; resolution: AttendanceResolution };

/**
 * What the recording of THIS archive row can say about its company — or `null` when the row
 * has no recording url, or names one no manifest entry carries (a recording the CRM knows
 * about and this machine has never downloaded is not evidence of anything).
 */
export function attendanceForRow(
  row: { recording?: string },
  recordings: Map<string, MeetingRecording>,
  orgs: CrmOrg[],
  opts: { ownHosts?: Iterable<string>; extraGeneric?: Iterable<string> } = {}
): RowAttendance | null {
  const key = recordingKey(row.recording);
  if (!key) return null;
  const recording = recordings.get(key);
  if (!recording) return null;
  return { recording, resolution: resolveCompanyFromAttendance(recording.attendeeDomains, orgs, opts) };
}

/** The sentence a human reads. Names the field to go fix, never a guess about the meeting. */
export function attendanceNextStep(resolution: AttendanceResolution): string {
  switch (resolution.kind) {
    case "resolved":
      return (
        `the attendee domains name ${resolution.org.name} [${resolution.org.id}] ` +
        `(${resolution.hosts.join(", ")}) — read off the recording's own attendee list, not from ` +
        "anything said in the call; nothing is written by this pass"
      );
    case "ambiguous-orgs":
      return (
        `${resolution.orgs.length} CRM orgs were in this meeting ` +
        `(${resolution.orgs.map((o) => `${o.name} [${o.id}]`).join(", ")}) — say which one it was ` +
        "in Notion's “Company Meeting with”; picking one here would be a coin flip on a real record"
      );
    case "unknown-hosts":
      return (
        `the guests mailed from ${resolution.hosts.join(", ")} and no CRM org carries any of those ` +
        "hosts — add the host to the right org's Domain field (a company can use more than one) and " +
        "this row answers itself on the next run"
      );
    case "no-external":
      return (
        "everyone on this call was on our own domains or a free mailbox — the recording cannot name " +
        "a company, so this row still needs someone who was there"
      );
  }
}

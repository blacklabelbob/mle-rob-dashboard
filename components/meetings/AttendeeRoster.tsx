import Link from "next/link";
import type { MeetingRoster, RosterEntry } from "@/lib/meetings/attendeeRoster";

// Q85 inc.27 — the surface. `attendeeRoster.ts` decides who was there and what may be
// linked; this decides only how it reads. It computes nothing: no counting, no inferring a
// side from a name, no filling a thin roster with a plausible attendee.
//
// The unlinked names are shown, not hidden. Twenty-six increments were spent making sure
// the CRM never attaches a call to a person it cannot prove — and the effect of that, until
// now, was that those people appeared nowhere at all. A name we stored and could not resolve
// is exactly what Rob needs to see, because he is the one who can close it in two seconds.

function Name({ entry }: { entry: RosterEntry }) {
  if (entry.personId) {
    return (
      <Link
        href={`/people/${entry.personId}`}
        className="text-slate-200 underline decoration-white/20 hover:text-white"
      >
        {entry.name}
      </Link>
    );
  }
  return (
    <span className="text-slate-300" title={entry.detail}>
      {entry.name}
      {entry.detail && (
        <span className="ml-1.5 text-[11px] text-amber-400/70">— {entry.detail}</span>
      )}
    </span>
  );
}

function Side({ label, entries }: { label: string; entries: RosterEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <ul className="mt-1 space-y-1">
        {entries.map((entry, i) => (
          <li key={`${entry.name}-${i}`} className="text-sm leading-relaxed">
            <Name entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AttendeeRoster({
  rosters,
  // The label under the heading. Supplied by the caller so this component still counts
  // nothing — see `rosterLinkCounts` for where the numbers come from.
  countLabel,
}: {
  rosters: MeetingRoster[];
  countLabel?: string;
}) {
  // Nothing to say is said by saying nothing. A record with no captured meeting already
  // prints `noMeetingNote` above; a second empty box under it would be noise.
  if (rosters.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">Who was in the room</h2>
        {countLabel && (
          <span className="text-[11px] uppercase tracking-wide text-slate-500">{countLabel}</span>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {rosters.map((roster) => (
          <div key={roster.activityId} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              {roster.occurredAt.slice(0, 10)}
              {roster.title && <span className="ml-2 normal-case text-slate-300">{roster.title}</span>}
            </div>
            {roster.gap ? (
              <p className="mt-2 text-[12px] leading-relaxed text-amber-400/80">{roster.gap}</p>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Side label="Them" entries={roster.theirs} />
                <Side label="Us" entries={roster.ours} />
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-600">
        A name without a link is one the CRM could not prove — that is a gap in our records, never a
        judgement about the person.
      </p>
    </section>
  );
}

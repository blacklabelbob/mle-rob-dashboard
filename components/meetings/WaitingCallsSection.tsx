/**
 * Q86 inc.46 — the refusal, on the record, where Rob works.
 *
 * It renders nothing when nothing is waiting. A record with no stuck call gets no panel at all —
 * an empty "no calls waiting" box on 40 records would train the eye to skip the one that matters.
 *
 * Every string here comes off the read. This component computes nothing, claims nothing, and has
 * no action: there is no "file it" button, because filing is a WRITE and the whole point of these
 * three reads is that the write is correctly refused.
 */

import type { WaitingCall } from "@/lib/meetings/transcriptWaiting";

function size(call: WaitingCall): string | null {
  if (call.minutes === null) return null;
  const mins = `${Math.round(call.minutes)}-minute`;
  return call.words === null ? mins : `${mins} · ${call.words.toLocaleString()} words`;
}

export default function WaitingCallsSection({
  calls,
  unavailable = false,
}: {
  calls: WaitingCall[];
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
        <h2 className="font-semibold text-white">Recorded calls waiting to be filed</h2>
        <p className="mt-2 text-sm text-amber-200/80">
          The read archive could not be opened, so this panel does not know whether a call is
          waiting on this record. That is a read failure, not an empty answer.
        </p>
      </section>
    );
  }
  if (calls.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
      <h2 className="font-semibold text-white">
        {calls.length === 1 ? "A recorded call is waiting to be filed" : `${calls.length} recorded calls are waiting to be filed`}
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Read in full and refused — the conversation exists on disk and is not on the timeline
        below. Nothing here has been written to this record.
      </p>

      <ul className="mt-4 space-y-4">
        {calls.map((call) => (
          <li key={call.transcriptRef} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-white">{call.transcriptTitle}</span>
              {size(call) && <span className="text-xs text-slate-400">{size(call)}</span>}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500">
              {call.transcriptRef}
              {call.readAt ? ` · read ${call.readAt}` : ""}
            </div>

            <dl className="mt-3 space-y-2">
              {call.blockers.map((b) => (
                <div key={b.kind} className="text-sm">
                  <dt className="inline rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[11px] text-amber-200">
                    {b.kind}
                  </dt>
                  <dd className="mt-1 text-slate-300">{b.why}</dd>
                </div>
              ))}
            </dl>

            {!call.refusalsAreStated && (
              <p className="mt-3 text-xs text-slate-500">
                This read did not write down its own refusals; the one above is derived from the
                call date alone, so the list may be incomplete.
              </p>
            )}

            {call.unblock && (
              <p className="mt-3 border-t border-white/10 pt-3 text-sm text-slate-300">
                <span className="text-slate-500">What unblocks it: </span>
                {call.unblock}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

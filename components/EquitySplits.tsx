import Link from "next/link";
import EquityCorrect from "@/components/EquityCorrect";
import { EQUITY_STATE_CLASS, EQUITY_STATE_LABEL } from "@/components/equityState";
import {
  equityRegistry,
  phase4Opportunities,
  prosePercentConflict,
  type EquityCandidate,
} from "@/lib/equity";

// Q41 increment 1 — the answer to Rob dev-chat #53, "At the Master Level we need
// to see if we have any equity Split", rendered where he asked for it.
//
// Design rule this panel obeys: agreed-verbally and signed are DIFFERENT FACTS and
// never share a colour. "35/65" alone is not the truth — "35/65, nothing signed" is.
// Anything we could not read as a number is listed under the table rather than
// dropped, because a missing equity row reads as "we have no stake there".

// Q41 inc.5: the wording and colours moved to components/equityState.ts when the
// record page became a second surface — one origin, so the two screens cannot
// describe the same state differently.
const STATE_LABEL = EQUITY_STATE_LABEL;
const STATE_CLASS = EQUITY_STATE_CLASS;

export default function EquitySplits({ candidates }: { candidates: EquityCandidate[] }) {
  const { splits, unreadable } = equityRegistry(candidates);
  // Q41 inc.3: the drift guard needs the RECORD, not the derived split — a
  // conflict is only visible by comparing the field against the prose it was
  // meant to replace. Indexed rather than re-scanned per row.
  const byId = new Map(candidates.map((c) => [c.id, c]));
  // Q41 inc.4: "surface FUTURE Phase-4 opportunities out of notes/meetings/emails".
  // Deliberately a separate list under the registry, never extra rows in it — a
  // conversation about a stake must not borrow the credibility of a held one.
  const leads = phase4Opportunities(candidates);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-white">Equity splits</h2>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">owners only</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Every ownership stake we hold, and whether it is actually signed.
      </p>

      {splits.length === 0 && unreadable.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">
          No equity records yet — this is genuinely empty, not still loading.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5">
          {splits.map((s) => (
            <li key={s.entityId} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={s.href ?? `/people/${s.entityId}`}
                  className="text-sm text-slate-200 hover:text-white hover:underline"
                >
                  {s.entityName}
                </Link>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
                  {s.counterpartyPct === null ? "—" : `${s.counterpartyPct} / ${s.ourPct}`}
                </span>
              </div>
              <div className={`mt-0.5 text-[11px] ${STATE_CLASS[s.state]}`}>
                {STATE_LABEL[s.state]}
              </div>
              {s.provenance === "prose" && (
                // Honest about its own weakness: this number was read out of a
                // sentence, which is exactly how it went wrong last time. It stops
                // saying this the moment the record has a real field.
                <div className="mt-1 text-[11px] text-slate-600">
                  read out of the description — correcting it here makes it a field
                </div>
              )}
              {(() => {
                const record = byId.get(s.entityId);
                const conflict = record ? prosePercentConflict(record) : null;
                return conflict ? (
                  // Two copies of the same number that disagree. Shown, never
                  // reconciled silently — the field wins on screen, but Rob is
                  // the one who decides which copy is wrong.
                  <div className="mt-1 text-[11px] text-amber-400">⚠ {conflict}</div>
                ) : null;
              })()}
              <EquityCorrect
                entityId={s.entityId}
                entityName={s.entityName}
                counterpartyPct={s.counterpartyPct}
                state={s.state}
              />
            </li>
          ))}
        </ul>
      )}

      {unreadable.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">
            Equity records with no readable split
          </div>
          <ul className="mt-1.5 space-y-1">
            {unreadable.map((u) => (
              <li key={u.entityId} className="text-[11px] text-slate-400">
                <Link href={u.href ?? `/people/${u.entityId}`} className="text-slate-300 hover:underline">
                  {u.entityName}
                </Link>{" "}
                — {u.reason}
                {/* Q41 inc.3: these are the rows that MOST need the control —
                    a stake whose number nothing can read is fixed by typing it
                    once, not by editing a sentence and hoping the parser agrees. */}
                <EquityCorrect
                  entityId={u.entityId}
                  entityName={u.entityName}
                  counterpartyPct={null}
                  state="unknown"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {leads.length > 0 && (
        <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
            Possible future Phase-4 stakes — talked about, not held
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Pulled out of notes and emails. Nothing here is owned; each row is a conversation to
            restart, quoted so you can judge it without opening the record.
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {leads.map((l) => (
              <li key={l.entityId} className="text-[11px] text-slate-400">
                <Link href={l.href ?? `/people/${l.entityId}`} className="text-slate-300 hover:underline">
                  {l.entityName}
                </Link>{" "}
                — <span className="italic text-slate-500">&ldquo;{l.evidence}&rdquo;</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

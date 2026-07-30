import type { ReceivableAlert } from "@/lib/rep/receivableAlerts";
import type { RepReceivableAlertsResult } from "@/lib/rep/receivableAlertsLoad";

// Q81 leg (c), inc.2 — the surface that replaced the daily nag.
//
// Rob (ROB-ANSWERS-2026-07-29-night.md §4): *"you can stop bringing it up every day. We just
// show it at the rep level so they see it when they open up and see the alerts and then also
// within the deal itself."* This is the "when they open up" half.
//
// This file renders and nothing else — which invoices are late was decided in
// `receivableAlerts.ts` (pure, CR-3, tested against the real ledger). Two rules it inherits
// and must not break on screen:
//
// 1. NO DOLLAR FIGURE. `ReceivableAlert` has no amount field at all (the column is withheld
//    from `mle_rep_read`), so there is nothing here to accidentally print. Days late is the
//    whole message: it is what a rep can act on, and it is not the owners' ledger.
//
// 2. "CLEAR" IS A CLAIM, SO IT CARRIES ITS DATE. A panel that says nothing when the read
//    failed would be a worse nag than the one Q81 deleted — it would say "you're good" on a
//    stale or broken read. Hence `unconfigured`/`error` render as themselves, and the clear
//    state prints the `synced_at` it is clear AS OF.

const SEVERITY_CLS: Record<ReceivableAlert["severity"], string> = {
  high: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-300",
};

/** ISO timestamp → the short "as of" a human reads without decoding it. */
export function asOfLabel(syncedAt: string | null): string {
  if (!syncedAt) return "ledger read, no invoices on file";
  const date = syncedAt.slice(0, 10);
  return `as of the ledger sync ${date}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        Money owed to us
      </div>
      {children}
    </section>
  );
}

export default function RepReceivableAlertsPanel({
  result,
  /** Set on a single account (the deal record); omitted on the whole-book list. */
  scopeLabel,
}: {
  result: RepReceivableAlertsResult;
  scopeLabel?: string;
}) {
  // Never invoiced is not a problem, and must not be dressed as one. Most accounts on the
  // board have no invoice at all; an amber "we can't vouch for this" on every one of them
  // trains the rep to skip the panel, which is precisely how the CG Roofing invoice would
  // get missed. One quiet line, stated as the fact it is, and no "as of" claim — there is
  // no clean bill of health being asserted here, so there is no date to stand behind.
  if (result.state === "unbilled") {
    return (
      <Shell>
        <p className="mt-1.5 text-sm text-slate-400">
          Nothing invoiced{scopeLabel ? ` to ${scopeLabel}` : ""} yet.
        </p>
      </Shell>
    );
  }

  if (result.state !== "ok") {
    return (
      <Shell>
        <p className="mt-1.5 text-sm text-slate-400">
          {result.state === "unconfigured"
            ? "Not reading the invoice ledger here — this environment has no ledger connection."
            : result.state === "unlinked"
              ? // Read the ledger fine, and MORE THAN ONE client could be this record. Money
                // exists and we cannot say whose — that is worth a warning, unlike `unbilled`.
                "More than one invoice-ledger client could be this record, so this is not a clean bill of health."
              : "Couldn't read the invoice ledger, so this is not a clean bill of health."}
        </p>
        <p className="mt-1 text-xs text-slate-500">{result.reason}</p>
      </Shell>
    );
  }

  const { alerts, unclassifiedCount, noDueDateCount } = result.alerts;
  // Counted, not asserted: rows the ledger cannot answer for. Shown because a rep quietly
  // handed six of eight late invoices is worse off than one told "six, and two we can't call."
  const caveats = [
    unclassifiedCount > 0
      ? `${unclassifiedCount} invoice${unclassifiedCount === 1 ? "" : "s"} the ledger status can't classify`
      : null,
    noDueDateCount > 0
      ? `${noDueDateCount} outstanding with no stated due date`
      : null,
  ].filter((c): c is string => c !== null);

  if (alerts.length === 0 && caveats.length === 0) {
    return (
      <Shell>
        <p className="mt-1.5 text-sm text-slate-300">
          Nothing overdue{scopeLabel ? ` on ${scopeLabel}` : ""}.{" "}
          <span className="text-slate-500">{asOfLabel(result.syncedAt)}</span>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-white">
          {alerts.length === 0
            ? "Nothing we can call overdue"
            : `${alerts.length} payment${alerts.length === 1 ? "" : "s"} overdue`}
          {scopeLabel ? <span className="text-slate-500"> · {scopeLabel}</span> : null}
        </h2>
        <span className="text-xs text-slate-500">{asOfLabel(result.syncedAt)}</span>
      </div>

      {alerts.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {alerts.map((a) => (
            <li
              key={a.invoiceNumber}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <span className="text-sm text-slate-200">{a.headline}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {a.invoiceNumber} · due {a.dueDate}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${SEVERITY_CLS[a.severity]}`}
                >
                  {a.daysOverdue}d late
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {caveats.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Not counted above — {caveats.join("; ")}.
        </p>
      )}
    </Shell>
  );
}

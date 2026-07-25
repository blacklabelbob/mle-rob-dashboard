import { STAGE_LABELS } from "@/lib/labels";
import type {
  AgingBucket,
  InvoicesArPanel,
} from "@/lib/readModel/invoiceLedger";
import type { KpiSummaryPanel, KpiTile } from "@/lib/readModel/kpiSummary";
import type {
  ActionItemsPanel,
  EsignPanel,
  PanelHeader,
  PipelinePanel,
} from "@/lib/readModel/panels";
import type { PanelsPayload } from "@/lib/readModel/source";

// PRD Task MC.12 — the ops panels' faces. Rendering ONLY: every number here
// was shaped by lib/readModel/panels.ts off the rm_* views (CR-3), so this
// file does no arithmetic beyond formatting.
//
// The honest-coverage contract is rendered, not hidden: a panel that can't be
// built says what would unblock it, a live-but-empty view says it's empty on
// purpose, and a view that failed to read says it failed — it never appears
// as a confident zero.

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Rob's 7/23 ruling: a $0 deal is COMPED and never renders as "$0". */
function dollars(n: number): string {
  return money.format(n);
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <div className={`text-lg font-semibold ${tone ?? "text-slate-100"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

/** Empty and unavailable both get said out loud, in the contract's own words. */
function CoverageNote({ header }: { header: PanelHeader }) {
  if (header.status === "live") return null;
  return (
    <p className="text-xs leading-relaxed text-slate-500">
      {header.status === "unavailable"
        ? "Can't be built yet — "
        : "Nothing in here yet — "}
      {header.note ?? "no reason recorded."}
      {header.unblockedBy && (
        <span className="text-slate-600"> Unblocked by {header.unblockedBy}.</span>
      )}
    </p>
  );
}

function FailedPanel({ title, message }: { title: string; message: string }) {
  return (
    <Card title={title}>
      <p className="text-xs leading-relaxed text-rose-300/80">
        Couldn&apos;t read this one just now, so there is no number to show:{" "}
        <span className="text-rose-300/60">{message}</span>
      </p>
    </Card>
  );
}

function Pipeline({ panel }: { panel: PipelinePanel }) {
  const shown = panel.stages.filter((s) => s.count > 0);
  return (
    <Card
      title="Pipeline"
      right={
        <span className="text-[11px] text-slate-500">
          {panel.totals.openDeals} open of {panel.totals.deals}
        </span>
      }
    >
      <CoverageNote header={panel} />
      {panel.status === "live" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Still in play" value={dollars(panel.totals.openValue)} tone="text-sky-300" />
            <Stat label="Won (paid)" value={dollars(panel.totals.wonValue)} tone="text-emerald-300" />
            <Stat label="Comped" value={String(panel.totals.comped)} tone="text-purple-300" />
            <Stat label="No value set" value={String(panel.totals.unvalued)} tone="text-amber-300" />
          </div>
          <ul className="mt-3 divide-y divide-white/5">
            {shown.map((s) => (
              <li key={s.stage} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-xs text-slate-300">
                  {STAGE_LABELS[s.stage]}
                  {s.closed && <span className="ml-1.5 text-[10px] text-slate-600">closed</span>}
                </span>
                <span className="text-xs text-slate-400">
                  {s.count} {s.count === 1 ? "deal" : "deals"}
                  {s.valueTotal > 0 && (
                    <span className="ml-2 text-slate-300">{dollars(s.valueTotal)}</span>
                  )}
                  {s.comped > 0 && <span className="ml-2 text-purple-300">{s.comped} COMPED</span>}
                  {s.unvalued > 0 && (
                    <span className="ml-2 text-amber-300/80">{s.unvalued} no value</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {panel.unknownStages.length > 0 && (
            <p className="mt-2 text-[11px] text-rose-300/80">
              Off-ladder stages found: {panel.unknownStages.join(", ")}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

const SIDE_LABEL: Record<string, string> = {
  ours: "Ours",
  external: "Theirs",
  unassigned: "Nobody assigned",
};

function ActionItems({ panel }: { panel: ActionItemsPanel }) {
  return (
    <Card
      title="Action items"
      right={
        <span className="text-[11px] text-slate-500">
          {panel.totals.open} open · {panel.totals.overdue} overdue
        </span>
      }
    >
      <CoverageNote header={panel} />
      {panel.status === "live" && (
        <div className="space-y-3">
          {panel.buckets
            .filter((b) => b.count > 0)
            .map((b) => (
              <div key={b.side}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-medium text-slate-300">{SIDE_LABEL[b.side]}</h3>
                  <span className="text-[11px] text-slate-500">
                    {b.overdue} overdue · {b.dueToday} due today · {b.upcoming} upcoming ·{" "}
                    {b.undated} undated
                  </span>
                </div>
                <ul className="mt-1 divide-y divide-white/5">
                  {b.items.map((it) => (
                    <li key={it.taskId} className="flex items-start justify-between gap-3 py-1.5">
                      <span className="min-w-0 text-xs text-slate-300">{it.title}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {it.assignedTo ?? "unassigned"} ·{" "}
                        {it.dueDate === null ? (
                          <span className="text-amber-300/80">no due date</span>
                        ) : it.daysOverdue !== null && it.daysOverdue > 0 ? (
                          <span className="text-rose-300">{it.daysOverdue}d overdue</span>
                        ) : (
                          it.dueDate
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          {panel.externalAssignees.length > 0 && (
            <p className="border-t border-white/5 pt-2 text-[11px] text-slate-600">
              Names we don&apos;t recognise as ours: {panel.externalAssignees.join(", ")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Esign({ panel }: { panel: EsignPanel }) {
  return (
    <Card
      title="Onboarding / e-sign"
      right={<span className="text-[11px] text-slate-500">{panel.outstanding} outstanding</span>}
    >
      <CoverageNote header={panel} />
      {panel.status === "live" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Out for signature" value={String(panel.outstanding)} tone="text-sky-300" />
            <Stat
              label="Awaiting our countersign"
              value={String(panel.awaitingCountersignature)}
              tone="text-amber-300"
            />
            <Stat label="Documents" value={String(panel.rows.length)} />
          </div>
          <ul className="mt-3 divide-y divide-white/5">
            {panel.byStatus.map((s) => (
              <li key={s.status} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-300">
                  {s.status === "no_request" ? "Not sent yet" : s.status}
                </span>
                <span className="text-xs text-slate-400">{s.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Bucket names in Rob's words, worst first. `no_due_date` is deliberately not
 *  softened into "not due yet" — the whole reason it is its own bucket is that
 *  we do NOT know when it's due, and that is the one he has to chase. */
const AGING_LABEL: Record<AgingBucket, string> = {
  overdue_60_plus: "60+ days overdue",
  overdue_31_60: "31–60 days overdue",
  overdue_1_30: "1–30 days overdue",
  due_today: "Due today",
  not_yet_due: "Not yet due",
  no_due_date: "No due date on the ledger",
  paid: "Paid",
};

const AGING_TONE: Record<AgingBucket, string> = {
  overdue_60_plus: "text-rose-300",
  overdue_31_60: "text-rose-300/80",
  overdue_1_30: "text-amber-300",
  due_today: "text-amber-300",
  not_yet_due: "text-slate-300",
  no_due_date: "text-sky-300",
  paid: "text-emerald-300/80",
};

function InvoicesAr({ panel }: { panel: InvoicesArPanel }) {
  return (
    <Card
      title="Invoicing / AR"
      right={
        // Only when the panel is actually live. An empty or unreadable mirror
        // totals to 0, and "$0.00 outstanding" in the header is indistinguishable
        // from "Rob is fully paid" — the one lie this panel exists to refuse.
        panel.status === "live" ? (
          <span className="text-[11px] text-slate-500">
            {dollars(panel.outstandingTotal)} outstanding
          </span>
        ) : null
      }
    >
      <CoverageNote header={panel} />
      {panel.status === "live" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Outstanding"
              value={dollars(panel.outstandingTotal)}
              tone="text-amber-300"
            />
            <Stat label="Paid" value={dollars(panel.paidTotal)} tone="text-emerald-300" />
            <Stat label="Invoices" value={String(panel.rows.length)} />
          </div>
          <ul className="mt-3 divide-y divide-white/5">
            {panel.byAging.map((g) => (
              <li key={g.bucket} className="flex items-center justify-between py-1.5">
                <span className={`text-xs ${AGING_TONE[g.bucket]}`}>
                  {AGING_LABEL[g.bucket]}
                  {g.unreadableAmounts > 0 && (
                    <span className="text-slate-600">
                      {" "}
                      · {g.unreadableAmounts} amount not readable
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  {g.count} · {dollars(g.amount)}
                </span>
              </li>
            ))}
          </ul>
          {/* Every carve-out the totals make gets said out loud. A quiet
              exclusion on a money panel is the number Rob quotes being wrong
              without anything looking wrong. */}
          {(panel.unclassifiedCount > 0 ||
            panel.noDueDateCount > 0 ||
            panel.unreadableAmountCount > 0) && (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {panel.unreadableAmountCount > 0 &&
                `${panel.unreadableAmountCount} invoice(s) had an amount we couldn't read — excluded from every total, never counted as $0. `}
              {panel.unclassifiedCount > 0 &&
                `${panel.unclassifiedCount} invoice(s) don't explicitly say paid, so they count as outstanding rather than being guessed. `}
              {panel.noDueDateCount > 0 &&
                `${panel.noDueDateCount} outstanding invoice(s) have no due date stated on the ledger.`}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** A KPI is a real number, a named blank, or nothing at all — the three states
 *  look different on purpose, so a blank can never be read as a zero. */
function KpiCell({ tile }: { tile: KpiTile }) {
  const value =
    tile.status === "computed" && tile.value !== null
      ? tile.format === "currency"
        ? dollars(tile.value)
        : String(tile.value)
      : tile.status === "no_data"
        ? "nothing yet"
        : "no number yet";
  const tone =
    tile.status === "computed"
      ? "text-slate-100"
      : tile.status === "no_data"
        ? "text-slate-500"
        : "text-slate-600";
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{tile.label}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
        {tile.note}
        {tile.unblockedBy && <span className="text-slate-700"> Unblocked by {tile.unblockedBy}.</span>}
      </p>
    </div>
  );
}

function KpiSummary({ panel }: { panel: KpiSummaryPanel }) {
  const real = panel.tiles.filter((t) => t.status === "computed");
  const rest = panel.tiles.filter((t) => t.status !== "computed");
  return (
    <Card
      title="KPI summary"
      right={
        <span className="text-[11px] text-slate-500">
          {panel.counts.computed} computable today · {panel.counts.noData + panel.counts.notComputable}{" "}
          not yet
        </span>
      }
    >
      {real.length === 0 ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Nothing is computable today — every KPI below names what it is waiting on.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {real.map((t) => (
            <KpiCell key={t.id} tile={t} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <>
          <p className="mt-4 text-[11px] uppercase tracking-wide text-slate-500">
            Not computable today
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((t) => (
              <KpiCell key={t.id} tile={t} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Unavailable({ header }: { header: PanelHeader }) {
  return (
    <Card title={header.label}>
      <CoverageNote header={header} />
    </Card>
  );
}

export default function PanelsView({ payload }: { payload: PanelsPayload }) {
  const failed = new Map(payload.errors.map((e) => [e.id, e.message]));
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Live from the read-model views as of {payload.todayISO} (Eastern).
      </p>
      <KpiSummary panel={payload.kpiSummary} />
      {payload.pipeline ? (
        <Pipeline panel={payload.pipeline} />
      ) : (
        <FailedPanel title="Pipeline" message={failed.get("rm_pipeline") ?? "no rows returned"} />
      )}
      {payload.actionItems ? (
        <ActionItems panel={payload.actionItems} />
      ) : (
        <FailedPanel
          title="Action items"
          message={failed.get("rm_action_items") ?? "no rows returned"}
        />
      )}
      {payload.esign ? (
        <Esign panel={payload.esign} />
      ) : (
        <FailedPanel
          title="Onboarding / e-sign"
          message={failed.get("rm_esign_status") ?? "no rows returned"}
        />
      )}
      {payload.invoicesAr ? (
        <InvoicesAr panel={payload.invoicesAr} />
      ) : (
        <FailedPanel
          title="Invoicing / AR"
          message={failed.get("rm_invoices_ar") ?? "no rows returned"}
        />
      )}
      {payload.unavailable.map((h) => (
        <Unavailable key={h.id} header={h} />
      ))}
    </div>
  );
}

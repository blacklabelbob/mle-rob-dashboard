import type { AssetRow } from "@/lib/agents/inventoryView";

// Q79 half (c). Rendering only — the ordering is decided in lib/agents/inventoryView.ts.
// Flagged files render EXPANDED with their evidence quoted inline; clean files render
// as one quiet line. That asymmetry is the design: the page exists to make a wrong
// instruction impossible to scroll past, not to be an even list of 132 files.

const SEVERITY_STYLE = {
  high: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  medium: "border-amber-400/40 bg-amber-400/10 text-amber-200",
} as const;

function Badge({ children, tone }: { children: React.ReactNode; tone: "high" | "medium" }) {
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[tone]}`}
    >
      {children}
    </span>
  );
}

function FlaggedRow({ row }: { row: AssetRow }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">{row.asset.name}</span>
        <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
          {row.asset.kind}
        </span>
        {row.high > 0 && <Badge tone="high">{row.high} wrong instruction</Badge>}
        {row.medium > 0 && <Badge tone="medium">{row.medium} to review</Badge>}
      </div>
      {row.asset.purpose && (
        <p className="mt-1.5 text-xs text-slate-400">{row.asset.purpose}</p>
      )}
      <ul className="mt-3 space-y-2">
        {row.findings.map((f, i) => (
          <li
            key={`${f.code}-${i}`}
            className={`rounded-lg border p-3 ${SEVERITY_STYLE[f.severity]}`}
          >
            <p className="text-xs leading-relaxed">{f.detail}</p>
            <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] text-slate-300/80">
              {f.evidence}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 break-all font-mono text-[10px] text-slate-500">{row.displayPath}</p>
    </li>
  );
}

function CleanRow({ row }: { row: AssetRow }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/5 px-1 py-2 last:border-b-0">
      <span className="text-xs font-medium text-slate-200">{row.asset.name}</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{row.asset.kind}</span>
      {row.asset.model && (
        <span className="font-mono text-[10px] text-slate-500">{row.asset.model}</span>
      )}
      {!row.asset.hasFrontmatter && (
        <span className="text-[10px] text-amber-300/80">no frontmatter — may never load</span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
        {row.asset.purpose ?? "no description declared"}
      </span>
    </li>
  );
}

export default function AgentInventoryView({
  rows,
  counts,
  clean,
  generatedAt,
}: {
  rows: AssetRow[];
  counts: { agents: number; skills: number; high: number; medium: number };
  clean: number;
  generatedAt: string;
}) {
  const flagged = rows.filter((r) => r.worst !== null);
  const rest = rows.filter((r) => r.worst === null);

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Agents", value: counts.agents, tone: "text-white" },
          { label: "Skills", value: counts.skills, tone: "text-white" },
          { label: "Wrong instructions", value: counts.high, tone: "text-rose-300" },
          { label: "To review", value: counts.medium, tone: "text-amber-300" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold ${s.tone}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="text-sm font-semibold text-white">
          Flagged — {flagged.length} of {rows.length}
        </h2>
        {flagged.length === 0 ? (
          <p className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400">
            Nothing flagged. Every agent and skill passed the instruction audit on this run.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {flagged.map((r) => (
              <FlaggedRow key={`${r.asset.kind}:${r.asset.slug}`} row={r} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white">Clean — {clean}</h2>
        <ul className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1">
          {rest.map((r) => (
            <CleanRow key={`${r.asset.kind}:${r.asset.slug}`} row={r} />
          ))}
        </ul>
      </section>

      <p className="text-[10px] text-slate-500">
        Generated from the files themselves by{" "}
        <span className="font-mono">npm run inventory:agents</span>; the{" "}
        <span className="font-mono">npm run audit:agents</span> gate fails the build when a
        wrong instruction appears or this page&apos;s data goes stale. Last generated{" "}
        {generatedAt}.
      </p>
    </div>
  );
}

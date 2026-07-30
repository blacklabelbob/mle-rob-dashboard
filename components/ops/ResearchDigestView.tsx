import type { ResearchDigest } from "@/lib/research/digest";
import { rankSections } from "@/lib/research/digest";

// Q80 half 2. Rendering only — every string here came out of the source `.md`
// via lib/research/digest.ts. The asymmetry is deliberate, same as /ops/agents:
// what Rob is ASKED renders loud at the top of each doc, what he is merely TOLD
// renders as a quiet scannable line. The docs sat unread because they were 389
// and 308 lines of markdown; a screen that reproduced that would fix nothing.

function AsksBlock({ points, label }: { points: string[]; label: string | null }) {
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">
        {points.length} question{points.length === 1 ? "" : "s"} for you
        {label ? ` · ${label}` : ""}
      </p>
      <ul className="mt-2 space-y-1.5">
        {points.map((point) => (
          <li key={point} className="text-xs leading-relaxed text-amber-50">
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionRow({
  heading,
  label,
  decision,
  points,
  morePoints,
}: {
  heading: string;
  label: string | null;
  decision: string | null;
  points: string[];
  morePoints: number;
}) {
  return (
    <li className="border-b border-white/5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-2">
        {label && <span className="font-mono text-[10px] text-slate-500">{label}</span>}
        <span className="text-xs font-semibold text-slate-200">{heading}</span>
      </div>
      {decision ? (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{decision}</p>
      ) : (
        points.length === 0 && (
          <p className="mt-1.5 text-[11px] italic text-slate-500">
            no decision line in this section — open in the source to read it
          </p>
        )
      )}
      {points.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {points.join(" · ")}
          {morePoints > 0 && ` · +${morePoints} more`}
        </p>
      )}
    </li>
  );
}

export default function ResearchDigestView({
  docs,
}: {
  docs: (ResearchDigest & { blurb?: string })[];
}) {
  return (
    <div className="space-y-5">
      {docs.map((doc) => {
        const sections = rankSections(doc.sections);
        const asks = sections.filter((s) => s.asksRob);
        const rest = sections.filter((s) => !s.asksRob);
        return (
          <section
            key={doc.slug}
            className="space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div>
              <h2 className="text-sm font-semibold text-white">{doc.title}</h2>
              {doc.blurb && <p className="mt-1 text-xs text-slate-400">{doc.blurb}</p>}
              <p className="mt-1 text-[11px] text-slate-500">
                {doc.date ?? "undated"} · {doc.status ?? "no status declared"}
              </p>
            </div>
            {doc.lead && (
              <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-slate-200">
                {doc.lead}
              </p>
            )}
            {asks.map((section) => (
              <AsksBlock key={section.heading} points={section.points} label={section.label} />
            ))}
            <ul>
              {rest.map((section) => (
                <SectionRow key={`${section.label}-${section.heading}`} {...section} />
              ))}
            </ul>
            {/* The digest replaces reading the doc; it does not replace the doc.
                Anyone who wants the evidence has to be able to find the file. */}
            <p className="break-all font-mono text-[10px] text-slate-500">{doc.path}</p>
          </section>
        );
      })}
    </div>
  );
}

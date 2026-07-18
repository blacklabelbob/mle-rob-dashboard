import Link from "next/link";
import { getStore } from "@/lib/storage";
import { money } from "@/lib/stats";
import type { Person } from "@/lib/types";

// Rep Cockpit — the page this CRM exists for (Rob: "the ultimate platform for
// sales reps... the only thing we need this for is to help close more deals").
// v1 runs on Jake Torres (DEMO) and his demo book. Principle 1: ONLY what
// closes deals. Every lead shows the STORY behind the source — the differentiator.

export const dynamic = "force-dynamic";

const REP = "Jake Torres (DEMO)";

function touchReason(p: Person): { label: string; cls: string } {
  if (p.quotedAmount && !p.signed)
    return { label: "quote out — follow up", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" };
  if (p.status === "warm")
    return { label: "warm — keep momentum", cls: "border-orange-400/30 bg-orange-400/10 text-orange-300" };
  return { label: "new — first touch", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" };
}

// Source context is the differentiator: pull the SOURCE block from description.
function sourceContext(p: Person): { source: string; detail: string } {
  const d = p.description ?? "";
  const m = d.match(/^SOURCE:\s*([^.]+)\.\s*([\s\S]*)$/);
  if (m) return { source: m[1].trim(), detail: m[2].trim() };
  return { source: p.relationship ?? "unknown", detail: d };
}

export default async function RepCockpit() {
  const data = await getStore().getNetwork();
  const book = data.people.filter((p) => (p.assignedRep ?? "").startsWith("Jake"));

  // Work order: money on the table first, then warm, then fresh meat.
  const queue = [...book].sort((a, b) => {
    const rank = (p: Person) => (p.quotedAmount && !p.signed ? 0 : p.status === "warm" ? 1 : 2);
    return rank(a) - rank(b) || (b.quotedAmount ?? 0) - (a.quotedAmount ?? 0);
  });

  const quotedOut = book.filter((p) => p.quotedAmount && !p.signed);
  const pipeline = quotedOut.reduce((s, p) => s + (p.quotedAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">Rep Cockpit</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            Jake Torres <span className="text-sm font-normal text-slate-500">Inside Sales Rep · DEMO</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {queue.length} to touch today · nothing on this screen that doesn&apos;t close deals
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="tabular text-xl font-semibold text-amber-300">{money(pipeline)}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">quotes out</div>
          </div>
          <div>
            <div className="tabular text-xl font-semibold text-sky-300">{book.length}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">my book</div>
          </div>
          <div>
            <div className="tabular text-xl font-semibold text-green-400">
              {book.filter((p) => p.keyDates.paid).length}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">paid clients</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {queue.map((p) => {
          const reason = touchReason(p);
          const ctx = sourceContext(p);
          const vertical = data.verticals.find((v) => v.id === p.verticalId);
          return (
            <section
              key={p.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/people/${p.id}`}
                      className="text-base font-semibold text-white hover:underline"
                    >
                      {p.name.replace(" (DEMO)", "")}
                    </Link>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${reason.cls}`}>
                      {reason.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: vertical?.color }} />
                      {vertical?.name}
                    </span>
                  </div>
                  {p.role && <div className="mt-0.5 text-xs text-slate-400">{p.role}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {p.quotedAmount ? (
                    <span className="tabular rounded-lg bg-amber-400/10 px-2.5 py-1 text-sm font-semibold text-amber-300">
                      {money(p.quotedAmount)} quoted
                    </span>
                  ) : null}
                  {p.phone && (
                    <a
                      href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}
                      className="rounded-lg bg-emerald-500/90 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
                    >
                      Call
                    </a>
                  )}
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      className="rounded-lg bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
                    >
                      Email
                    </a>
                  )}
                </div>
              </div>

              {/* The differentiator: how they got here, in detail */}
              <div className="mt-3 rounded-lg border border-sky-400/15 bg-sky-400/5 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-sky-400">
                  How they got here — {ctx.source}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{ctx.detail}</p>
              </div>

              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-600">
                <span className="uppercase tracking-wide">on this call:</span>
                {["Proposal", "Case studies", "E-sign", "Invoice"].map((b) => (
                  <span
                    key={b}
                    title="lands with Phase 8 — In-Call Action Buttons"
                    className="cursor-not-allowed rounded-md border border-white/10 px-2 py-0.5 text-slate-600"
                  >
                    {b}
                  </span>
                ))}
                <span className="text-slate-700">· Phase 8</span>
              </div>
            </section>
          );
        })}
        {queue.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-500">
            Book is empty — leads route in via the intake API (Phase 5).
          </p>
        )}
      </div>

      <p className="text-[11px] text-slate-600">
        DEMO rep + fabricated demo leads (marked in every record) — built 2026-07-18 per Rob to show
        the rep experience. Real reps + real routing land with Phases 4–5.
      </p>
    </div>
  );
}

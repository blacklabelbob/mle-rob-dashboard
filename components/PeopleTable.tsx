"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { contribution, money } from "@/lib/stats";
import type { Person, Vertical } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/labels";
import { InlineSelect, InlineText, InlineToggle } from "@/components/inline/fields";
import { useTableRows } from "@/lib/filters/useTableRows";
import { withShareToken } from "@/lib/filters/browserView";

// People ledger — Attio/Linear standard: every cell is live. Click a value,
// type, it saves on blur with an amber pulse. No edit mode, no Save button.
// Row checkboxes appear on hover; selecting rows slides in a contextual bar.

type SortKey = "contribution" | "quoted" | "name" | "signed" | "met";

const statusBadge: Record<Person["status"], string> = {
  lit: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  warm: "bg-orange-900/40 text-orange-300 border-orange-400/20",
  unlit: "bg-slate-800 text-slate-400 border-slate-600/40",
};

/**
 * Q67b DoD (c) — the affordance that turns a saved view into a link a colleague can open.
 *
 * The URL is built ON CLICK, never during render: there is no `window` on the server (a
 * render-time build is a hydration mismatch), and the address bar changes under this
 * component as the rep sorts or switches views — a URL frozen at first render would copy
 * a link to a page they left. `withShareToken` drops any `?view=` and sets `?share=`, so
 * the recipient never receives the one combination the route refuses.
 *
 * Clipboard access is NOT assumed. `navigator.clipboard` is absent outside a secure
 * context and can reject outright; a Copy button that silently does nothing is the worst
 * of the three outcomes, so a failure reveals the link itself, pre-selected, to copy by
 * hand. The rep always leaves with the link one way or the other.
 */
function CopyShareLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);

  async function copy() {
    let url: string;
    try {
      url = withShareToken(window.location.href, token);
    } catch {
      // Only reachable if the address bar itself is unparseable — say so rather than
      // handing over a half-built string.
      setManual(null);
      setCopied(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setManual(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setManual(url);
    }
  }

  if (manual !== null) {
    return (
      <input
        readOnly
        autoFocus
        value={manual}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setManual(null)}
        className="w-64 rounded border border-sky-400/30 bg-slate-950 px-2 py-1 text-[11px] text-sky-200"
      />
    );
  }

  return (
    <button
      onClick={copy}
      className="rounded border border-sky-400/30 px-2 py-1 text-[11px] text-sky-200 transition hover:bg-sky-400/10"
    >
      {copied ? "link copied" : "Copy share link"}
    </button>
  );
}

export default function PeopleTable({
  people,
  verticals,
}: {
  people: Person[];
  verticals: Vertical[];
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("contribution");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [newVerticalOpen, setNewVerticalOpen] = useState(false);
  const [newVertical, setNewVertical] = useState("");
  const newVerticalRef = useRef<HTMLInputElement>(null);

  // Q67b — when `?view=`/`?share=` is in the URL the rows come from `/api/views/page`;
  // with no view this is the server-rendered ledger, unchanged. `tableRows.ts` owns every
  // rule about which of those two is showing.
  const view = useTableRows(people);
  const rows = view.rows;

  // Built from BOTH lists on purpose: under a filter, the person who referred a visible row
  // may not itself match the filter, and looking it up only in `rows` would silently blank
  // the "Door (referred by)" cell for exactly the relationships this ledger exists to show.
  const byId = useMemo(
    () => new Map([...people, ...rows].map((p) => [p.id, p])),
    [people, rows]
  );
  const verticalById = useMemo(() => new Map(verticals.map((v) => [v.id, v])), [verticals]);
  const verticalOptions = useMemo(
    () => verticals.map((v) => ({ value: v.id, label: v.name })),
    [verticals]
  );
  const typeOptions = useMemo(
    () => Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
    []
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    switch (sortKey) {
      case "quoted":
        return arr.sort((a, b) => (b.quotedAmount ?? 0) - (a.quotedAmount ?? 0));
      case "name":
        return arr.sort((a, b) => a.name.localeCompare(b.name));
      case "signed":
        return arr.sort((a, b) => Number(b.signed) - Number(a.signed));
      case "met":
        return arr.sort((a, b) => (b.keyDates.met ?? "").localeCompare(a.keyDates.met ?? ""));
      default:
        return arr.sort((a, b) => contribution(b) - contribution(a));
    }
  }, [rows, sortKey]);

  function toggle(id: string) {
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function deleteChecked() {
    const ids = [...checked];
    if (!ids.length) return;
    const names = ids.map((i) => byId.get(i)?.name ?? i).slice(0, 4).join(", ");
    if (!window.confirm(`Delete ${ids.length} record(s)? (${names}${ids.length > 4 ? "…" : ""})`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/people", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (r.ok) {
        setChecked(new Set());
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addVertical() {
    const name = newVertical.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/verticals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (r.ok) {
        setNewVertical("");
        setNewVerticalOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function openNewVertical() {
    setNewVerticalOpen(true);
    setTimeout(() => newVerticalRef.current?.focus(), 30);
  }

  const sortBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`transition hover:text-white ${sortKey === key ? "text-sky-300" : ""}`}
    >
      {label}
      {sortKey === key ? " ↓" : ""}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex min-h-[34px] flex-wrap items-center gap-3">
        {checked.size > 0 ? (
          <div className="selection-bar flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
            <span className="text-xs font-medium text-white">{checked.size} selected</span>
            <button
              onClick={deleteChecked}
              disabled={busy}
              className="rounded-md bg-red-500/85 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-40"
            >
              Delete
            </button>
            <button
              onClick={() => setChecked(new Set())}
              className="text-xs text-slate-500 transition hover:text-white"
            >
              clear
            </button>
          </div>
        ) : newVerticalOpen ? (
          <div className="selection-bar flex items-center gap-2">
            <input
              ref={newVerticalRef}
              value={newVertical}
              onChange={(e) => setNewVertical(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addVertical();
                if (e.key === "Escape") setNewVerticalOpen(false);
              }}
              onBlur={() => !newVertical.trim() && setNewVerticalOpen(false)}
              placeholder="new vertical name — Enter to add"
              className="w-64 rounded-md border border-sky-400/50 bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-slate-600"
            />
          </div>
        ) : (
          <p className="text-xs text-slate-600">
            click any value to edit — it saves itself · hover a row to select
          </p>
        )}
      </div>

      {view.filtered && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-400/25 bg-sky-400/[0.07] px-3 py-2 text-xs">
          <span className="font-medium text-sky-200">
            {view.viewName ?? "Saved view"}
          </span>
          <span className="text-slate-400">
            {view.loading
              ? "loading…"
              : view.error
                ? view.error
                : `${sorted.length} row${sorted.length === 1 ? "" : "s"}${view.canLoadMore ? "+" : ""}`}
          </span>
          {/* Drawn only when the route handed back a token for THESE rows — see
              `tableRows.shareToken`. No token means loading, failed, or a view this table
              cannot draw, and in all three the honest button is no button. */}
          {view.shareToken !== null && (
            <div className="ml-auto">
              <CopyShareLink token={view.shareToken} />
            </div>
          )}
          <Link
            href="/people"
            className={`${view.shareToken !== null ? "" : "ml-auto "}text-slate-500 transition hover:text-white`}
          >
            clear view
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-8 px-2 py-2.5"></th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">{sortBtn("name", "Name")}</th>
              <th className="px-3 py-2.5">Relationship</th>
              <th className="px-3 py-2.5">Vertical</th>
              <th className="px-3 py-2.5">Door (referred by)</th>
              <th className="px-3 py-2.5 text-right">{sortBtn("quoted", "Quoted")}</th>
              <th className="px-3 py-2.5">{sortBtn("signed", "Signed")}</th>
              <th className="px-3 py-2.5">Paid</th>
              <th className="px-3 py-2.5 text-right">{sortBtn("contribution", "Est. contribution")}</th>
              <th className="px-3 py-2.5">{sortBtn("met", "Met")}</th>
              <th className="px-3 py-2.5">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((p) => {
              const referrer = p.referredById ? byId.get(p.referredById) : undefined;
              const vertical = verticalById.get(p.verticalId);
              return (
                <tr key={p.id} className="group transition hover:bg-white/[0.04]">
                  <td className="px-2 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked.has(p.id)}
                      data-active={checked.size > 0}
                      onChange={() => toggle(p.id)}
                      className="row-check h-3.5 w-3.5 cursor-pointer accent-sky-500"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineSelect
                      personId={p.id}
                      field="status"
                      value={p.status}
                      options={[
                        { value: "lit", label: "lit" },
                        { value: "warm", label: "warm" },
                        { value: "unlit", label: "unlit" },
                      ]}
                      display={
                        p.keyDates.paid ? (
                          <span className="rounded-full border border-green-400/40 bg-green-400/15 px-2 py-0.5 text-xs text-green-300">
                            paid
                          </span>
                        ) : (
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge[p.status]}`}>
                            {p.status}
                          </span>
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <InlineText
                        personId={p.id}
                        field="name"
                        value={p.name}
                        className="font-medium text-slate-100"
                        inputClassName="font-medium"
                      />
                      <Link
                        href={`/people/${p.id}`}
                        title="open record"
                        className="text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-sky-300"
                      >
                        ↗
                      </Link>
                    </div>
                    {p.entityKind === "company" && (
                      <span className="mr-1 rounded border border-white/10 bg-white/5 px-1 py-px text-[9px] uppercase tracking-wider text-slate-500" title="business record — gets its own table in the people/org split (Task 2.0)">biz</span>
                    )}
                    {p.business && p.business !== p.name && (
                      <div className="text-xs text-slate-500">{p.business}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    <InlineSelect
                      personId={p.id}
                      field="nodeType"
                      value={p.nodeType}
                      options={typeOptions}
                      allowEmpty
                      parse={(v) => v || null}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineSelect
                      personId={p.id}
                      field="verticalId"
                      value={p.verticalId}
                      options={verticalOptions}
                      onCreateNew={openNewVertical}
                      display={
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <span className="h-2 w-2 rounded-full" style={{ background: vertical?.color ?? "#64748b" }} />
                          {vertical?.name ?? p.verticalId}
                        </span>
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {referrer ? (
                      <div className="max-w-[220px]">
                        {referrer.name}
                        {p.relationship && (
                          <div className="line-clamp-2 text-xs text-slate-500" title={p.relationship}>
                            {p.relationship}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-slate-200">
                    <InlineText
                      personId={p.id}
                      field="quotedAmount"
                      value={p.quotedAmount != null && p.quotedAmount > 0 ? p.quotedAmount : null}
                      numeric
                      format={(v) => money(Number(v))}
                      inputClassName="text-right"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineToggle
                      personId={p.id}
                      field="signed"
                      value={p.signed}
                      onLabel={
                        p.keyDates.signed ? (
                          <span className="whitespace-nowrap text-emerald-400">✓ {p.keyDates.signed}</span>
                        ) : (
                          <span className="whitespace-nowrap text-amber-400" title="signed flag set but no signed date — excluded from totals until resolved">⚠ disputed</span>
                        )
                      }
                      offLabel={<span className="text-slate-600">—</span>}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {p.keyDates.paid ? (
                      <span className="whitespace-nowrap font-medium text-green-400">✓ {p.keyDates.paid}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-medium text-sky-300">
                    {contribution(p) > 0 ? money(contribution(p)) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{p.keyDates.met ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    <div className="space-y-0.5">
                      <div>
                        <InlineText personId={p.id} field="phone" value={p.phone} placeholder="+ phone" className={p.phone ? "" : "opacity-0 transition group-hover:opacity-100"} />
                      </div>
                      <div>
                        <InlineText personId={p.id} field="email" value={p.email} placeholder="+ email" className={p.email ? "" : "opacity-0 transition group-hover:opacity-100"} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Only drawn when the SERVER said there is another page — a button that fetches
          nothing is worse than no button. `loadMore` is safe to click twice regardless. */}
      {(view.canLoadMore || view.loadingMore) && (
        <div className="flex justify-center">
          <button
            onClick={view.loadMore}
            disabled={view.loadingMore}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
          >
            {view.loadingMore ? "loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addOutcome,
  blocklistView,
  floorCaption,
  removeOutcome,
  type BlocklistView,
  type PanelBody,
  type PanelOutcome,
} from "@/lib/comms/genericDomainPanel";

// Q69 inc.26 — the click that blocks a bulk sender.
//
// inc.24 made the blocklist editable without a deploy; inc.25 built the write
// door — and said plainly what was still missing: nothing in the UI opens it.
// Until this control existed, "Rob can block a domain without a deploy" was
// true only for someone holding the service key and a curl command.
//
// It sits on the Overview beside Things to Address on purpose: the reason to
// block a domain is a proposal sitting in that list ("we sent mail to
// news@bigmailer.com, it matches nothing"), and the decision belongs next to
// the evidence.
//
// It DECIDES NOTHING, and it CLAIMS nothing the route didn't report — every
// sentence and every refetch comes from the pure contract in
// `lib/comms/genericDomainPanel`, which is where the "200 but nothing changed"
// cases are pinned.

const toneClass = {
  ok: "text-emerald-300",
  info: "text-slate-400",
  warn: "text-amber-300",
  error: "text-red-300",
} as const;

export default function GenericDomainBlocklist() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BlocklistView | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PanelOutcome | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/generic-domains");
      const j = await r.json().catch(() => null);
      setView(blocklistView(r.status, j));
    } catch {
      setView(blocklistView(null, null));
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // One writer for both directions: the outcome contract decides the sentence,
  // the tone, and — critically — whether the list is refetched. A refetch on a
  // "200, nothing changed" answer is how a no-op reads as a success.
  async function write(
    req: () => Promise<Response>,
    read: (status: number | null, body: PanelBody) => PanelOutcome,
    onChanged?: () => void
  ) {
    setBusy(true);
    setOutcome(null);
    try {
      const r = await req();
      const j = await r.json().catch(() => null);
      const o = read(r.status, j);
      setOutcome(o);
      if (o.changed) {
        onChanged?.();
        await load();
      }
    } catch {
      setOutcome(read(null, null));
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    write(
      () =>
        fetch("/api/admin/generic-domains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, addedBy: "rob" }),
        }),
      addOutcome,
      // Cleared only on a real add: a refused value stays in the box, because
      // re-typing a domain you already typed is how the typo comes back.
      () => setDomain("")
    );

  const remove = (d: string) =>
    write(
      () => fetch(`/api/admin/generic-domains?domain=${encodeURIComponent(d)}`, { method: "DELETE" }),
      removeOutcome
    );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 transition hover:text-white"
      >
        ▸ Blocked email domains
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <button onClick={() => setOpen(false)} className="text-sm font-semibold text-white">
          ▾ Blocked email domains
        </button>
        <span className="text-[11px] text-slate-600">bulk senders that can never become a company</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && domain.trim() && !busy) void add();
          }}
          placeholder="mailchimp.com"
          className="w-52 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white outline-none"
        />
        <button
          onClick={() => void add()}
          disabled={busy || !domain.trim()}
          title="the domain only — not an email address"
          className="rounded-md bg-sky-500/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40"
        >
          {busy ? "…" : "Block"}
        </button>
      </div>

      {outcome && <p className={`mt-1.5 text-[11px] ${toneClass[outcome.tone]}`}>{outcome.text}</p>}

      {/* Q69 inc.27 — the forward-only footnote. A green "blocked!" on its own
          reads as "the CRM is clean now"; it isn't, if an earlier email already
          made the company. Amber, directly under the success line, with the
          record one click away. `unknown` says it couldn't check — never that
          nothing holds the domain. */}
      {outcome?.claim && (
        <p className="mt-1 text-[11px] text-amber-300">
          {outcome.claim.text}
          {outcome.claim.links.map((l) => (
            <a
              key={l.id}
              href={l.href}
              className="ml-1.5 underline decoration-dotted underline-offset-2 hover:text-amber-200"
            >
              {l.name} →
            </a>
          ))}
        </p>
      )}

      {/* An unreadable list is never drawn as an empty one — see blocklistView. */}
      {view?.kind === "unreadable" && <p className="mt-2 text-[11px] text-amber-300">{view.notice}</p>}

      {view?.kind === "ready" &&
        (view.rows.length === 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">
            You haven&apos;t added any domains yet.
          </p>
        ) : (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {view.rows.map((r) => (
              <li
                key={r.domain}
                title={r.note || undefined}
                className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] text-slate-300"
              >
                {r.domain}
                <button
                  onClick={() => void remove(r.domain)}
                  disabled={busy}
                  title={`unblock ${r.domain} — companies could claim it again`}
                  className="text-slate-500 transition hover:text-red-300 disabled:opacity-40"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ))}

      {view && <p className="mt-2 text-[11px] leading-snug text-slate-600">{floorCaption(view.floorCount)}</p>}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addOutcome,
  auditFrom,
  blocklistBadge,
  blocklistView,
  floorCaption,
  removeOutcome,
  type BlocklistView,
  type PanelBody,
  type PanelOutcome,
} from "@/lib/comms/genericDomainPanel";
import type { AuditFinding, BlocklistAudit } from "@/lib/comms/genericDomainAudit";
import {
  findingRepeatMark,
  flagAffordance,
  flagOutcome,
  heldDomainFlagPayload,
  heldFlagIndex,
  type FlagOutcome,
  type HeldFlagIndex,
} from "@/lib/comms/heldDomainFlag";

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
  const [audit, setAudit] = useState<BlocklistAudit | undefined>(undefined);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PanelOutcome | null>(null);
  const [flagged, setFlagged] = useState<Record<string, FlagOutcome | null>>({});
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  // Q69 inc.31 — what the LEDGER already says, not what this session remembers.
  // Starts `unknown` so a panel that hasn't read the flags yet never claims a
  // finding is already handled.
  const [flagIndex, setFlagIndex] = useState<HeldFlagIndex>({ kind: "unknown" });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/generic-domains");
      const j = await r.json().catch(() => null);
      setView(blocklistView(r.status, j));
      setAudit(auditFrom(j));
    } catch {
      setView(blocklistView(null, null));
      setAudit(undefined);
    }
  }, []);

  // Q69 inc.29 — loaded on mount, not on open. The sweep's whole purpose is to
  // surface an org nobody would otherwise re-examine; a finding that only
  // appears once someone expands this panel would never be seen, because
  // nobody expands a panel to find out whether it has anything to say.
  // Q69 inc.31 — the ledger read that makes the sweep idempotent across
  // sessions. Separate from `load` on purpose: a flags read that fails must not
  // cost us the sweep, and a sweep that fails must not cost us the dedupe.
  const loadFlags = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/flags");
      const j = await r.json().catch(() => null);
      setFlagIndex(heldFlagIndex(r.status, j));
    } catch {
      setFlagIndex(heldFlagIndex(null, null));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadFlags();
  }, [load, loadFlags]);

  const badge = blocklistBadge(audit);

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

  // Q69 inc.30 — the way OUT of a finding. The sweep re-runs on every mount, so
  // this panel's marker disappears the moment the org is judged elsewhere; the
  // ledger is the only surface where the question survives a page close.
  // Read-only still holds: this writes one `flags` row and touches no record.
  async function flagFinding(f: AuditFinding) {
    const payload = heldDomainFlagPayload(f);
    if (!payload) return; // refused upstream — never post a thin, unactionable row
    setFlagBusy(f.domain);
    setFlagged((m) => ({ ...m, [f.domain]: null }));
    try {
      const r = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      setFlagged((m) => ({ ...m, [f.domain]: flagOutcome(r.status, j) }));
    } catch {
      setFlagged((m) => ({ ...m, [f.domain]: flagOutcome(null, null) }));
    } finally {
      setFlagBusy(null);
    }
  }

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
        {badge && <span className={`ml-1.5 ${toneClass[badge.tone]}`}>· {badge.text}</span>}
      </button>
    );
  }

  return (
    // Q69 inc.32: the anchor a held-domain ledger row points back at — the
    // panel is the only surface that can act on the domain itself.
    <section id="generic-domains" className="scroll-mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
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

      {/* Q69 inc.29 — the STANDING version of the footnote above. inc.27's
          claim check only speaks at the moment you add a domain; this is the
          same read-only answer for every domain already on the list, so a
          company that claimed a blocked domain last week is still visible
          today. It names records and links to them — it deletes nothing. */}
      {audit?.kind === "checked" && audit.findings.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5">
          <p className="text-[11px] font-semibold text-amber-300">{audit.text}</p>
          <ul className="mt-1 space-y-1">
            {audit.findings.map((f) => {
              const affordance = flagAffordance(f.domain, flagIndex, flagged[f.domain]);
              const repeat = findingRepeatMark(f.domain, flagIndex);
              return (
              <li key={f.domain} className="text-[11px] leading-snug text-amber-200/80">
                {/* Q69 inc.39 — the repeat label, BEFORE the finding text. The
                    history already appears at the end of the row (on the button
                    or on the "already waiting" sentence), but that is where Rob
                    acts, not where he decides whether to read. A domain he has
                    judged three times otherwise opens with the same words as one
                    he has never seen. Label only — the count, no date, no advice;
                    the sentence below still carries both. */}
                {repeat && (
                  <span className="mr-1.5 rounded bg-amber-400/15 px-1 py-0.5 text-[10px] font-semibold text-amber-200">
                    {repeat}
                  </span>
                )}
                {f.text}
                {f.orgs.map((o) => (
                  <a
                    key={o.id}
                    href={o.href}
                    className="ml-1.5 underline decoration-dotted underline-offset-2 hover:text-amber-100"
                  >
                    {o.name} →
                  </a>
                ))}
                {/* Q69 inc.30 — the decision path. The finding names a company
                    and stops; this puts it where Rob resolves things, with a
                    note, and where it survives this panel re-sweeping clean.
                    inc.31: if an OPEN row for this domain is already on the
                    ledger, the button is replaced by the fact — a second
                    identical row is how the ledger stops being read. */}
                {affordance.kind === "already" ? (
                  <span className="ml-1.5 text-emerald-300">{affordance.text}</span>
                ) : (
                  <>
                    <button
                      onClick={() => void flagFinding(f)}
                      disabled={flagBusy === f.domain}
                      title="add to Things to Address — nothing is deleted, unblocked or changed"
                      className="ml-1.5 rounded border border-amber-400/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-40"
                    >
                      {flagBusy === f.domain ? "…" : "Add to Things to Address"}
                    </button>
                    {/* Q69 inc.33 — the sweep re-asks by design, so it must say
                        when Rob already answered. Without this the identical
                        question arrives every week and the panel trains him to
                        skip it. The button stays: a judged domain can change. */}
                    {affordance.judged && (
                      <span className="ml-1.5 text-amber-200/60">{affordance.judged}</span>
                    )}
                  </>
                )}
                {flagged[f.domain] && !flagged[f.domain]!.flagged && (
                  <span className="ml-1.5 text-red-300">{flagged[f.domain]!.text}</span>
                )}
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* A sweep that failed is never drawn as a clean one. */}
      {audit?.kind === "unchecked" && <p className="mt-2 text-[11px] text-amber-300">{audit.text}</p>}

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

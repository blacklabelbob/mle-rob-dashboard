"use client";

import { useEffect, useState } from "react";
import { suggestedNameFromDetail } from "@/lib/comms/proposalFlag";

// Q69 increment 6: the reviewer's one click, on screen.
//
// inc.3 queued the proposal, inc.4 planned the row, inc.5 built the route that
// writes it — but every one of those still needed a human with curl. This is
// the control that closes the loop: it sits on the ledger item itself, because
// the decision and the evidence ("we sent mail to trent@…, it matches nothing")
// belong in the same place.
//
// It DECIDES NOTHING. The name is pre-filled from the domain guess and the
// vertical starts empty; the route refuses both blanks. Confirming is an act —
// defaulting either field here would launder a guess into a company name.

type Vertical = { id: string; name: string };

export default function OrgProposalCreate({
  domain,
  detail,
  onCreated,
}: {
  domain: string;
  detail: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => suggestedNameFromDetail(detail));
  const [verticalId, setVerticalId] = useState("");
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open || verticals.length) return;
    let cancelled = false;
    fetch("/api/admin/org-proposals")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.verticals && !cancelled) setVerticals(j.verticals);
      })
      .catch(() => {
        /* the select stays empty and Create refuses — never a silent default */
      });
    return () => {
      cancelled = true;
    };
  }, [open, verticals.length]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/org-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, name, verticalId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        // The planner writes its refusals to be read by a human — show that
        // sentence verbatim rather than a status code the reviewer can't act on.
        setError(j?.detail || j?.error || `create failed (${r.status})`);
        return;
      }
      setDone(j?.org?.name ? `Created ${j.org.name}` : "Created");
      onCreated();
    } catch {
      setError("network error — nothing was created");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="text-[11px] text-emerald-300">{done} ✓</span>;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-sky-500/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-400"
      >
        Create company
      </button>
    );
  }

  const ready = name.trim().length > 0 && verticalId.length > 0;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="company name"
        className="w-44 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white outline-none"
      />
      <select
        value={verticalId}
        onChange={(e) => setVerticalId(e.target.value)}
        className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white outline-none"
      >
        <option value="">pick vertical…</option>
        {verticals.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <button
        onClick={create}
        disabled={busy || !ready}
        title={ready ? "creates an unlit lead — no money fields, ever" : "name and vertical are both required"}
        className="rounded-md bg-sky-500/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40"
      >
        {busy ? "…" : "Create"}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="rounded-md bg-white/10 px-2 py-1 text-xs text-white transition hover:bg-white/20"
      >
        Cancel
      </button>
      {error && <p className="w-full text-right text-[11px] text-red-300">{error}</p>}
    </div>
  );
}

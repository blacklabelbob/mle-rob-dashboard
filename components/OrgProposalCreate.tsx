"use client";

import { useEffect, useState } from "react";
import {
  addressFromDetail,
  createOutcomeMessage,
  suggestedNameFromDetail,
  verticalPickerState,
  type VerticalLoad,
} from "@/lib/comms/proposalFlag";

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
  const [load, setLoad] = useState<VerticalLoad>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<ReturnType<typeof createOutcomeMessage> | null>(null);

  // inc.17: the same refusal, now REPORTED. A failed load used to leave a
  // greyed-out button and a tooltip blaming the reviewer for a list they were
  // never shown; `load` is what lets the form say which of the two things went
  // wrong. Reopening refetches (verticals stays empty on failure), so "close
  // and reopen to retry" is a real instruction, not a shrug.
  useEffect(() => {
    if (!open || verticals.length) return;
    let cancelled = false;
    setLoad("loading");
    fetch("/api/admin/org-proposals")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        // A drifted shape is unreachable, not empty: "no verticals exist" is a
        // claim about the CRM, and we only get to make it from a real list.
        if (!Array.isArray(j?.verticals)) {
          setLoad("unreachable");
          return;
        }
        setVerticals(j.verticals);
        setLoad("ready");
      })
      .catch(() => {
        if (!cancelled) setLoad("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, [open, verticals.length]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      // inc.15: carry the address we wrote to, so the new record says WHY it
      // exists. Omitted (never blank-string'd) when the detail doesn't carry a
      // verifiable one — the planner then writes the note without that line.
      const address = addressFromDetail(detail, domain);
      const r = await fetch("/api/admin/org-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(address ? { domain, name, verticalId, address } : { domain, name, verticalId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        // The planner writes its refusals to be read by a human — show that
        // sentence verbatim rather than a status code the reviewer can't act on.
        setError(j?.detail || j?.error || `create failed (${r.status})`);
        return;
      }
      // inc.16: the route resolves the ledger flag AFTER the org write and
      // reports whether that second write landed. Reading it is the difference
      // between "handled" and "handled, but this item is still on your list".
      setDone(createOutcomeMessage(j?.org?.name, j?.flagResolved));
      onCreated();
    } catch {
      setError("network error — nothing was created");
    } finally {
      setBusy(false);
    }
  }

  // Amber, not green, when the flag did not close: the colour has to disagree
  // with "done", or one sentence is the only thing between Rob and a ledger
  // item he believes is handled. The ✓ moved INTO the message for the same
  // reason — it belongs to the resolved outcome, not to every outcome.
  if (done) {
    return (
      <span className={`text-[11px] ${done.resolved ? "text-emerald-300" : "text-amber-300"}`}>
        {done.text}
      </span>
    );
  }

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

  const picker = verticalPickerState(load, verticals.length, name.trim().length > 0, verticalId.length > 0);
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
        disabled={busy || !picker.canCreate}
        title={picker.canCreate ? "creates an unlit lead — no money fields, ever" : picker.blockReason}
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
      {/* Amber, not red: nothing failed to save — the form just can't be
          completed yet, and this is the only place that says why. */}
      {picker.notice && <p className="w-full text-right text-[11px] text-amber-300">{picker.notice}</p>}
      {error && <p className="w-full text-right text-[11px] text-red-300">{error}</p>}
    </div>
  );
}

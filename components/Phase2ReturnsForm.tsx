"use client";

// Q63 leg (5) inc.12: THE HANDLE. inc.11 built the door (`POST /api/admin/phase2-returns`);
// this is the only thing in the codebase a human being can use to knock on it, and it is
// what turns Q63's DoD from "the machinery exists" into "a measurement was entered."
//
// WHY THIS FORM HAS A SAVE BUTTON, against Rob's standing autosave bar (2026-07-17).
// Every inline field on a company record autosaves because it edits a FACT that is
// already true — a phone number, a stage. This does not edit anything: it RECORDS a
// measurement, and a measurement is an assertion by a named person about a moment in
// time that decides whether Rob owes this customer money back. Autosaving it would
// mean a half-typed hours figure files itself as a claim under someone's name, and the
// only way to withdraw a claim is `reinstateMeasurement`'s counterpart — retraction.
// The deliberate act gets a deliberate gesture. (Rob's bar is about not losing edits;
// nothing is lost here, because nothing is claimed until it is submitted.)
//
// THE FORM JUDGES NOTHING. There is no client-side validation in this file. Every rule
// about what a usable measurement is lives in `planPhase2ReturnsWrite`, and a second
// copy here is the copy that drifts — a field this form waved through but the door
// refuses, or worse, a field this form blocks that the door would have accepted. So
// the browser's own `required`/`min` attributes are absent too: they would be that
// second copy wearing HTML's clothes. The form's whole job is to carry a body over and
// render what came back, which is why `inc.8`'s string-typing seam exists at all — the
// numbers below leave here as the strings an <input> produces.
//
// THE THREE ANSWERS ARE THREE DIFFERENT THINGS ON SCREEN, never one "error" box:
//   refused (400)    → the sentence lands ON the field that caused it. Correctable.
//   superseded (409) → this instant was RETRACTED. Not the measurer's mistake and not
//                      a success; re-typing it will never work, so the message says
//                      what actually has to happen instead of inviting a retry.
//   failed (500)     → the write is of UNKNOWN outcome. It does not say "saved" and it
//                      does not say "not saved", because the route reached this branch
//                      precisely by not knowing.

import { useState } from "react";
import { phase2RefusalsByField } from "@/lib/phases/phase2ReturnsRefusalText";
import { REVENUE_BASES, type RevenueBasis } from "@/lib/phases/phase2ReturnsWrite";

const BASIS_LABEL: Record<RevenueBasis, string> = {
  top_line: "Top line — all revenue in the window",
  attributed: "Attributed — revenue traced to what we built",
};

type Result =
  | { kind: "stored"; measuredAt: string }
  | { kind: "refused"; byField: Record<string, string> }
  | { kind: "superseded"; measuredAt: string }
  | { kind: "failed"; detail: string };

const EMPTY = {
  laborHoursSaved: "",
  laborCostPerHour: "",
  revenueSincePhase2Start: "",
  revenueBasis: "" as RevenueBasis | "",
  measuredAt: "",
  measuredBy: "",
  note: "",
};

const field =
  "w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white " +
  "outline-none placeholder:text-slate-600 focus:border-sky-400/60";
const label = "block text-[10px] uppercase tracking-[0.14em] text-slate-500";

function Field({
  id,
  title,
  hint,
  problem,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  problem?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className={label} htmlFor={id}>
        {title}
      </label>
      <div className="mt-1">{children}</div>
      {/* The refusal replaces the hint rather than stacking under it: two lines of
          small grey-and-red text under one box is where a correction goes unread. */}
      {problem ? (
        <p className="mt-1 text-[11px] text-rose-300">{problem}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export default function Phase2ReturnsForm({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setV((p) => ({ ...p, [k]: e.target.value }));
    // A stale refusal beside a box the measurer has already fixed reads as "still
    // wrong". The verdict belongs to the body that was sent, so editing retires it.
    setResult(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/phase2-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sent as typed. inc.8's intake is what turns "12" into 12, and a blank
        // stays blank rather than becoming a zero somebody never measured.
        body: JSON.stringify({
          customerId,
          laborHoursSaved: v.laborHoursSaved,
          laborCostPerHour: v.laborCostPerHour,
          revenueSincePhase2Start: v.revenueSincePhase2Start,
          revenueBasis: v.revenueBasis,
          measuredAt: v.measuredAt,
          measuredBy: v.measuredBy,
          note: v.note.trim() === "" ? null : v.note,
          source: "admin_ui",
        }),
      });
      const body = await res.json().catch(() => null);

      if (res.ok && body?.ok) {
        setResult({ kind: "stored", measuredAt: body.row?.measured_at ?? v.measuredAt });
        setV((p) => ({ ...EMPTY, measuredBy: p.measuredBy }));
        return;
      }
      if (res.status === 400 && Array.isArray(body?.refusals)) {
        setResult({ kind: "refused", byField: phase2RefusalsByField(body.refusals) });
        return;
      }
      if (res.status === 409) {
        setResult({ kind: "superseded", measuredAt: body?.measuredAt ?? v.measuredAt });
        return;
      }
      setResult({ kind: "failed", detail: body?.error ?? `HTTP ${res.status}` });
    } catch (err) {
      // The request never completed. Whether the row landed is genuinely unknown.
      setResult({
        kind: "failed",
        detail: err instanceof Error ? err.message : "the request did not complete",
      });
    } finally {
      setBusy(false);
    }
  }

  const bad = result?.kind === "refused" ? result.byField : {};

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:border-sky-400/50 hover:text-white"
      >
        Record a measurement
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-white">
          Record a Phase 2 measurement
          {customerName ? <span className="font-normal text-slate-500"> · {customerName}</span> : null}
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-slate-500 hover:text-slate-300"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id="p2-hours" title="Hours saved" problem={bad.laborHoursSaved}>
          <input id="p2-hours" className={field} value={v.laborHoursSaved} onChange={set("laborHoursSaved")} inputMode="decimal" placeholder="0" />
        </Field>
        <Field id="p2-rate" title="Loaded $/hour" problem={bad.laborCostPerHour}>
          <input id="p2-rate" className={field} value={v.laborCostPerHour} onChange={set("laborCostPerHour")} inputMode="decimal" placeholder="0" />
        </Field>
        <Field id="p2-rev" title="Revenue since Phase 2" problem={bad.revenueSincePhase2Start}>
          <input id="p2-rev" className={field} value={v.revenueSincePhase2Start} onChange={set("revenueSincePhase2Start")} inputMode="decimal" placeholder="0" />
        </Field>

        <Field
          id="p2-basis"
          title="Revenue basis"
          hint="Stored, never inferred"
          problem={bad.revenueBasis}
        >
          <select id="p2-basis" className={field} value={v.revenueBasis} onChange={set("revenueBasis")}>
            <option value="">Choose…</option>
            {REVENUE_BASES.map((b) => (
              <option key={b} value={b}>
                {BASIS_LABEL[b]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="p2-at" title="Measured at" problem={bad.measuredAt}>
          <input id="p2-at" type="datetime-local" className={field} value={v.measuredAt} onChange={set("measuredAt")} />
        </Field>
        <Field id="p2-by" title="Measured by" problem={bad.measuredBy}>
          <input id="p2-by" className={field} value={v.measuredBy} onChange={set("measuredBy")} placeholder="Name" />
        </Field>
      </div>

      <div className="mt-3">
        <Field id="p2-note" title="Note" hint="Optional — how the number was arrived at">
          <input id="p2-note" className={field} value={v.note} onChange={set("note")} />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-sky-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
        >
          {busy ? "Recording…" : "Record measurement"}
        </button>

        {result?.kind === "stored" && (
          <span className="text-xs text-emerald-300">
            Recorded for {result.measuredAt}. The guarantee re-reads it on refresh.
          </span>
        )}
        {result?.kind === "refused" && (
          <span className="text-xs text-rose-300">
            Not recorded — see the fields above.
          </span>
        )}
        {result?.kind === "superseded" && (
          <span className="text-xs text-amber-300">
            A measurement for {result.measuredAt} was retracted. Re-recording it will not
            bring it back — reinstate it instead, or measure a different instant.
          </span>
        )}
        {result?.kind === "failed" && (
          <span className="text-xs text-rose-300">
            The write did not complete and its outcome is unknown ({result.detail}). Reload
            before re-entering it, so a stored measurement is not recorded twice.
          </span>
        )}
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  EQUITY_STATES,
  equitySaveOutcome,
  type EquityFieldValue,
  type EquitySaveOutcome,
  type EquityState,
} from "@/lib/equity";

// Q41 inc.3 — the click that corrects a split (Rob dev-chat #53: "I told you we
// have a 40% split, its actully 35%").
//
// inc.1 put the splits on a screen; inc.2 gave them a column and a write door.
// Until this control existed, "Rob can correct a wrong split in the UI himself"
// was true only for someone holding the service key and a curl command — and the
// wrong number would have sat there another five days.
//
// It DECIDES NOTHING. Every refusal comes from the route (which re-checks the
// pure `parseEquityCorrection`), and every sentence comes from `equitySaveOutcome`
// — so a 200 that does not report a saved split reads as "nothing confirmed",
// not as "saved". A false "saved" here is exactly the failure this panel exists
// to end.

const STATE_OPTION: Record<EquityState, string> = {
  signed: "signed",
  verbal: "agreed verbally — nothing signed",
  draft: "in draft at counsel",
  unknown: "state not recorded",
};

export default function EquityCorrect({
  entityId,
  entityName,
  counterpartyPct,
  state,
}: {
  entityId: string;
  entityName: string;
  counterpartyPct: number | null;
  state: EquityState;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(counterpartyPct === null ? "" : String(counterpartyPct));
  const [next, setNext] = useState<EquityState>(state);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EquitySaveOutcome | null>(null);
  // What the route confirmed this session. Rendered instead of the server's
  // number so the row is right before the refresh lands — and only ever set
  // from the response body, never from what was typed.
  const [saved, setSaved] = useState<EquityFieldValue | null>(null);

  async function submit() {
    setBusy(true);
    setOutcome(null);
    try {
      const r = await fetch("/api/admin/equity", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: entityId,
          // Empty box means "no agreed number" — an explicit null, which the
          // door accepts. It must NOT become 0, and it must not be omitted:
          // omitted is a missing field the door refuses on purpose.
          counterpartyPct: pct.trim() === "" ? null : pct.trim(),
          state: next,
          setBy: "rob",
        }),
      });
      const j = await r.json().catch(() => null);
      const o = equitySaveOutcome(r.status, j);
      setOutcome(o);
      if (o.saved) {
        setSaved(o.saved);
        setOpen(false);
        router.refresh();
      }
    } catch (e) {
      setOutcome({ tone: "error", message: `Not saved — ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      {saved && (
        <div className="text-[11px] text-emerald-300">
          now {saved.counterpartyPct === null ? "—" : `${saved.counterpartyPct} / ${saved.ourPct}`} ·
          corrected by {saved.setBy} on {saved.setAt}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] text-sky-300 underline-offset-2 hover:underline"
        >
          Correct this split
        </button>
      ) : (
        <div className="mt-1 rounded-lg border border-white/10 bg-black/30 p-2.5">
          <label className="block text-[11px] text-slate-400">
            {entityName}&apos;s side (%) — leave blank if no number is agreed
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              inputMode="numeric"
              placeholder="35"
              className="mt-1 w-24 rounded border border-white/15 bg-black/40 px-2 py-1 text-sm tabular-nums text-white"
            />
          </label>
          <label className="mt-2 block text-[11px] text-slate-400">
            State
            <select
              value={next}
              onChange={(e) => setNext(e.target.value as EquityState)}
              className="mt-1 block w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
            >
              {EQUITY_STATES.map((s) => (
                <option key={s} value={s}>
                  {STATE_OPTION[s]}
                </option>
              ))}
            </select>
          </label>
          {/* Our side is never typed — it is 100 minus theirs, which is the
              only value the door and the check constraint will both accept. */}
          <div className="mt-2 text-[11px] text-slate-500">
            Our side: {pct.trim() === "" ? "—" : `${100 - Number(pct)}`}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded bg-sky-500/20 px-2.5 py-1 text-[11px] text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setOutcome(null);
              }}
              className="rounded px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {outcome && (
        <div className={`mt-1 text-[11px] ${outcome.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>
          {outcome.message}
        </div>
      )}
    </div>
  );
}

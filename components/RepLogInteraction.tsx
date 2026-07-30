"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildManualLog,
  problemsFromRefusal,
  CHANNEL_LABELS,
  STAGE_CHANGE_OPTIONS,
  type DoorAnswer,
  type ManualChannel,
  type ManualLogFormState,
} from "@/lib/activities/manualLogForm";
import { MANUAL_CHANNELS } from "@/lib/activities/requiredFields";
import { STAGE_LABELS } from "@/lib/labels";

// Q46 R10 inc.2 — the log-interaction form, on the page the rep works from.
//
// This file renders and posts. WHAT is required, WHEN a form is refusable and
// WHAT the rep is told about each refusal all live in `manualLogForm` (which in
// turn composes the route's own `validateManualLog`) — one rule source, per
// CR-3. A second opinion here is exactly the drift that makes a rep fill in
// every field on screen and still eat a 400.
//
// THREE THINGS THIS SURFACE REFUSES TO DO:
//  · Post a form the rule already refuses. The problems render UNDER the Save
//    button, in the rep's words, before the network is touched.
//  · Show a refusal in the server's words. A 400 comes back as payload paths;
//    `problemsFromRefusal` turns them into the same rep-readable lines — and
//    can never come back empty, because a silent failure reads as a save.
//  · Move a deal. `stage_change` here is the rep's STATEMENT about what
//    happened; the deal column is written only by the audited PATCH behind the
//    stage chip above. One audit row per column.
//
// Save-button-having, unlike the inline kit: an interaction log is a single
// composed statement, not a field edit — autosaving half of one would post a
// partial account of a conversation. Rob's no-Save-button law is about editing
// a value that already exists.

const DOOR_CHOICES: { value: DoorAnswer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export default function RepLogInteraction({
  personId,
  orgId,
  createdBy,
  personName,
}: {
  personId: string;
  orgId?: string;
  createdBy?: string;
  personName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ManualLogFormState>({});
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof ManualLogFormState>(
    key: K,
    value: ManualLogFormState[K],
  ) => {
    setSaved(false);
    setState((s) => ({ ...s, [key]: value }));
  };

  // The offset is read at build time, from the rep's own browser — the pure
  // module takes it as an argument so the same inputs give the same instant.
  async function save() {
    if (saving) return;
    const built = buildManualLog(
      state,
      { personId, orgId, createdBy },
      new Date().getTimezoneOffset(),
    );
    if (!built.validation.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setProblems(problemsFromRefusal(res.status, body));
        return;
      }
      setState({});
      setSaved(true);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setProblems([
        `Not saved — could not reach the server. ${
          e instanceof Error ? e.message : ""
        }`.trim(),
      ]);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Log an interaction</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {saved
                ? "Saved — it is on the timeline."
                : `Call, email, meeting or note with ${personName}.`}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-sky-500/20 px-3.5 py-1.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/30"
          >
            + Log
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Log an interaction</h2>
        <button
          onClick={() => {
            setOpen(false);
            setProblems([]);
          }}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          cancel
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="When">
          <input
            type="datetime-local"
            value={state.occurredAtLocal ?? ""}
            onChange={(e) => set("occurredAtLocal", e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="How">
          <select
            value={state.channel ?? ""}
            onChange={(e) => set("channel", e.target.value as ManualChannel | "")}
            className={inputCls}
          >
            <option value="">— pick one —</option>
            {MANUAL_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Where did this come from">
          <input
            value={state.referralSource ?? ""}
            onChange={(e) => set("referralSource", e.target.value)}
            placeholder="referral name, or “none”"
            className={inputCls}
          />
        </Field>

        <Field label="Did this open a door">
          {/* Y/N/unanswered: no checkbox, because an untouched checkbox would
              save a “no door opened” claim nobody made. */}
          <div className="flex gap-2">
            {DOOR_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() =>
                  set("doorOpened", state.doorOpened === c.value ? undefined : c.value)
                }
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  state.doorOpened === c.value
                    ? "border-sky-400/50 bg-sky-400/20 text-sky-100"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        {state.doorOpened === "yes" && (
          <Field label="Who opened it">
            <input
              value={state.doorOpenedBy ?? ""}
              onChange={(e) => set("doorOpenedBy", e.target.value)}
              placeholder="name"
              className={inputCls}
            />
          </Field>
        )}

        <Field label="Next step">
          <input
            value={state.nextStep ?? ""}
            onChange={(e) => set("nextStep", e.target.value)}
            placeholder="what happens next"
            className={inputCls}
          />
        </Field>

        <Field label="Next step due">
          <input
            type="date"
            value={state.nextStepDue ?? ""}
            onChange={(e) => set("nextStepDue", e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Did this change the deal stage">
          <select
            value={state.stageChange ?? ""}
            onChange={(e) => set("stageChange", e.target.value)}
            className={inputCls}
          >
            <option value="">— pick one —</option>
            {STAGE_CHANGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "none" ? "No change" : STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            This records what happened. Move the deal with the stage chip above.
          </p>
        </Field>

        <Field label="Notes" wide>
          <textarea
            value={state.summary ?? ""}
            onChange={(e) => set("summary", e.target.value)}
            rows={2}
            placeholder="optional"
            className={inputCls}
          />
        </Field>
      </div>

      {problems.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-rose-400/30 bg-rose-400/5 px-4 py-3">
          {problems.map((p) => (
            <li key={p} className="text-xs text-rose-200">
              {p}
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg bg-sky-500/25 px-4 py-2 text-sm font-medium text-sky-50 transition hover:bg-sky-500/35 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save interaction"}
      </button>
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-sm text-white outline-none focus:border-sky-400/50";

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

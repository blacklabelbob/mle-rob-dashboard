"use client";

// Inline click-to-edit field kit — the Attio/Linear standard (Rob 2026-07-17:
// "I should just be able to go over to what I want to edit and edit it without
// even hitting save"). Every field: click → edit in place → autosave on blur or
// Enter, Esc cancels, optimistic UI, amber pulse on save. No modes. No Save buttons.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * @param opts.refresh  Re-run the server tree after a successful save. Default true,
 *   which is right for the single-field editors below: the saved value can change
 *   things the server rendered (a paid date promotes a row to Client, notes recompose
 *   against stored provenance), so the page has to catch up.
 *
 *   Pass `false` when the caller already holds the authoritative state and the server
 *   would only echo it back. Every `router.refresh()` re-runs the whole RSC tree on top
 *   of unbounded `select("*")` reads under `force-dynamic` — cheap once per deliberate
 *   field edit, wasteful on a debounced autosave that fires while someone drags a
 *   slider, and it fights the optimistic mirror below (the refreshed prop lands and
 *   resets local state, which is visible as flicker).
 */
export function useRecordSave(personId: string, opts: { refresh?: boolean } = {}) {
  const { refresh = true } = opts;
  const router = useRouter();
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(changes: Record<string, unknown>): Promise<boolean> {
    setState("saving");
    try {
      const r = await fetch("/api/admin/people", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: personId, changes }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setState("saved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 1200);
      if (refresh) router.refresh();
      return true;
    } catch {
      setState("error");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 2500);
      return false;
    }
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { save, state };
}

function pulseClass(state: SaveState) {
  // "saving" was reachable but unrendered until 2026-07-25: a slow save showed
  // nothing at all between the keystroke and the amber confirm. In a UI with no
  // Save button, that silent gap is the whole trust problem.
  if (state === "saving") return "inline-pulse-saving";
  if (state === "saved") return "inline-pulse-saved";
  if (state === "error") return "inline-pulse-error";
  return "";
}

// Optimistic mirror of a server prop: local writes show instantly, a prop
// change (router.refresh after save) re-syncs. Reset happens during render
// (react.dev "adjusting state when a prop changes"), not in an effect.
function useSyncedState<T>(value: T): [T, (v: T) => void] {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setShown(value);
  }
  return [shown, setShown];
}

/* ---------- text / number ---------- */

export function InlineText({
  personId,
  field,
  value,
  placeholder = "—",
  format,
  parse,
  numeric = false,
  className = "",
  inputClassName = "",
  title = "click to edit",
}: {
  personId: string;
  field: string;
  value: string | number | null | undefined;
  placeholder?: string;
  format?: (v: string | number) => string;
  parse?: (raw: string) => unknown;
  numeric?: boolean;
  className?: string;
  inputClassName?: string;
  title?: string;
}) {
  const { save, state } = useRecordSave(personId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useSyncedState(value); // optimistic
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  function open() {
    setDraft(shown != null ? String(shown) : "");
    setEditing(true);
  }

  async function commit() {
    setEditing(false);
    const raw = draft.trim();
    const current = shown != null ? String(shown) : "";
    if (raw === current) return;
    const parsed = parse ? parse(raw) : numeric ? (raw === "" ? null : Number(raw)) : raw;
    const prev = shown;
    setShown(raw === "" ? null : numeric ? Number(raw) : raw);
    const ok = await save({ [field]: parsed });
    if (!ok) setShown(prev);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type={numeric ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`inline-input ${inputClassName}`}
      />
    );
  }

  const empty = shown == null || shown === "";
  return (
    <button
      type="button"
      onClick={open}
      title={title}
      className={`inline-value ${pulseClass(state)} ${empty ? "inline-empty" : ""} ${className}`}
    >
      {empty ? placeholder : format ? format(shown as string | number) : String(shown)}
    </button>
  );
}

/* ---------- select ---------- */

export function InlineSelect({
  personId,
  field,
  value,
  options,
  display,
  allowEmpty,
  emptyLabel = "—",
  className = "",
  parse,
  onCreateNew,
}: {
  personId: string;
  field: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  display?: React.ReactNode;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  parse?: (v: string) => unknown;
  onCreateNew?: () => void;
}) {
  const { save, state } = useRecordSave(personId);
  const [shown, setShown] = useSyncedState(value ?? "");

  async function onChange(v: string) {
    if (v === "__new__") {
      onCreateNew?.();
      return;
    }
    const prev = shown;
    setShown(v);
    const ok = await save({ [field]: parse ? parse(v) : v || null });
    if (!ok) setShown(prev);
  }

  return (
    <span className={`inline-select-wrap ${pulseClass(state)} ${className}`}>
      {display}
      <select
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        className={display ? "inline-select-overlay" : "inline-select"}
        title="click to change"
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {onCreateNew && <option value="__new__">+ New vertical…</option>}
      </select>
    </span>
  );
}

/* ---------- toggle (signed etc.) ---------- */

export function InlineToggle({
  personId,
  field,
  value,
  onLabel,
  offLabel,
  className = "",
}: {
  personId: string;
  field: string;
  value: boolean;
  onLabel: React.ReactNode;
  offLabel: React.ReactNode;
  className?: string;
}) {
  const { save, state } = useRecordSave(personId);
  const [shown, setShown] = useSyncedState(value);

  async function flip() {
    const next = !shown;
    setShown(next);
    const ok = await save({ [field]: next });
    if (!ok) setShown(!next);
  }

  return (
    <button type="button" onClick={flip} title="click to toggle" className={`inline-value ${pulseClass(state)} ${className}`}>
      {shown ? onLabel : offLabel}
    </button>
  );
}

/* ---------- date chip ---------- */

export function InlineDateChip({
  personId,
  label,
  dateKey,
  keyDates,
}: {
  personId: string;
  label: string;
  dateKey: string;
  keyDates: Record<string, string | undefined>;
}) {
  const { save, state } = useRecordSave(personId);
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useSyncedState(keyDates[dateKey]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.showPicker?.();
  }, [editing]);

  async function commit(v: string) {
    setEditing(false);
    if ((v || undefined) === shown) return;
    const prev = shown;
    setShown(v || undefined);
    const next = { ...keyDates };
    if (v) next[dateKey] = v;
    else delete next[dateKey];
    const ok = await save({ keyDates: Object.fromEntries(Object.entries(next).filter(([, x]) => x)) });
    if (!ok) setShown(prev);
  }

  return (
    <span
      className={`inline-datechip ${shown ? "inline-datechip-set" : ""} ${pulseClass(state)}`}
      onClick={() => !editing && setEditing(true)}
      title="click to set date"
    >
      <span className="inline-datechip-label">{label}</span>
      {editing ? (
        <input
          ref={ref}
          type="date"
          defaultValue={shown ?? ""}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="inline-datechip-input"
          autoFocus
        />
      ) : (
        <span className="inline-datechip-value">{shown ?? "pending"}</span>
      )}
    </span>
  );
}

/* ---------- textarea (notes / description) ---------- */

export function InlineTextarea({
  personId,
  field,
  value,
  placeholder,
  className = "",
}: {
  personId: string;
  field: string;
  value: string | null | undefined;
  placeholder: string;
  className?: string;
}) {
  const { save, state } = useRecordSave(personId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useSyncedState(value ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft === shown) return;
    const prev = shown;
    setShown(draft);
    const ok = await save({ [field]: draft });
    if (!ok) setShown(prev);
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        className={`inline-textarea ${className}`}
      />
    );
  }

  return (
    <div
      onClick={() => {
        setDraft(shown);
        setEditing(true);
      }}
      title="click to edit"
      className={`inline-textblock ${pulseClass(state)} ${shown ? "" : "inline-empty"} ${className}`}
    >
      {shown || placeholder}
    </div>
  );
}

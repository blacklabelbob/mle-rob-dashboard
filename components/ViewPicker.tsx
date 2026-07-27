"use client";

/**
 * Q67b DoD — "a rep saves a view in the UI". This is the control that makes that sentence
 * true: pick a saved view, clear back to the full ledger, save the view a share link is
 * showing, delete one that is theirs.
 *
 * Deliberately thin. `viewPicker.ts` (pure, tested) decides what may be CLAIMED on screen,
 * `viewsClient.ts` decides what the wire may return, `viewIdentity.ts` decides who a save
 * is filed under, `useViewPicker.ts` owns the fetching. What is left here is markup and
 * two pieces of local state — this repo has no jsdom, so a rule written in a component is
 * a rule no test can reach, and none are written here.
 *
 * Three things the markup itself must not do:
 *
 *  - **Never show a name it cannot back up.** The closed label is `model.label`, which is
 *    "View not found" for a `?view=` the list does not contain and never quietly "All
 *    people" — the table IS filtered in that state, so the friendly label would say the
 *    CRM is empty when it is not.
 *  - **Never offer Save where a save cannot work.** `model.saveable` is non-null only for
 *    a share link (the one page whose browser holds the filter tree), and identity may be
 *    unset entirely — in which case the box is absent WITH its reason, not silently gone.
 *  - **Never hide a broken row.** A view the list door could not validate is counted in
 *    plain sight; losing it silently is how a rep concludes they deleted something.
 */

import { useState } from "react";
import Link from "next/link";
import type { ViewSource } from "@/lib/filters/page";
import { NO_VIEW_LABEL } from "@/lib/filters/viewPicker";
import { useViewPicker } from "@/lib/filters/useViewPicker";
import { resolveViewIdentity } from "@/lib/filters/viewIdentity";

const SCOPE_BADGE = "rounded border px-1 text-[10px] uppercase tracking-wide";

export default function ViewPicker({ source }: { source: ViewSource | null }) {
  // Configuration, not an authorship model: unset is the normal case today and resolves
  // to `null` (see viewIdentity). Phase 4 replaces this line with the session.
  const identity = resolveViewIdentity({
    owner: process.env.NEXT_PUBLIC_VIEW_OWNER,
    team: process.env.NEXT_PUBLIC_VIEW_TEAM,
  });

  const { model, list, listError, actionError, busy, canShare, save, remove } =
    useViewPicker(identity, source);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  async function onSave() {
    const wanted = name.trim();
    if (wanted === "") return;
    if (await save(wanted, shared)) {
      setName("");
      setOpen(false);
    }
  }

  const taken = model.nameTaken;

  return (
    <div className="relative flex flex-wrap items-center gap-2 text-[11px]">
      <button
        onClick={() => setOpen((o) => !o)}
        // The visible label is the STATE ("All people", "Shared link: probe") — it never
        // says what the control is, which is how inc.13 searched the rendered page for a
        // view picker and concluded it had not mounted. A rep reads the same page. The
        // accessible name carries the noun; the visible label keeps carrying the state.
        aria-label={`Saved views — ${model.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Saved views"
        className={`rounded border px-2 py-1 transition ${
          model.selection === "unknown-view"
            ? "border-red-400/40 text-red-300 hover:bg-red-400/10"
            : model.selection === "none"
              ? "border-white/10 text-slate-300 hover:bg-white/5"
              : "border-sky-400/30 text-sky-200 hover:bg-sky-400/10"
        }`}
      >
        {model.label} ▾
      </button>

      {model.selection !== "none" && (
        <Link href={model.clearHref} className="text-slate-400 transition hover:text-white">
          clear
        </Link>
      )}

      {model.brokenCount > 0 && (
        <span className="text-amber-300">
          {model.brokenCount} unreadable view{model.brokenCount > 1 ? "s" : ""}
        </span>
      )}
      {listError && <span className="text-red-300">views: {listError}</span>}
      {actionError && <span className="text-red-300">{actionError}</span>}

      {open && (
        <div className="absolute left-0 top-8 z-20 w-72 space-y-1 rounded-lg border border-white/10 bg-slate-950 p-2 shadow-xl">
          <Link
            href={model.clearHref}
            onClick={() => setOpen(false)}
            className={`block rounded px-2 py-1 transition hover:bg-white/5 ${
              model.selection === "none" ? "text-sky-300" : "text-slate-300"
            }`}
          >
            {NO_VIEW_LABEL}
          </Link>

          {model.items.map((item) => (
            <div key={item.id} className="flex items-center gap-1">
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex-1 truncate rounded px-2 py-1 transition hover:bg-white/5 ${
                  item.selected ? "text-sky-300" : "text-slate-300"
                }`}
              >
                {item.name}
                <span
                  className={`ml-1 ${SCOPE_BADGE} ${
                    item.scope === "team"
                      ? "border-emerald-400/30 text-emerald-300"
                      : "border-white/10 text-slate-500"
                  }`}
                >
                  {item.scope === "team" ? "team" : item.target}
                </span>
              </Link>
              {identity && item.owner_id === identity.owner && (
                <button
                  onClick={() => remove(item.id)}
                  disabled={busy}
                  title="Delete this view"
                  className="rounded px-1 text-slate-500 transition hover:text-red-300 disabled:opacity-40"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {list !== null && model.items.length === 0 && (
            <p className="px-2 py-1 text-slate-500">No saved views yet.</p>
          )}
          {list === null && identity !== null && !listError && (
            <p className="px-2 py-1 text-slate-500">Loading…</p>
          )}

          <div className="mt-1 border-t border-white/10 pt-2">
            {identity === null ? (
              <p className="px-2 text-slate-500">
                Saving needs a rep identity — set on the deployment (Phase 4 profiles).
              </p>
            ) : model.saveable === null ? (
              <p className="px-2 text-slate-500">
                Open a share link to save its filter as a view.
              </p>
            ) : (
              <div className="space-y-1 px-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSave()}
                  placeholder={model.saveable.name}
                  className="w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-slate-100"
                />
                {taken && name.trim() === "" && (
                  <p className="text-amber-300">
                    &ldquo;{taken.name}&rdquo; already exists here — pick another name.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  {canShare && (
                    <label className="flex items-center gap-1 text-slate-400">
                      <input
                        type="checkbox"
                        checked={shared}
                        onChange={(e) => setShared(e.target.checked)}
                      />
                      team
                    </label>
                  )}
                  <button
                    onClick={onSave}
                    disabled={busy || name.trim() === ""}
                    className="rounded bg-sky-500/80 px-2 py-1 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40"
                  >
                    {busy ? "Saving…" : "Save view"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

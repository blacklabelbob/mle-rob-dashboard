"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OrgProposalCreate from "./OrgProposalCreate";
import {
  archiveConsequence,
  overviewReadControl,
  proposalDomain,
  resolveControlCopy,
  writeFailureMessage,
  type WriteFailure,
} from "@/lib/comms/proposalFlag";
import { reopenFailureMessage, supersededBy } from "@/lib/flags/supersede";
import {
  archiveRepeatMark,
  archiveRepeatSummary,
  heldArchiveNote,
  heldArchivePlaces,
  heldPriorJudgements,
  heldRowCopy,
  ledgerRepeatMark,
  groupRepeatsWithinSeverity,
  rowRepeatMark,
} from "@/lib/comms/heldDomainFlag";

// "Things to Address" (Rob 2026-07-22): findings Max surfaces, resolved in-place
// with an optional note. Resolved items are never removed — they archive into an
// expandable section underneath, carrying notified + resolved dates.

type Flag = {
  id: number;
  entity_id: string | null;
  entity_name: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  status: "open" | "resolved";
  notified_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

async function fetchFlags(person?: string): Promise<Flag[] | null> {
  try {
    const r = await fetch(person ? `/api/admin/flags?person=${person}` : "/api/admin/flags");
    if (!r.ok) return null;
    return (await r.json()).flags;
  } catch {
    /* section is non-critical — never break the ledger */
    return null;
  }
}

const sevStyle: Record<Flag["severity"], string> = {
  high: "border-red-400/40 bg-red-500/10 text-red-300",
  medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  low: "border-sky-400/30 bg-sky-400/10 text-sky-300",
};

export default function ThingsToAddress({
  mode = "entity",
  person,
}: {
  mode?: "overview" | "entity";
  person?: string;
}) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // inc.19: keyed by flag id so the sentence sits on the row it is about — a
  // ledger-wide banner can't say WHICH dismiss failed.
  const [failed, setFailed] = useState<(WriteFailure & { id: number }) | null>(null);

  const load = useCallback(async () => {
    const next = await fetchFlags(person);
    if (next) setFlags(next);
  }, [person]);

  useEffect(() => {
    let cancelled = false;
    fetchFlags(person).then((next) => {
      if (next && !cancelled) setFlags(next);
    });
    return () => {
      cancelled = true;
    };
  }, [person]);

  // inc.19: both writes used to swallow their own failure — `markRead` never
  // read `r.ok`, `resolve` had an empty else. A refused PATCH rendered as
  // nothing at all, which reads as a broken button. `null` status means the
  // request never came back, and that is a different claim (see
  // writeFailureMessage): the reviewer is asked to reload, not to re-click.
  async function patch(id: number, title: string, body: object, action: "resolve" | "read") {
    setFailed(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setFailed({ id, ...writeFailureMessage(action, r.status, title) });
        return false;
      }
      await load();
      return true;
    } catch {
      setFailed({ id, ...writeFailureMessage(action, null, title) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // inc.10: reopen is its own request because its refusal is its own answer. A
  // keyed row cannot reopen while its twin is open (0033's partial unique index),
  // and the route replies 409 with a sentence naming that twin — which `patch`
  // would flatten into "try again", the one thing that cannot work here.
  async function reopen(f: Flag) {
    setFailed(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, action: "reopen" }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        setFailed({ id: f.id, ...reopenFailureMessage(r.status, body?.error) });
        return;
      }
      await load();
    } catch {
      setFailed({ id: f.id, ...reopenFailureMessage(null) });
    } finally {
      setBusy(false);
    }
  }

  async function markRead(f: Flag) {
    await patch(f.id, f.title, { id: f.id, action: "read" }, "read");
  }

  async function resolve(f: Flag, withNote: string) {
    // The note is cleared only on success: on a proposal it is the sole record
    // of why a domain was shut out, and re-typing it is how it ends up blank.
    if (await patch(f.id, f.title, { id: f.id, action: "resolve", note: withNote }, "resolve")) {
      setNoteFor(null);
      setNote("");
    }
  }

  const openRows = flags.filter((f) => f.status === "open");
  const resolved = flags.filter((f) => f.status === "resolved");
  const archivePlaces = heldArchivePlaces(flags);
  // inc.38: prior decisions on the SAME rows the archive is placed from, so the
  // open row, the archive row and the panel all count one history.
  const priorJudgements = heldPriorJudgements(flags);
  // inc.41: off the SAME map the open rows print their history from, so the
  // header and the rows can never disagree about one question.
  const openRepeat = ledgerRepeatMark(
    openRows.map((f) => f.title),
    priorJudgements
  );
  // inc.46: inc.41 counts the repeats and inc.42 badges them; this puts them in
  // one place so the count is findable without scanning every row. Rows only
  // move WITHIN their own severity run — the colours' priority claim is untouched.
  const open = groupRepeatsWithinSeverity(openRows, priorJudgements) as Flag[];
  if (!flags.length) return null;

  // Overview mode: compact digest — unread open items only, hover for full
  // detail, "Read" clears it from Overview (read ≠ resolved; it stays on the
  // entity's own pages until actually resolved).
  if (mode === "overview") {
    // Q69 inc.6: a company proposal has `entity_id: null` by design — no record
    // exists yet — so the Overview is its ONLY surface. Marking it read must
    // not be able to hide the one place it can be acted on, so proposals stay
    // listed until they are resolved (which creating the company does).
    const unread = open.filter(
      (f) => !(f as Flag & { read_at?: string | null }).read_at || proposalDomain(f.title)
    );
    return (
      <section className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-5">
        <h2 className="font-semibold text-amber-200">
          Things to Address{" "}
          {unread.length > 0 && (
            <span className="ml-1 rounded-full bg-red-500/80 px-2 py-0.5 text-xs font-bold text-white">
              {unread.length}
            </span>
          )}
        </h2>
        {unread.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Nothing unread. Open items live on each record&apos;s page.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {unread.map((f) => {
              // inc.20: the filter above deliberately keeps proposals listed —
              // so the checkbox that promises to clear the row could never keep
              // that promise on one, and its caption named a record page that
              // does not exist. One contract decides both.
              const read = overviewReadControl(f.title, Boolean(f.entity_id));
              return (
              <li key={f.id} className="flex items-start gap-3 text-sm" title={f.detail}>
                {read.checkbox ? (
                  <input
                    type="checkbox"
                    title={read.tooltip}
                    onChange={() => markRead(f)}
                    disabled={busy}
                    className="mt-1 h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                  />
                ) : (
                  // Space held, not a control: the row keeps its alignment, and
                  // a dot invites no click that would do nothing.
                  <span
                    title={read.tooltip}
                    aria-label={read.tooltip}
                    className="mt-1 h-3.5 w-3.5 shrink-0 cursor-help text-center text-[10px] leading-[0.875rem] text-slate-600"
                  >
                    •
                  </span>
                )}
                <div className="min-w-0">
                  <span className={`mr-2 rounded px-1.5 py-px text-[10px] uppercase ${sevStyle[f.severity]}`}>{f.severity}</span>
                  {f.entity_id ? (
                    <Link href={`/people/${f.entity_id}`} className="font-medium text-slate-200 hover:underline">
                      {f.entity_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-200">{f.entity_name}</span>
                  )}
                  <span className="text-slate-400"> — {f.title}</span>
                  {/* inc.32: the digest is a scan surface, so the held-domain
                      row gets its STATE here (still blocked) and nothing else —
                      the hint and the way back live on the full row, where the
                      decision is actually made. */}
                  {heldRowCopy(f.title) && (
                    <span className="ml-2 rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-px text-[10px] font-medium text-amber-200">
                      still blocked
                    </span>
                  )}
                  <span className="ml-2 text-[10px] text-slate-600">{f.notified_at} · hover for detail</span>
                  {/* A checkbox that ticks and then un-ticks with no
                      explanation is the Overview's version of a dead button. */}
                  {failed?.id === f.id && (
                    <p className={`text-[11px] ${failed.certain ? "text-amber-300" : "text-red-300"}`}>
                      {failed.text}
                    </p>
                  )}
                </div>
                {proposalDomain(f.title) && (
                  <div className="ml-auto shrink-0">
                    <OrgProposalCreate
                      domain={proposalDomain(f.title) as string}
                      detail={f.detail}
                      onCreated={load}
                    />
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-white">
          Things to Address{" "}
          {open.length > 0 && (
            <span className="ml-1 rounded-full bg-red-500/80 px-2 py-0.5 text-xs font-bold text-white">
              {open.length}
            </span>
          )}
          {/* inc.41: the count says how much is open, never how much of it Rob
              has already answered. The marker rides the header because that is
              what is read BEFORE the decision to work the list; the per-row
              history (inc.38) is read after. Deliberately un-fractioned — this
              list is mixed, so the badge's number and this one count different
              populations. */}
          {openRepeat && (
            <span className="ml-2 align-middle text-[11px] font-normal text-slate-400">
              · {openRepeat}
            </span>
          )}
        </h2>
        <span className="text-[11px] text-slate-600">found by Max · resolve in place</span>
      </div>

      {open.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing open. 🎉</p>}

      <ul className="mt-3 space-y-2.5">
        {open.map((f) => {
          // inc.18: on a proposal row the emerald button is not housekeeping —
          // it shuts the domain out of the CRM for good (the proposal dedupe
          // counts resolved titles as existing). One contract drives its label,
          // its tooltip, the line under it and the note prompt.
          const copy = resolveControlCopy(f.title);
          return (
          <li key={f.id} className={`rounded-lg border px-3 py-2.5 ${sevStyle[f.severity]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {f.entity_id ? (
                    <Link href={`/people/${f.entity_id}`} className="hover:underline">
                      {f.entity_name}
                    </Link>
                  ) : (
                    f.entity_name
                  )}
                  <span className="opacity-80"> — {f.title}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{f.detail}</p>
                {/* inc.32: a held-domain row carries its own state and its way
                    back. Resolve is the only other affordance on this row, and
                    on this kind of row it means something narrower than usual —
                    said before the click, not after. */}
                {(() => {
                  const held = heldRowCopy(f.title, priorJudgements);
                  if (!held) return null;
                  // inc.42: the header (inc.41) promises N of these are repeats;
                  // this is the pointer to WHICH. It sits at badge weight beside
                  // the state badge because the history is currently only in the
                  // sentence that follows — read after the row, not before it.
                  // The order of the list is deliberately untouched: it is
                  // severity order, and history is not urgency.
                  const repeat = rowRepeatMark(f.title, priorJudgements);
                  return (
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      <span className="mr-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-px text-[10px] font-medium text-amber-200">
                        {held.badge}
                      </span>
                      {repeat && (
                        <span className="mr-1.5 rounded border border-slate-400/30 bg-slate-400/10 px-1.5 py-px text-[10px] font-medium text-slate-300">
                          {repeat}
                        </span>
                      )}
                      {held.hint}{" "}
                      <Link href={held.href} className="text-sky-300 hover:underline">
                        {held.linkText}
                      </Link>
                    </p>
                  );
                })()}
                <div className="mt-1 text-[10px] uppercase tracking-wide opacity-60">
                  notified {f.notified_at} · {f.severity}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {/* inc.15: the ledger is where Rob actually works these items,
                    and until now its only proposal affordance was Resolve —
                    which dismisses the flag AND, by inc.3's dedupe rule (a
                    resolved title counts as existing), stops that domain from
                    ever being proposed again. Resolving was the one click that
                    could silently lose a company. */}
                {proposalDomain(f.title) && (
                  <OrgProposalCreate
                    domain={proposalDomain(f.title) as string}
                    detail={f.detail}
                    onCreated={load}
                  />
                )}
                {noteFor === f.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") resolve(f, note);
                        if (e.key === "Escape") setNoteFor(null);
                      }}
                      placeholder={copy.notePlaceholder}
                      className="w-52 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white outline-none"
                    />
                    <button
                      onClick={() => resolve(f, note)}
                      disabled={busy}
                      className="rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => resolve(f, "")}
                      disabled={busy}
                      title={copy.tooltip}
                      className="rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-400"
                    >
                      {copy.label}
                    </button>
                    <button
                      onClick={() => {
                        setNoteFor(f.id);
                        setNote("");
                      }}
                      className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-white transition hover:bg-white/20"
                    >
                      + note
                    </button>
                  </div>
                )}
                {/* Read BEFORE the click, which is the only moment it helps —
                    and quiet, because a modal on the ledger's most-used button
                    would tax every ordinary finding to warn about this one. */}
                {copy.hint && (
                  <p className="max-w-[19rem] text-right text-[11px] leading-snug text-slate-400">{copy.hint}</p>
                )}
                {/* inc.19: amber when we know nothing changed (retry is safe),
                    red when the request never came back — that one asks for a
                    reload, because a second dismiss is the click that can't be
                    taken back. */}
                {failed?.id === f.id && (
                  <p
                    className={`max-w-[19rem] text-right text-[11px] leading-snug ${
                      failed.certain ? "text-amber-300" : "text-red-300"
                    }`}
                  >
                    {failed.text}
                  </p>
                )}
              </div>
            </div>
          </li>
          );
        })}
      </ul>

      {resolved.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <button
            onClick={() => setShowArchive((s) => !s)}
            className="text-xs text-slate-500 transition hover:text-white"
          >
            {showArchive ? "▾" : "▸"} Resolved ({resolved.length})
          </button>
          {/* inc.44: inc.43's badges only exist once the list is open. The
              header is what gets read before the click, and "Resolved (12)"
              cannot tell twelve domains handled once from three handled four
              times — opposite calls (work the ledger vs change the blocklist).
              Counted off ALL flags, same as the badges. */}
          {archiveRepeatSummary(flags) && (
            <span className="ml-2 text-[10px] text-slate-500">· {archiveRepeatSummary(flags)}</span>
          )}
          {showArchive && (
            <ul className="mt-2 space-y-1.5">
              {resolved.map((f) => {
                // inc.36: the ordinal comes from ALL flags, not just the ones
                // rendered here — the archive list is already filtered, and a
                // count taken off a filtered list would disagree with inc.35's
                // panel count on the same domain.
                const place = archivePlaces.get(f.id);
                const held = heldArchiveNote(f.title, f.resolved_at, place);
                // inc.43: the ordinal is already in the note — as its last
                // clause, in body type. Scanning the archive for the domains
                // he has been round the loop with meant reading every note to
                // the end. Same numbers, at badge weight, beside the title.
                const placeMark = archiveRepeatMark(f.title, place);
                return (
                <li key={f.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">
                    {f.entity_name} — {f.title}
                  </span>
                  {placeMark && (
                    <span className="ml-2 rounded border border-slate-400/30 bg-slate-400/10 px-1.5 py-px text-[10px] font-medium text-slate-300">
                      {placeMark}
                    </span>
                  )}
                  <span className="ml-2 opacity-70">
                    notified {f.notified_at} · resolved {f.resolved_at}
                  </span>
                  {f.resolution_note && <div className="mt-0.5 italic text-slate-500">“{f.resolution_note}”</div>}
                  {/* inc.21: a dismissed proposal is the only archive row whose
                      closure is still doing something — the domain stays shut
                      out. Created rows say so in their own note and get nothing
                      extra. */}
                  {archiveConsequence(f.title, f.resolution_note) && (
                    <div className="mt-0.5 text-slate-500">
                      {archiveConsequence(f.title, f.resolution_note)}
                    </div>
                  )}
                  {/* inc.34: on this ledger "resolved" means "this stops coming
                      back". For a held domain it does not — the sweep raises it
                      again by design (inc.31), and inc.33's panel note points
                      back at this very decision. The row says so itself, so the
                      return next week reads as the design and not as a bug. */}
                  {held && <div className="mt-0.5 text-slate-500">{held}</div>}
                  {/* inc.10: this row is the only one on the ledger Rob did not
                      close himself — a pass closed it and printed "Reopen if this
                      row still matters on its own" in the note above. Until now
                      that sentence was an instruction with no control anywhere on
                      the page. Rows Rob resolved get nothing: an undo button on
                      his own judgement is the opposite mistake. */}
                  {supersededBy(f.resolution_note) !== null && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => reopen(f)}
                        disabled={busy}
                        title={`Put this back on the open list. It stays closed if flag #${supersededBy(
                          f.resolution_note
                        )} still holds the same finding.`}
                        className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
                      >
                        Reopen
                      </button>
                      {failed?.id === f.id && (
                        <p
                          className={`max-w-[24rem] text-[11px] leading-snug ${
                            failed.certain ? "text-amber-300" : "text-red-300"
                          }`}
                        >
                          {failed.text}
                        </p>
                      )}
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

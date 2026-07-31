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
import {
  flagEntityHref,
  flagHasRecordSurface,
  flagNamedScope,
  flagRecordChips,
  linkifyRecordIds,
} from "@/lib/flags/recordLinks";
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
  /** inc.23: resolved server-side — see `withEntityRefs` in app/api/admin/flags/route.ts. */
  entity_ref?: string | null;
  /** inc.25: the title's link target, server-resolved across every record family (incl. deals). */
  entity_href?: string | null;
};

/**
 * The record a row addresses: its minted id, or the record the CRM recorded under its
 * legacy slug. Optional-chained back to `entity_id` so a response served before inc.23
 * (a cached page, a partial rollout) degrades to inc.20's plain text — never to a link
 * pointing somewhere else.
 */
const entityRef = (f: Flag) => f.entity_ref ?? f.entity_id;

/**
 * inc.25: where a row's title links, one answer for every render site and the read gate.
 *
 * Server-resolved (`entity_href`) because a DEAL id can only be confirmed against the deals
 * table, which this client cannot read. Falls back to the pure minted/legacy rule so a
 * response served before inc.25 renders exactly as it did yesterday — never a guessed link.
 */
const titleHref = (f: Flag) => f.entity_href ?? flagEntityHref(entityRef(f));

/**
 * inc.25: `person` fans a query out through org memberships; `entity` does not.
 *
 * A DEAL has no memberships to fan out through, and asking `?person=deal-…` would run a
 * lookup that can only ever come back empty. `?entities=` is the route's exact-match arm,
 * which is what a deal page wants: its own findings, nobody else's.
 */
async function fetchFlags(person?: string, entity?: string): Promise<Flag[] | null> {
  try {
    const url = person
      ? `/api/admin/flags?person=${encodeURIComponent(person)}`
      : entity
        ? `/api/admin/flags?entities=${encodeURIComponent(entity)}`
        : "/api/admin/flags";
    const r = await fetch(url);
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
  entity,
}: {
  mode?: "overview" | "entity";
  person?: string;
  /** inc.25: an exact `entity_id` to match — a deal id, which has no memberships to fan out. */
  entity?: string;
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
    const next = await fetchFlags(person, entity);
    if (next) setFlags(next);
  }, [person, entity]);

  useEffect(() => {
    let cancelled = false;
    fetchFlags(person, entity).then((next) => {
      if (next && !cancelled) setFlags(next);
    });
    return () => {
      cancelled = true;
    };
  }, [person, entity]);

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
              // inc.24: "has a record page" is `entity_ref`, not `entity_id`. A raw
              // `entity_id` is true for `deal-gulf-coast-equity-phase4`, which names a
              // DEAL and reaches nothing — the tooltip would promise a page to stay on
              // that does not exist, and marking read would clear its only surface.
              // inc.25: `deal-gulf-coast-equity-phase4` now HAS a page, and `/deals/[id]`
              // renders this section, so the checkbox's "stays on the record" promise is
              // true for it. Both halves shipped together for exactly that reason.
              // inc.27: a link is no longer the only evidence of a record page. inc.26 put
              // the six NULL-entity rows that NAME minted ids onto those records' pages, so
              // "has no record page, so resolve it here" became false for them — #137 is on
              // /companies/C-2017 today. One predicate for the tooltip and the filter.
              const read = overviewReadControl(
                f.title,
                flagHasRecordSurface(titleHref(f), f.title, f.detail)
              );
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
                  {/* inc.20: linked only when the row addresses an id the CRM minted —
                      a name that is not a link is the honest state, not a lost feature.
                      inc.23: a legacy slug now counts, because `legacy_slug` is a key the
                      CRM wrote down at the renumber, not an inference off the name. */}
                  {titleHref(f) ? (
                    <Link
                      href={titleHref(f) as string}
                      className="font-medium text-slate-200 hover:underline"
                    >
                      {f.entity_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-200">{f.entity_name}</span>
                  )}
                  <span className="text-slate-400"> — {f.title}</span>
                  {/* inc.22: the header names records it could not reach — #137's
                      entity_name is TWO orgs in one string with a null entity_id.
                      These are the ids the row already prints in its detail, made
                      reachable where the row is scanned. No name is resolved. */}
                  {flagRecordChips(entityRef(f), f.detail).map((chip) => (
                    <Link
                      key={chip.id}
                      href={chip.href}
                      className="ml-1.5 rounded border border-white/15 px-1 py-px font-mono text-[10px] text-slate-300 hover:border-white/40 hover:text-white"
                    >
                      {chip.id}
                    </Link>
                  ))}
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
          // inc.29: computed once, above the row, because two things render off it —
          // the marker at the foot (inc.28) and the chips in the header, which must
          // not re-print a link the marker is about to print. On the Overview digest
          // there is no page to be "here", so this is null and chips are untouched.
          const scope =
            mode === "entity" ? flagNamedScope(f.entity_id, f.title, f.detail, person ?? entity) : null;
          // The ids this row already links somewhere else: the page being read (a chip
          // back to the current page is a link to nowhere) and every id the marker
          // renders as a link. Both stay visible — linkified — inside the detail.
          const chipsAlreadyLinked =
            mode === "entity" ? [person ?? entity ?? "", ...(scope?.others ?? [])] : null;
          return (
          <li key={f.id} className={`rounded-lg border px-3 py-2.5 ${sevStyle[f.severity]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {/* inc.20: same rule as the digest above and as the ids inside the
                      detail — an id is unambiguous or it is not a link. */}
                  {titleHref(f) ? (
                    <Link href={titleHref(f) as string} className="hover:underline">
                      {f.entity_name}
                    </Link>
                  ) : (
                    f.entity_name
                  )}
                  <span className="opacity-80"> — {f.title}</span>
                  {/* inc.22: same rule, same source, both render sites — a rule that
                      holds in the digest and not here is how inc.20's bug was born. */}
                  {flagRecordChips(entityRef(f), f.detail, chipsAlreadyLinked).map((chip) => (
                    <Link
                      key={chip.id}
                      href={chip.href}
                      className="ml-1.5 rounded border border-white/25 px-1 py-px font-mono text-[10px] font-normal opacity-80 hover:underline hover:opacity-100"
                    >
                      {chip.id}
                    </Link>
                  ))}
                </div>
                {/* Q84 inc.13: a detail may now be a paragraph AND a list (the meeting-archive
                    finding carries the meetings Rob has to account for). Without pre-line the
                    newlines collapse and 23 rows render as one unreadable ribbon.
                    inc.19: those rows name the ONE record to go confirm — “Omega Title (FL)
                    [C-2019]”, “Dixith Magadiev [P-1010] → C-2006” — and the id was inert text
                    on a page where every other record reference is a link. Only ids the CRM
                    minted become links; a company NAME never does, because its ambiguity is
                    the finding. */}
                <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-slate-300">
                  {linkifyRecordIds(f.detail).map((seg, i) =>
                    seg.href ? (
                      <Link
                        key={i}
                        href={seg.href}
                        className="font-medium text-slate-100 underline decoration-slate-500 underline-offset-2 transition hover:decoration-white"
                      >
                        {seg.text}
                      </Link>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  )}
                </p>
                {/* inc.28: this row may not be THIS record's finding. inc.26 put the
                    NULL-entity rows onto the pages of the records they name, and there
                    they render exactly like the filed ones — #137 is a conflict BETWEEN
                    C-2017 and C-2018, filed against neither, sitting on both pages, and
                    Resolve here clears it from there. Said before the click. Only ids the
                    finding printed are named; `entity_name` is never read. */}
                {mode === "entity" &&
                  (() => {
                    if (!scope) return null;
                    return (
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        <span className="mr-1.5 rounded border border-slate-400/30 bg-slate-400/10 px-1.5 py-px text-[10px] font-medium text-slate-300">
                          not filed here
                        </span>
                        {scope.others.length > 0 ? (
                          <>
                            it names{" "}
                            {scope.others.map((id, i) => (
                              <span key={id}>
                                {i > 0 && ", "}
                                <Link href={flagEntityHref(id) as string} className="text-sky-300 hover:underline">
                                  {id}
                                </Link>
                              </span>
                            ))}{" "}
                            {scope.here ? "as well as this record" : "and appears on each named record"} — one
                            ledger row on every one of those pages, so resolving it here resolves it there too.
                          </>
                        ) : (
                          <>
                            it is filed against no record — it appears here because it names{" "}
                            <span className="font-mono text-slate-300">{scope.named[0]}</span>.
                          </>
                        )}
                      </p>
                    );
                  })()}
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

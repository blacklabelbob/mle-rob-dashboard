// Notes vs enrichment split (Q43 / Master View §3.5 discipline, Rob's evening
// order 2026-07-22: "NOTES section = real human notes that mean something,
// never enrichment dumps").
//
// Pure + deterministic (CR-3): no clock, no network, no fuzziness. The split
// rule mirrors how the data is actually written — human words go on top, and
// enrichment sessions APPEND provenance paragraphs whose first line starts
// with a known machine marker (`ENRICHED 2026-07-17: …`, `Enrichment hunt
// 2026-07-22: …`, `Sources: …`). So: everything before the first marker line
// is human; from the first marker line on, everything is enrichment, split
// into blocks at each subsequent marker line. Nothing is ever dropped —
// composeNotes() reassembles the exact same content (separator-normalized),
// which is what keeps the inline Notes editor from wiping enrichment on save.

export interface SplitNotes {
  /** Rob's own words — what the Notes box shows and edits. */
  human: string;
  /** Machine-appended provenance paragraphs, in stored (chronological) order. */
  enrichment: string[];
}

// A line starts a machine block iff it begins with one of the appenders'
// markers. Explicit list, not vibes — extend it only when a new appender
// pattern actually ships.
//
// `[recycle_candidate …]` (lib/leads/recycle.ts) and `[import: …]`
// (lib/csvMapping.ts) joined the vocabulary on 2026-07-23 (critic-rob Q43
// punch #4): both are machine tags that were being crammed onto the end of
// Rob's human line, where the line-anchored splitter could never see them.
// They now append as their own block via appendMachineNote() below, and the
// lint catches any mid-line stragglers.
const MARKER = /^\s*(enriched\b|enrichment\b|sources:|\[recycle_candidate\b|\[import:)/i;

// The one way a machine appends to a notes field. Always its own block, always
// blank-line separated, so splitNotes() files it under enrichment instead of
// leaving it inside Rob's prose. Callers pass a line that STARTS with a marker
// the vocabulary above recognizes — appendMachineNote is the plumbing, not a
// licence to invent new tag shapes.
export function appendMachineNote(
  notes: string | null | undefined,
  block: string
): string {
  const existing = (notes ?? "").trim();
  const addition = block.trim();
  if (!addition) return existing;
  return existing ? `${existing}\n\n${addition}` : addition;
}

export function isEnrichmentMarker(line: string): boolean {
  return MARKER.test(line);
}

export function splitNotes(raw: string | null | undefined): SplitNotes {
  if (!raw || !raw.trim()) return { human: "", enrichment: [] };

  const lines = raw.split("\n");
  const firstMarker = lines.findIndex((l) => isEnrichmentMarker(l));
  if (firstMarker === -1) return { human: raw.trim(), enrichment: [] };

  const human = lines.slice(0, firstMarker).join("\n").trim();

  // From the first marker on: each marker line opens a new block; non-marker
  // lines (continuations, wrapped text, trailing addenda like ALIAS lines)
  // stay attached to the block they follow.
  const enrichment: string[] = [];
  let current: string[] = [];
  for (const line of lines.slice(firstMarker)) {
    if (isEnrichmentMarker(line) && current.length > 0) {
      const block = current.join("\n").trim();
      if (block) enrichment.push(block);
      current = [];
    }
    current.push(line);
  }
  const last = current.join("\n").trim();
  if (last) enrichment.push(last);

  return { human, enrichment };
}

// Inverse of splitNotes for the save path: human edit + untouched enrichment
// blocks → one stored string. Blank-line separated so a future split yields
// the same blocks back (content-stable round trip).
export function composeNotes(human: string, enrichment: string[]): string {
  const parts = [human.trim(), ...enrichment.map((b) => b.trim())].filter(Boolean);
  return parts.join("\n\n");
}

// Server-side save path (critic-rob Q43 punch #3, 2026-07-23). The Notes box
// shows/edits only the human part, so the enrichment blocks have to be put back
// on save. Doing that in the browser recomposes against what was on SCREEN when
// the tab loaded — so an enrichment paragraph appended server-side afterwards
// (overnight agent runs: exactly Rob's pattern) was silently dropped by the next
// save. The client now sends ONLY the human draft (`notesHuman`) and the API
// route calls this against the row as STORED at save time.
export function applyHumanNotesEdit(
  stored: string | null | undefined,
  humanDraft: string
): string {
  return composeNotes(humanDraft, splitNotes(stored).enrichment);
}

// ── Stored-shape lint (critic-rob Q43 punch #3, 2026-07-23) ─────────────────
// The splitter is line-anchored BY DESIGN (deterministic, CR-3). That means a
// marker written MID-LINE — e.g. `Rob 2026-07-17: … . Sources: Sunbiz …` on one
// line, which is exactly how daniella-roach's row was stored — never splits,
// and the provenance dump renders inside the Notes box: the wall of text Rob
// banned. Vigilance already missed that once, so the guard is code: lintNotes
// reports bad stored shapes so they can be surfaced (Things to Address) and the
// DATA fixed, rather than making the split rule fuzzy.

export interface NoteLint {
  /** Machine-stable issue code. */
  code: "mid-line-marker" | "leading-separator";
  /** 0-based index of the offending line within the human part. */
  line: number;
  /** The marker/text that triggered it, for a human-readable flag. */
  detail: string;
}

// Same marker vocabulary as MARKER, matched anywhere after some leading text.
const MID_LINE_MARKER =
  /\S\s+(ENRICHED\b|Enrichment\b|Sources:|\[recycle_candidate\b|\[import:)/;
// Column/field separators only. `-` and `*` are DELIBERATELY absent: Rob writes
// bullet lists in his notes ("- Replace Boomtown" on gulf-coast is a real human
// line), and a watchdog that flags his own bullets is noise, not a guard.
const LEADING_SEPARATOR = /^\s*[|;,·]+\s*\S/;

export function lintNotes(raw: string | null | undefined): NoteLint[] {
  const { human } = splitNotes(raw);
  if (!human) return [];

  const issues: NoteLint[] = [];
  human.split("\n").forEach((line, i) => {
    const mid = MID_LINE_MARKER.exec(line);
    if (mid) issues.push({ code: "mid-line-marker", line: i, detail: mid[1] });
    const lead = LEADING_SEPARATOR.exec(line);
    if (lead) issues.push({ code: "leading-separator", line: i, detail: line.trim().slice(0, 40) });
  });
  return issues;
}

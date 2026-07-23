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
const MARKER = /^\s*(enriched\b|enrichment\b|sources:)/i;

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

// Q80 increment 1 — the standing rule, as code instead of prose.
//
// THE RULE (Rob, 2026-07-29 night answers §3): no build item may be gated on an
// unread `.md` deliverable.
//
// WHY IT IS CODE AND NOT A PARAGRAPH (CR-3): the rule already existed in spirit —
// preference #9 says "Rob does NOT read markdown deliverables" — and it was still
// broken outright. Two research docs were written as `.md`, marked "awaiting Rob's
// morning read", and held seven build items (Q40–Q46) for a week while the daily
// brief asked him to approve a document he had no way to open. A rule that lives
// only in a rules file is a rule that gets broken again; this one fails a command.
//
// WHAT COUNTS AS THE DEFECT — all three must be true of the SAME queue item:
//   1. the item is still OPEN (`- [ ]`), so the gate is load-bearing right now,
//   2. its text contains a wait-on-Rob-to-read phrase, and
//   3. its text points at a `.md` deliverable — the thing he cannot consume.
// An open item that merely CITES a `.md` is fine (most of them do). A closed item
// carrying historical gate language is fine — it is a record, not a live block.
//
// ESCAPE HATCH: an item may carry `md-gate-audit: exempt — <reason>`. Q80 itself
// needs it, because the item that ABOLISHES the gate has to quote the gate to
// describe it. The reason is required and is echoed in the report, so an exemption
// is a visible decision rather than a silent hole.
//
// Pure: no clock, no filesystem, no network (the script does the reading).

/** A wait-on-Rob-to-read phrase. Matched case-insensitively against item text. */
const GATE_PHRASES: readonly string[] = [
  "awaiting rob's read",
  "awaiting rob's morning read",
  "awaiting his morning read",
  "awaiting his read",
  "awaiting rob's research nod",
  "pending rob's read",
  "once rob reads",
  "until rob reads",
  "master view approved",
  "rep research approved",
];

const EXEMPT_RE = /md-gate-audit:\s*exempt\s*[—–-]\s*(.+?)(?:\)|$)/im;
const MD_PATH_RE = /[\w./-]+\.md\b/g;

export type QueueItem = {
  /** Item label if the text starts with one, e.g. "Q46" — else the first few words. */
  id: string;
  open: boolean;
  /** The `- [ ]` line plus every continuation line beneath it. */
  text: string;
  /** 1-indexed line number of the item's checkbox line. */
  line: number;
};

export type MdGateFinding = {
  id: string;
  line: number;
  /** The gate phrase that matched, lowercased as listed above. */
  phrase: string;
  /** The `.md` deliverables named in the same item. */
  docs: string[];
  /** The sentence the phrase appeared in — quoted in the report, never paraphrased. */
  quote: string;
};

/**
 * Split a BUILD-QUEUE-style markdown document into checkbox items.
 *
 * A new item starts at a non-indented `- [ ]` / `- [x]`. Indented list lines and
 * plain continuation lines belong to the item above them; anything before the first
 * checkbox (headers, preamble) belongs to no item and is dropped.
 */
export function parseQueueItems(markdown: string): QueueItem[] {
  const lines = markdown.split("\n");
  const items: QueueItem[] = [];
  let current: QueueItem | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const head = /^- \[([ xX])\]\s*(.*)$/.exec(line);
    if (head) {
      if (current) items.push(current);
      current = {
        id: labelOf(head[2]),
        open: head[1] === " ",
        text: line,
        line: i + 1,
      };
      continue;
    }
    // A new top-level heading ends the current item; indented lines continue it.
    if (current && /^#{1,6}\s/.test(line)) {
      items.push(current);
      current = null;
      continue;
    }
    if (current) current.text += "\n" + line;
  }
  if (current) items.push(current);
  return items;
}

/** "**Q46. Rep cockpit…" → "Q46"; falls back to the first few words. */
function labelOf(body: string): string {
  const stripped = body.replace(/^[*_`\s]+/, "");
  const q = /^([A-Z]{1,3}\d+[a-z]?)\b/.exec(stripped);
  if (q) return q[1];
  return stripped.replace(/[*_`]/g, "").split(/\s+/).slice(0, 4).join(" ").trim() || "(unlabelled)";
}

/** The sentence containing `index`, so the report can quote rather than summarise. */
function sentenceAround(text: string, index: number): string {
  const start = Math.max(
    text.lastIndexOf(". ", index),
    text.lastIndexOf("\n", index),
    text.lastIndexOf("— ", index),
  );
  let end = text.indexOf(". ", index);
  const nl = text.indexOf("\n", index);
  if (end === -1 || (nl !== -1 && nl < end)) end = nl;
  if (end === -1) end = text.length;
  return text
    .slice(start === -1 ? 0 : start + 1, end)
    .replace(/\s+/g, " ")
    .trim();
}

/** The exemption reason on an item, or null if it carries none. */
export function exemptionReason(itemText: string): string | null {
  const m = EXEMPT_RE.exec(itemText);
  if (!m) return null;
  const reason = m[1].replace(/[*_`]/g, "").trim();
  return reason.length > 0 ? reason : null;
}

/**
 * Every OPEN item gated on an unread `.md`.
 *
 * Ordered by line number so the report reads top-of-queue first — the items
 * blocking the most work are the ones nearest the top.
 */
export function findMdGates(markdown: string): MdGateFinding[] {
  const findings: MdGateFinding[] = [];

  for (const item of parseQueueItems(markdown)) {
    if (!item.open) continue; // a closed item's gate language is history, not a block
    if (exemptionReason(item.text)) continue;

    const haystack = item.text.toLowerCase();
    // Report the FIRST gate as written — an item can carry several, and the one a
    // reader hits first is the one to quote. Ties at the same index go to the
    // longest, so "awaiting rob's morning read" is never reported as the shorter
    // "awaiting rob's read" nested inside it.
    const hit = GATE_PHRASES.map((p) => ({ p, at: haystack.indexOf(p) }))
      .filter((h) => h.at !== -1)
      .sort((a, b) => a.at - b.at || b.p.length - a.p.length)[0];
    if (!hit) continue;
    const phrase = hit.p;

    const docs = [...new Set(item.text.match(MD_PATH_RE) ?? [])];
    if (docs.length === 0) continue; // gated on Rob, but not on a document he can't read

    findings.push({
      id: item.id,
      line: item.line,
      phrase,
      docs,
      quote: sentenceAround(item.text, hit.at),
    });
  }

  return findings.sort((a, b) => a.line - b.line);
}

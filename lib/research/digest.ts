// Q80 half 2 — turning a research `.md` into something Rob can look at.
//
// WHY THIS EXISTS: preference #9 says Rob does not read markdown deliverables, and
// two docs written as `.md` gated seven build items for a week on a read that could
// never happen ("I never saw them"). The fix is not "summarise them for him" — a
// hand-written summary rots the moment the doc changes and, worse, can say something
// the doc doesn't. So the digest is PARSED from the file (CR-3), deterministically,
// and every line on the screen is a line that exists in the source.
//
// THE HARD RULE HERE IS NO INVENTION. A section with no decision line renders as
// "no decision line in this section", never as a paraphrase. The whole reason the
// `.md` failed is that Rob was asked to approve something he couldn't see; a digest
// that quietly editorialises would repeat that failure with extra steps.

export interface DigestSection {
  /** Heading text with its numbering stripped: "Purpose statement — what the Master View is FOR". */
  heading: string;
  /** Label as written in the file ("1", "§2"), so a section is citable back to the doc. */
  label: string | null;
  /** The section's `**Decision: …**` lead, plain text — or null when it has none. */
  decision: string | null;
  /** True when the heading announces questions aimed at Rob. Those sort to the top. */
  asksRob: boolean;
  /**
   * Bold lead of each top-level list item in the section — the doc's own bullets,
   * extracted, never authored. In an asks-Rob section these ARE the questions.
   */
  points: string[];
  /** How many bullets exist beyond the ones kept. Shown, never silently dropped. */
  morePoints: number;
}

/** A card with twenty bullets is a document again. Kept small, overflow declared. */
const MAX_POINTS = 8;

export interface ResearchDigest {
  slug: string;
  /** Repo-relative path of the source doc, so the screen can point at what it parsed. */
  path: string;
  title: string;
  date: string | null;
  status: string | null;
  /** The doc's own lead blockquote ("The one-sentence answer: …"), plain text. */
  lead: string | null;
  sections: DigestSection[];
}

/**
 * Markdown → readable text. Links keep their label and lose their URL, because the
 * digest is a screen, not a document: an inline `https://…` in a card is noise.
 * Deliberately narrow — this runs over headings and single lead lines, not prose.
 */
export function stripInline(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** "## 3. Company record page spec" → { label: "3", heading: "Company record page spec" }. */
function splitHeading(raw: string): { label: string | null; heading: string } {
  const text = stripInline(raw);
  const match = text.match(/^(§?\d+[a-z]?)[.)]?\s+(.*)$/);
  if (match) return { label: match[1], heading: match[2] };
  return { label: null, heading: text };
}

/**
 * A decision lead is a whole line that opens `**Decision…`. Matching the line rather
 * than searching the body matters: several sections quote Rob saying the word
 * "decision" mid-paragraph, and promoting one of those to the headline of a card
 * would put words in his mouth on a screen he is meant to trust.
 */
function decisionFrom(lines: string[]): string | null {
  for (const line of lines) {
    if (!/^\*\*Decision\b/i.test(line.trim())) continue;
    const text = stripInline(line);
    return text.replace(/^Decision[:\s—-]*/i, "").trim() || null;
  }
  return null;
}

/**
 * `1. **Queue contract:** should the Today band…` → "Queue contract".
 *
 * Top-level only: an indented sub-bullet is detail under a point Rob has already
 * read, and hoisting it to the same rank would flatten the doc's own emphasis.
 */
function pointsFrom(lines: string[], asksRob: boolean): string[] {
  const points: string[] = [];
  const add = (text: string) => {
    const clean = stripInline(text).replace(/[:.]$/, "");
    // A bare "1" is a table's row number, not a point worth a line on a card.
    if (clean.length < 3 || /^\d+$/.test(clean)) return;
    if (!points.includes(clean)) points.push(clean);
  };

  lines.forEach((line, i) => {
    // A questions-for-Rob section counts NUMBERED questions only. Both docs write
    // a live question as "1. **Thing:** …" and use a table for the resolution log
    // (master §9's OQ-1..5 are all answered, above the table rather than in it —
    // per-row matching missed that). Counting the log would tell Rob he owes work
    // he already did, and a badge that cries wolf gets ignored, exactly like the
    // "reply master view approved" nag this item exists to kill.
    if (asksRob) {
      const numbered = line.match(/^\d+[.)]\s+\*\*(.+?)[:.]?\*\*/);
      if (numbered && !/\bRESOLVED\b|✅/i.test(line)) add(numbered[1]);
      return;
    }
    const bullet = line.match(/^(?:\d+[.)]|[-*])\s+\*\*(.+?)[:.]?\*\*/);
    if (bullet) {
      add(bullet[1]);
      return;
    }
    // A bold paragraph lead — how the rep doc writes its findings ("8:45am — one
    // tab, one queue.", "What /rep already nails"). Same authored emphasis as a
    // bullet, different punctuation; ignoring it left three sections blank.
    const lead = line.match(/^\*\*(.+?)[:.]?\*\*/);
    if (lead && !/^\*\*Decision\b/i.test(line)) {
      add(lead[1]);
      return;
    }
    // Table rows: first column only, header and rule skipped. §4 of the rep doc
    // ("What we deliberately DON'T build") is a table and nothing else.
    if (line.startsWith("|") && !/^\|[\s:|-]+\|?\s*$/.test(line)) {
      const isHeader = /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "");
      if (isHeader) return;
      const cell = line.split("|")[1];
      if (cell) add(cell);
    }
  });
  return points;
}

/** The doc's lead blockquote: the first `>` block, joined. Nothing else qualifies. */
function leadFrom(lines: string[]): string | null {
  const block: string[] = [];
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    if (line.startsWith(">")) {
      block.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (block.length > 0) break;
  }
  const text = stripInline(block.join(" "));
  return text ? text.replace(/^(How to read this|The one-sentence answer)[:\s—-]*/i, "").trim() : null;
}

/** `**Date:** 2026-07-22 · **Status:** DRAFT rev 4 …` — read the labels, don't guess order. */
function metaFrom(lines: string[], key: string): string | null {
  for (const line of lines) {
    if (!line.startsWith("**")) continue;
    const match = line.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*([^·]+)`, "i"));
    if (match) {
      const value = stripInline(match[1]);
      if (value) return value;
    }
  }
  return null;
}

/**
 * Parse one research doc. `path` is carried through verbatim so the rendered card
 * can name the file it came from — the digest replaces reading the doc, it does not
 * replace the doc, and a reader who wants the evidence must be able to find it.
 */
export function parseDigest(markdown: string, meta: { slug: string; path: string }): ResearchDigest {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const sections: DigestSection[] = [];

  let current: { label: string | null; heading: string; body: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const asksRob = /open question/i.test(current.heading);
    const points = pointsFrom(current.body, asksRob);
    sections.push({
      heading: current.heading,
      label: current.label,
      decision: decisionFrom(current.body),
      asksRob,
      points: points.slice(0, MAX_POINTS),
      morePoints: Math.max(0, points.length - MAX_POINTS),
    });
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      current = { ...splitHeading(line.slice(3)), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();

  return {
    slug: meta.slug,
    path: meta.path,
    title: titleLine ? stripInline(titleLine.slice(2)) : meta.slug,
    date: metaFrom(lines, "Date"),
    status: metaFrom(lines, "Status"),
    lead: leadFrom(lines),
    sections,
  };
}

/** Questions aimed at Rob first — they are the only rows he can act on. */
export function rankSections(sections: DigestSection[]): DigestSection[] {
  return [...sections].sort((a, b) => Number(b.asksRob) - Number(a.asksRob));
}

/**
 * Every question the two docs put to Rob, for the badge on the /ops link. Only
 * asks-Rob sections count: the badge exists to say "there is something here for
 * you", and inflating it with ordinary bullets would train him to ignore it.
 */
export function askCount(digests: ResearchDigest[]): number {
  return digests.reduce(
    (total, doc) =>
      total +
      doc.sections.reduce((n, s) => n + (s.asksRob ? s.points.length + s.morePoints : 0), 0),
    0,
  );
}

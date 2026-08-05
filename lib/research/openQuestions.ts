/**
 * Open questions in research docs go stale, and a stale question reads exactly like
 * a finding. This module makes that mechanical instead of hoping somebody notices.
 *
 * WHY IT EXISTS (INCIDENT-LEDGER #38). On 2026-07-08 a dossier recorded:
 *
 *     "Gary↔Miga tie is publicly UNVERIFIED — dashed edge; ask Rob its nature."
 *
 * Nobody asked. For 28 days that line sat there, and every reader — including two
 * research docs written on 2026-08-05 — treated "publicly unverified" as a finding
 * about the world rather than a note that a question was outstanding. When Rob was
 * finally asked he said *"Im 100% sure about Garys ownership involvement in Miga"*.
 * He had said so originally; the research had "corrected" him against a LinkedIn title.
 *
 * The three prior instances of this shape (#22, #34, #35) were each answered with a
 * RULE, and each rule was scoped to the specific surface that had just failed —
 * meeting records, then web research. The shape kept walking into the next surface.
 * Rules are prose, and prose is what this ledger says is not a fix.
 *
 * So the gate is not "check harder". It is: an unanswered question about something
 * ROB KNOWS has an age, and past a threshold it fails the build.
 *
 * Pure (CR-3): no clock, no fs, no network. `today` is a parameter.
 */

/**
 * A question DIRECTED AT ROB that nobody has answered.
 *
 * SCOPE IS DELIBERATELY NARROW, and the first draft got this wrong. Matching bare
 * "unverified"/"unconfirmed" flagged 29 lines on the first real run — most of them
 * `[UNVERIFIED]` cells in sourcing tables, which are *correct* notation: an honest
 * gap in public evidence, exactly what research is supposed to write down. A gate
 * that fires on good behaviour gets switched off, and then it protects nothing.
 *
 * The incident was never about unsourced facts. It was about a question ADDRESSED
 * TO ROB — the one person who could answer it — going unasked for 28 days while
 * everyone downstream read it as a finding. So: Rob has to be named.
 */
const OPEN_MARKERS = [
  /\bask (?:rob|him)\b/i,
  /\bneeds? rob(?:'s)?\b/i,
  /\brob (?:to )?(?:confirm|decide|answer|rule)/i,
  /\bconfirm w\/? rob\b/i,
  /\[CONFIRM WITH ROB\]/i,
  /\brob'?s? (?:call|confirmation|decision|answer)\b/i,
  // "UNRESOLVED" only counts when Rob is named on the same line — the convention
  // this repo already uses is "UNRESOLVED, ask Rob".
  /\bunresolved\b[^.]{0,80}\brob\b/i,
  /\brob\b[^.]{0,80}\bunresolved\b/i,
];

/**
 * A phrase that says the question was CLOSED. Deliberately narrow: it has to name
 * an answer, not merely mention Rob. "ask Rob" plus "Rob confirmed" in the same
 * paragraph is a closed question; "ask Rob" alone is not.
 */
const CLOSED_MARKERS = [
  /\brob (?:confirmed|says|said|ruled|answered|settled)\b/i,
  /\bconfirmed by rob\b/i,
  /\bresolved\b/i,
  /\bdo not re-?flag\b/i,
  /\banswered\b/i,
];

const ISO = /\b(\d{4}-\d{2}-\d{2})\b/;

export interface OpenQuestion {
  file: string;
  line: number;
  text: string;
  /** The date the question was raised, taken from the line, else the doc's date. */
  raisedOn: string | null;
  ageDays: number | null;
}

export interface StaleVerdict {
  open: OpenQuestion[];
  stale: OpenQuestion[];
  /** Questions with no date anywhere — undateable, therefore un-ageable. */
  undated: OpenQuestion[];
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Scan one document. `docDate` is the fallback when a question line carries no date
 * of its own — usually parsed from the filename or a front-matter date by the caller.
 */
export function scanDoc(
  file: string,
  contents: string,
  today: string,
  docDate: string | null = null,
): OpenQuestion[] {
  const out: OpenQuestion[] = [];
  const lines = contents.split("\n");

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("<!--")) return;
    if (!OPEN_MARKERS.some((re) => re.test(line))) return;

    // A question closed on the same line is not open. This is what lets a doc say
    // "was unverified — Rob confirmed 2026-08-05" without tripping the gate forever.
    if (CLOSED_MARKERS.some((re) => re.test(line))) return;

    // A line's own date wins — but ONLY if it is not older than the document.
    // A question cannot have been raised before the doc that contains it, and lines
    // routinely carry unrelated dates (a licence issued 2023-01-11, a founding year).
    // Taking those literally aged one question to 1302 days and made the report absurd.
    const own = line.match(ISO)?.[1] ?? null;
    const ownIsPlausible = own !== null && (docDate === null || own >= docDate);
    const raisedOn = ownIsPlausible ? own : (docDate ?? own);
    out.push({
      file,
      line: i + 1,
      text: line.length > 160 ? `${line.slice(0, 160)}…` : line,
      raisedOn,
      ageDays: raisedOn ? daysBetween(raisedOn, today) : null,
    });
  });

  return out;
}

/**
 * Partition open questions by age. Default threshold is 14 days: long enough that a
 * question raised in one working week survives the next, short enough that the Gary
 * question (28 days) would have failed twice over.
 */
export function classify(questions: OpenQuestion[], maxAgeDays = 14): StaleVerdict {
  const undated = questions.filter((q) => q.ageDays === null);
  const dated = questions.filter((q) => q.ageDays !== null);
  return {
    open: dated.filter((q) => (q.ageDays as number) <= maxAgeDays),
    stale: dated.filter((q) => (q.ageDays as number) > maxAgeDays),
    undated,
  };
}

/** Human-readable report. Never a bare count — the lines are the point. */
export function render(v: StaleVerdict, maxAgeDays = 14): string {
  const L: string[] = [];
  if (v.stale.length) {
    L.push(`${v.stale.length} question(s) about something Rob knows have gone unasked for more than ${maxAgeDays} days.`);
    L.push("A question nobody asked reads like a finding. Ask him, then record the answer on the line.");
    for (const q of v.stale) L.push(`  ✗ ${q.file}:${q.line}  [${q.ageDays}d]  ${q.text}`);
  }
  if (v.undated.length) {
    L.push(`${v.undated.length} open question(s) carry no date, so nobody can tell if they are stale:`);
    for (const q of v.undated) L.push(`  ? ${q.file}:${q.line}  ${q.text}`);
  }
  if (!L.length) L.push(`ok — ${v.open.length} open question(s), none older than ${maxAgeDays} days.`);
  return L.join("\n");
}

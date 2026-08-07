// Q47 signature placement — Rob 2026-08-07: "On the Agreement itself it doesnt
// fill in my Signature or the Date."
//
// The original build deliberately refused to overlay ink on the source pages,
// because @cantoo/pdf-lib has no text extraction and ink at GUESSED coordinates
// can cover legal text. That reasoning was sound; the conclusion was too broad.
// pdf.js (already present via react-pdf) gives us real text positions, so we can
// place the signature on the ACTUAL "Signature: ____" line instead of guessing.
//
// This module is pure — it takes already-extracted text items and returns
// coordinates. No PDF library, no I/O, no clock (CR-3). Extraction lives in
// pdfText.ts; stamping lives in stamp.ts / countersignPdf.ts.
//
// SAFETY PROPERTY THAT MUST NOT BE LOST: when the anchors are not found (an
// uploaded PDF with a different layout, a scan, a rebuilt template), every
// caller falls back to certificate-only stamping — i.e. exactly the old
// behaviour. Nothing is ever drawn at a coordinate we did not read off the page.

export interface TextItem {
  str: string;
  x: number; // PDF user-space, origin bottom-left
  y: number; // text baseline
  width: number;
}

export interface PageText {
  pageIndex: number; // 0-based
  width: number;
  height: number;
  items: TextItem[];
}

export interface SignatureAnchor {
  pageIndex: number;
  /** Baseline + left edge of the "Signature: ______" run. */
  sigX: number;
  sigY: number;
  sigWidth: number;
  /** The run's own text, so the drawer can split label from rule by WIDTH RATIO
   *  rather than assuming a font size (see labelWidth in inkOnLine.ts). */
  sigText: string;
  /** Baseline + left edge of the "Date: ______" run on the same line. */
  dateX: number | null;
  dateY: number | null;
  dateWidth: number;
  dateText: string;
}

export interface SignatureAnchors {
  /** The counterparty's block — where the SIGNER's signature belongs. */
  client?: SignatureAnchor;
  /** MLE's block — where the COUNTERSIGNATURE belongs. */
  provider?: SignatureAnchor;
}

const SIG_RE = /^signature\s*:/i;
const DATE_RE = /^date\s*:/i;
// Same-line tolerance: baselines are identical when ReportLab lays a row out,
// but allow a hair for other producers.
const SAME_LINE_EPS = 2.5;

function isHeading(str: string, word: "provider" | "client"): boolean {
  const s = str.trim().toLowerCase();
  // "PROVIDER — My Local Everything, LLC" / "CLIENT". Anchored so a mid-sentence
  // mention of the defined term ("...referred to as the Client") can't match.
  if (word === "provider") return s.startsWith("provider —") || s.startsWith("provider -") || s === "provider";
  return s === "client" || s.startsWith("client —") || s.startsWith("client -");
}

/** The nearest "Signature:" run BELOW a heading, plus its same-line "Date:". */
function anchorBelow(page: PageText, headingY: number): SignatureAnchor | undefined {
  let best: TextItem | undefined;
  for (const it of page.items) {
    if (it.y >= headingY) continue; // above or on the heading — not ours
    if (!SIG_RE.test(it.str.trim())) continue;
    if (!best || it.y > best.y) best = it; // highest y below the heading = nearest
  }
  if (!best) return undefined;
  const date = page.items.find(
    (it) => DATE_RE.test(it.str.trim()) && Math.abs(it.y - best!.y) <= SAME_LINE_EPS
  );
  return {
    pageIndex: page.pageIndex,
    sigX: best.x,
    sigY: best.y,
    sigWidth: best.width,
    sigText: best.str,
    dateX: date ? date.x : null,
    dateY: date ? date.y : null,
    dateWidth: date ? date.width : 0,
    dateText: date ? date.str : "",
  };
}

/**
 * Locate the two signature blocks. Searched from the LAST page backwards
 * because the execution block lives at the end; the first page carrying a
 * PROVIDER/CLIENT heading wins, so a mid-document mention cannot hijack it.
 */
export function findSignatureAnchors(pages: PageText[]): SignatureAnchors {
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i];
    const provHeading = page.items.find((it) => isHeading(it.str, "provider"));
    const cliHeading = page.items.find((it) => isHeading(it.str, "client"));
    if (!provHeading && !cliHeading) continue;
    const out: SignatureAnchors = {};
    if (provHeading) out.provider = anchorBelow(page, provHeading.y);
    if (cliHeading) out.client = anchorBelow(page, cliHeading.y);
    // A page with headings but no signature runs is not the execution page.
    if (out.provider || out.client) return out;
  }
  return {};
}

/**
 * The leading label of a run like `Signature: ______` — everything before the
 * rule. Returned as a FRACTION of the run's width, which is font-size-agnostic:
 * the caller multiplies by the measured run width, so a template rendered at a
 * different point size still lands correctly.
 */
export function labelFraction(runText: string, measure: (s: string) => number): number {
  const label = runText.match(/^[^_]*/)?.[0] ?? "";
  const whole = measure(runText);
  if (!label || whole <= 0) return 0;
  return Math.min(1, measure(label) / whole);
}

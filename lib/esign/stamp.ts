import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { ESIGN_CONSENT_TEXT } from "./consent";
import { drawInkOnLine, formatSignatureDate } from "./inkOnLine";
import type { SignatureAnchors } from "./signatureAnchors";
import { formatEventChain } from "./events";

// Q47 e-sign: server-side stamping via @cantoo/pdf-lib (MIT, the scout's
// pick). Takes the ORIGINAL uploaded bytes and returns the signed PDF:
// original pages untouched + an appended SIGNATURE & AUDIT CERTIFICATE page
// carrying the signature (drawn image or typed name), printed name,
// server-stamped UTC date, consent language + instant, both sha256 digests,
// signer IP/user-agent, and the full event chain — "the page that wins the
// court fight" (walkthrough step 6).
//
// AMENDED 2026-08-07 (Rob: "it doesnt fill in my Signature or the Date").
// The original rule was "never overlay ink on the source pages", because
// pdf-lib has no text extraction and GUESSED coordinates can cover legal text.
// That reasoning stands — the conclusion was too broad. pdf.js gives us real
// text positions (pdfText.ts -> signatureAnchors.ts), so ink now goes on the
// agreement's ACTUAL "Signature: ____" rule, never on a guess. When the anchors
// are not found, the old certificate-only behaviour is used unchanged.
// The certificate page remains the evidentiary record either way.
// Pure function: all timestamps/meta passed in.

export interface StampArgs {
  originalPdf: Uint8Array;
  documentTitle: string;
  documentId: string;
  version: number;
  phase: string;
  signerName: string;
  signerEmail: string;
  signatureDataUrl?: string; // PNG data URL from signature_pad
  typedName?: string; // typed-signature mode
  signedAtIso: string; // server-stamped, never self-reported
  consentAtIso: string;
  signerIp: string;
  signerUserAgent: string;
  sha256AtUpload: string;
  sha256AtSign: string;
  events: { type: string; at: string; ip: string | null }[];
  // Located signature lines on the source pages (pdfText + signatureAnchors).
  // Optional by design: when absent, stamping behaves exactly as it did before
  // in-place signatures existed — certificate page only.
  anchors?: SignatureAnchors;
  // Consumer (§7001(c)) extras — ESIGN-CONSUMER-DISCLOSURE-SPEC §3.4: the
  // certificate reproduces the FULL disclosure text + version the consumer
  // saw, and the demonstrable-access evidence line.
  consumer?: {
    disclosureText: string;
    disclosureVersion: string;
    pdfRenderedAt: string;
    disclosureShownAt: string;
  };
  // PEWC comms opt-in (optional; recorded when granted at signing).
  commsConsent?: { phone: string; languageVersion: string; text: string };
}

const INK = rgb(0.1, 0.12, 0.16);
const GRAY = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.043, 0.325, 0.58);
const MARGIN = 54;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) line = probe;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function stampAndCertify(args: StampArgs): Promise<Uint8Array> {
  if (!args.signatureDataUrl && !args.typedName) {
    throw new Error("esign stamp: need signatureDataUrl or typedName");
  }
  const doc = await PDFDocument.load(args.originalPdf);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const mono = await doc.embedFont(StandardFonts.Courier);

  // Fill the agreement's OWN client signature line when we could locate it
  // (Rob 2026-08-07 — a blank "Signature: ____" does not read as executed).
  // Absent anchors, this is a no-op and the certificate carries it alone.
  if (args.anchors?.client) {
    await drawInkOnLine({
      doc,
      anchor: args.anchors.client,
      signatureDataUrl: args.signatureDataUrl,
      typedName: args.typedName,
      dateText: formatSignatureDate(args.signedAtIso),
      helvetica: helv,
      italic,
    });
  }

  const page = doc.addPage([612, 792]); // letter
  const width = 612 - MARGIN * 2;
  let y = 792 - 64;

  const text = (
    s: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}
  ) => {
    const { font = helv, size = 10, color = INK, gap = 4 } = opts;
    for (const line of wrapText(s, font, size, width)) {
      ensureRoom(size + gap);
      page2().drawText(line, { x: MARGIN, y, size, font, color });
      y -= size + gap;
    }
  };

  // Certificate may overflow one page for long event chains — roll to a
  // continuation page instead of drawing off the bottom edge.
  let current: PDFPage = page;
  const page2 = () => current;
  const ensureRoom = (needed: number) => {
    if (y - needed < MARGIN) {
      current = doc.addPage([612, 792]);
      y = 792 - 64;
    }
  };

  page.drawText("SIGNATURE & AUDIT CERTIFICATE", {
    x: MARGIN,
    y,
    size: 16,
    font: helvBold,
    color: ACCENT,
  });
  y -= 26;
  text(`${args.documentTitle} — v${args.version} (${args.phase})`, {
    font: helvBold,
    size: 11,
    gap: 2,
  });
  text(`Document ID: ${args.documentId}`, { font: mono, size: 8.5, color: GRAY, gap: 16 });

  // --- signature block ---
  if (args.signatureDataUrl) {
    const base64 = args.signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("esign stamp: bad signature data url");
    const png = await doc.embedPng(Buffer.from(base64, "base64"));
    const dims = png.scaleToFit(220, 70);
    ensureRoom(dims.height + 10);
    page2().drawImage(png, { x: MARGIN, y: y - dims.height, ...dims });
    y -= dims.height + 8;
  } else {
    ensureRoom(34);
    page2().drawText(args.typedName!, { x: MARGIN, y: y - 24, size: 24, font: italic, color: INK });
    y -= 34;
  }
  ensureRoom(1);
  page2().drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 240, y },
    thickness: 0.7,
    color: GRAY,
  });
  y -= 14;
  text(`Signed by: ${args.signerName}  <${args.signerEmail}>`, { font: helvBold, size: 10.5, gap: 3 });
  text(`Date signed (UTC, server-stamped): ${args.signedAtIso}`, { size: 10, gap: 3 });
  text(
    `Signature method: ${args.signatureDataUrl ? "drawn (signature_pad)" : "typed name"}`,
    { size: 9.5, color: GRAY, gap: 14 }
  );

  // --- consent ---
  text("Electronic-signature consent (accepted before signing):", {
    font: helvBold,
    size: 9.5,
    gap: 4,
  });
  text(`"${ESIGN_CONSENT_TEXT}"`, { size: 8.5, color: GRAY, gap: 3 });
  text(`Consent recorded (UTC): ${args.consentAtIso}`, { size: 9, gap: 14 });

  // --- integrity ---
  text("Document integrity (SHA-256):", { font: helvBold, size: 9.5, gap: 4 });
  text(`at upload:  ${args.sha256AtUpload}`, { font: mono, size: 7.6, gap: 3 });
  text(`at signing: ${args.sha256AtSign}`, { font: mono, size: 7.6, gap: 3 });
  text(
    args.sha256AtUpload === args.sha256AtSign
      ? "Digests match — the document signed is byte-identical to the document sent."
      : "DIGEST MISMATCH — do not rely on this record.",
    { size: 8.5, color: GRAY, gap: 14 }
  );

  // --- signer context ---
  text("Signer context:", { font: helvBold, size: 9.5, gap: 4 });
  text(`IP address: ${args.signerIp}`, { size: 9, gap: 3 });
  text(`User agent: ${args.signerUserAgent}`, { size: 8, color: GRAY, gap: 14 });

  // --- consumer §7001(c) extras (spec §3.4) ---
  if (args.consumer) {
    text(`Signer type: consumer — §7001(c) disclosure flow (version ${args.consumer.disclosureVersion})`, {
      font: helvBold,
      size: 9.5,
      gap: 4,
    });
    text(
      `Consumer consented electronically after the agreement PDF rendered in their browser session ` +
        `(disclosure shown ${args.consumer.disclosureShownAt}, PDF rendered ${args.consumer.pdfRenderedAt}, ` +
        `consented ${args.consentAtIso}, ${args.signerUserAgent}) — 15 U.S.C. §7001(c)(1)(C)(ii).`,
      { size: 8, color: GRAY, gap: 6 }
    );
    text("Disclosure shown to the consumer (reproduced in full):", { size: 8.5, gap: 4 });
    for (const para of args.consumer.disclosureText.split("\n\n")) {
      text(para, { size: 7.5, color: GRAY, gap: 4 });
    }
    y -= 8;
  }

  // --- comms opt-in (PEWC), when granted at signing ---
  if (args.commsConsent) {
    text("Communications opt-in (optional; not a condition of signing):", {
      font: helvBold,
      size: 9.5,
      gap: 4,
    });
    text(
      `Granted for number ${args.commsConsent.phone} at ${args.consentAtIso} ` +
        `(language version ${args.commsConsent.languageVersion}): "${args.commsConsent.text}"`,
      { size: 7.5, color: GRAY, gap: 12 }
    );
  }

  // --- event chain ---
  text("Audit event chain (append-only record, UTC):", { font: helvBold, size: 9.5, gap: 5 });
  for (const line of formatEventChain(args.events)) {
    text(line, { font: mono, size: 7.6, gap: 2.5 });
  }
  y -= 10;
  text(
    "Retained by My Local Everything, LLC. Full append-only audit trail, document digests, and delivery records are preserved with this agreement (ESIGN, 15 U.S.C. §7001; UETA).",
    { size: 7.5, color: GRAY }
  );

  return doc.save();
}

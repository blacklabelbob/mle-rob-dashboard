// Q47 signature placement — draws a signature and date ONTO the agreement's own
// "Signature: ____ / Date: ____" rule, at coordinates read off the page by
// pdfText.ts + signatureAnchors.ts. Shared by the signer path (stamp.ts) and the
// countersign path (countersignPdf.ts) so both blocks are filled the same way.
//
// The certificate page remains the evidentiary record — this is the human-
// legible half that makes the executed PDF read like a signed contract. Neither
// replaces the other.

import { PDFDocument, PDFFont, rgb } from "@cantoo/pdf-lib";
import { labelFraction, type SignatureAnchor } from "./signatureAnchors";

const INK = rgb(0.06, 0.09, 0.16);

export interface InkArgs {
  doc: PDFDocument;
  anchor: SignatureAnchor;
  /** PNG data URL from signature_pad, when the signer drew. */
  signatureDataUrl?: string;
  /** Typed-signature fallback (also used for countersignature). */
  typedName?: string;
  /** Already-formatted date string, e.g. "August 7, 2026". */
  dateText: string;
  helvetica: PDFFont;
  italic: PDFFont;
}

/**
 * Returns true when ink was actually placed. Never throws: a failure here must
 * not cost a signature — the certificate page still carries the evidence, so
 * callers treat `false` as "cosmetic step skipped" and continue.
 */
export async function drawInkOnLine(args: InkArgs): Promise<boolean> {
  try {
    const { doc, anchor, helvetica, italic } = args;
    const pages = doc.getPages();
    const page = pages[anchor.pageIndex];
    if (!page) return false;

    // Split "Signature: " from its rule by width ratio (font-size agnostic).
    const sigLabelW =
      anchor.sigWidth * labelFraction(anchor.sigText, (s) => helvetica.widthOfTextAtSize(s, 10));
    const ruleW = Math.max(0, anchor.sigWidth - sigLabelW);
    if (ruleW < 20) return false; // nowhere sensible to put it

    const x = anchor.sigX + sigLabelW + 3;
    const maxW = ruleW - 6;
    const maxH = 26; // stays clear of the line above

    if (args.signatureDataUrl) {
      const base64 = args.signatureDataUrl.replace(/^data:image\/png;base64,/, "");
      if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return false;
      const png = await doc.embedPng(Buffer.from(base64, "base64"));
      const dims = png.scaleToFit(maxW, maxH);
      // Sit ON the rule: bottom edge ~2pt above the baseline.
      page.drawImage(png, { x, y: anchor.sigY + 2, width: dims.width, height: dims.height });
    } else if (args.typedName) {
      let size = 15;
      while (size > 7 && italic.widthOfTextAtSize(args.typedName, size) > maxW) size -= 0.5;
      page.drawText(args.typedName, { x, y: anchor.sigY + 3, size, font: italic, color: INK });
    } else {
      return false;
    }

    // Date, on the same rule.
    if (anchor.dateX !== null && anchor.dateY !== null && anchor.dateText) {
      const dateLabelW =
        anchor.dateWidth * labelFraction(anchor.dateText, (s) => helvetica.widthOfTextAtSize(s, 10));
      const dMaxW = Math.max(0, anchor.dateWidth - dateLabelW - 6);
      let dSize = 10;
      while (dSize > 6 && helvetica.widthOfTextAtSize(args.dateText, dSize) > dMaxW) dSize -= 0.5;
      page.drawText(args.dateText, {
        x: anchor.dateX + dateLabelW + 3,
        y: anchor.dateY + 3,
        size: dSize,
        font: helvetica,
        color: INK,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** "August 7, 2026" from an ISO instant, in UTC (server-stamped, like the cert). */
export function formatSignatureDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

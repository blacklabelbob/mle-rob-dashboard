import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { drawInkOnLine, formatSignatureDate } from "./inkOnLine";
import type { SignatureAnchors } from "./signatureAnchors";

// Q47 countersign (inc.2): the MLE-side second signature, appended to the
// signer's already-stamped PDF. AMENDED 2026-08-07 in lockstep with stamp.ts:
// the countersignature is now also drawn on the agreement's own PROVIDER
// "Signature: ____ / Date: ____" rule when that line can be located by real
// text position, so the executed PDF reads as signed by BOTH parties on the
// paper itself. The dedicated page remains, so the record is still:
//   [original] + [SIGNATURE & AUDIT CERTIFICATE] + [COUNTERSIGNATURE].
// Pure in the same sense as stamp.ts: bytes + facts in, bytes out, no clock,
// no network, no DB. The `signed` status is untouched by design (0010 header).

export interface CountersignStampArgs {
  signedPdf: Uint8Array; // the signer-stamped copy at documents.signed_path
  documentTitle: string;
  documentId: string;
  version: number;
  signerName: string; // the counterparty, for the "both parties" block
  signedAtIso: string;
  countersignerName: string;
  countersignerTitle: string;
  countersignerEmail: string | null;
  countersignedAtIso: string; // server-stamped, never self-reported
  sha256Signed: string; // digest of the bytes being countersigned
  // PROVIDER-side signature line located on the source pages. Optional: absent
  // anchors fall back to the countersignature page alone (pre-2026-08-07).
  anchors?: SignatureAnchors;
}

const INK = rgb(0.1, 0.12, 0.16);
const GRAY = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.043, 0.325, 0.58);
const MARGIN = 54;

export async function stampCountersignature(args: CountersignStampArgs): Promise<Uint8Array> {
  const name = args.countersignerName.trim();
  const title = args.countersignerTitle.trim();
  if (!name) throw new Error("esign countersign stamp: printed name required");
  if (!title) throw new Error("esign countersign stamp: signer title/authority required");
  if (Number.isNaN(Date.parse(args.countersignedAtIso))) {
    throw new Error(`esign countersign stamp: bad timestamp ${args.countersignedAtIso}`);
  }

  const doc = await PDFDocument.load(args.signedPdf);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const mono = await doc.embedFont(StandardFonts.Courier);

  // Ink on the agreement's own PROVIDER line (Rob 2026-08-07). Typed name is
  // used for the countersignature — the CRM form captures name + title, not a
  // drawn mark.
  if (args.anchors?.provider) {
    await drawInkOnLine({
      doc,
      anchor: args.anchors.provider,
      typedName: name,
      dateText: formatSignatureDate(args.countersignedAtIso),
      helvetica: helv,
      italic,
    });
  }

  const page = doc.addPage([612, 792]); // letter, matching the certificate page
  let y = 792 - 64;
  const line = (
    s: string,
    opts: { font?: typeof helv; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}
  ) => {
    const { font = helv, size = 10, color = INK, gap = 4 } = opts;
    page.drawText(s, { x: MARGIN, y, size, font, color });
    y -= size + gap;
  };

  page.drawText("COUNTERSIGNATURE", { x: MARGIN, y, size: 16, font: helvBold, color: ACCENT });
  y -= 26;
  line(`${args.documentTitle} — v${args.version}`, { font: helvBold, size: 11, gap: 2 });
  line(`Document ID: ${args.documentId}`, { font: mono, size: 8.5, color: GRAY, gap: 18 });

  page.drawText(name, { x: MARGIN, y: y - 24, size: 24, font: italic, color: INK });
  y -= 34;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 240, y },
    thickness: 0.7,
    color: GRAY,
  });
  y -= 14;
  line(`Countersigned for My Local Everything, LLC by: ${name}`, {
    font: helvBold,
    size: 10.5,
    gap: 3,
  });
  line(`Title / authority: ${title}`, { size: 10, gap: 3 });
  if (args.countersignerEmail) line(`Email: ${args.countersignerEmail}`, { size: 10, gap: 3 });
  line(`Date countersigned (UTC, server-stamped): ${args.countersignedAtIso}`, { size: 10, gap: 16 });

  line("Counterparty signature (already executed, unaltered by this page):", {
    font: helvBold,
    size: 9.5,
    gap: 4,
  });
  line(`${args.signerName} — signed ${args.signedAtIso}`, { size: 9.5, gap: 16 });

  line("Integrity of the countersigned copy (SHA-256):", { font: helvBold, size: 9.5, gap: 4 });
  line(`signed copy countersigned here: ${args.sha256Signed}`, {
    font: mono,
    size: 7.6,
    color: GRAY,
    gap: 16,
  });

  line(
    "This page is appended to the signed copy; no page above it was modified. The digest",
    { size: 7.5, color: GRAY, gap: 2 }
  );
  line(
    "above is of the exact bytes countersigned. Retained by My Local Everything, LLC (ESIGN,",
    { size: 7.5, color: GRAY, gap: 2 }
  );
  line("15 U.S.C. §7001; UETA).", { size: 7.5, color: GRAY });

  return doc.save();
}

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { findSignatureAnchors, labelFraction, type PageText } from "../signatureAnchors";
import { extractPageText } from "../pdfText";
import { drawInkOnLine, formatSignatureDate } from "../inkOnLine";

// The real execution page of a generated Phase I agreement, as pdf.js reports
// it (probed 2026-08-07 from "Phase 1 Agreement - Omega Title Florida v1.pdf").
const EXEC_PAGE: PageText = {
  pageIndex: 3,
  width: 612,
  height: 792,
  items: [
    { str: "Agreed and accepted by the Parties as of the Effective Date:", x: 78, y: 343.1, width: 281.3 },
    { str: "PROVIDER — My Local Everything, LLC", x: 78, y: 308.6, width: 199.5 },
    { str: "Signature: ______________________________", x: 78, y: 274.6, width: 225.9 },
    { str: "Date: ____________", x: 315.6, y: 274.6, width: 98.1 },
    { str: "Name: Robert Acheson", x: 78, y: 254.6, width: 109.1 },
    { str: "Title: Chief Operating Officer", x: 78, y: 234.6, width: 133.0 },
    { str: "CLIENT", x: 78, y: 198.6, width: 37.9 },
    { str: "Signature: ______________________________", x: 78, y: 164.6, width: 225.9 },
    { str: "Date: ____________", x: 315.6, y: 164.6, width: 98.1 },
    { str: "Name: Alex Greenwood", x: 78, y: 144.6, width: 111.5 },
    { str: "Title: Authorized Signer for Omega National Title Agency, LLC", x: 78, y: 124.6, width: 288.9 },
  ],
};

describe("findSignatureAnchors", () => {
  it("maps each heading to the signature rule BELOW it, not the nearest one", () => {
    const a = findSignatureAnchors([EXEC_PAGE]);
    // The provider rule (274.6) sits between the two headings — the naive
    // "closest line" reading would hand it to CLIENT. It belongs to PROVIDER.
    expect(a.provider?.sigY).toBe(274.6);
    expect(a.client?.sigY).toBe(164.6);
    expect(a.provider?.dateX).toBe(315.6);
    expect(a.client?.dateY).toBe(164.6);
  });

  it("ignores the defined term 'Client' inside prose", () => {
    const prose = {
      ...EXEC_PAGE,
      items: [
        { str: "jointly referred to as the “Client”).", x: 78, y: 600, width: 200 },
        { str: "Signature: ______", x: 78, y: 560, width: 100 },
      ],
    };
    expect(findSignatureAnchors([prose]).client).toBeUndefined();
  });

  it("returns nothing for a PDF with no execution block (upload fallback)", () => {
    expect(findSignatureAnchors([{ ...EXEC_PAGE, items: [] }])).toEqual({});
  });

  it("splits label from rule by width ratio, independent of font size", () => {
    const measure = (s: string) => s.length * 3; // any linear stand-in
    const f = labelFraction("Signature: ______________________________", measure);
    expect(f).toBeGreaterThan(0.2);
    expect(f).toBeLessThan(0.35);
  });
});

// End-to-end against the real generated agreement: locate, stamp, and confirm
// the ink is inside the rule — the defect Rob reported was a blank line.
const AGREEMENT = path.resolve(
  process.env.HOME ?? "",
  "Projects/MyLocalEverything/contracts/agreements/Phase 1 Agreement - Omega Title Florida v1.pdf"
);

describe.skipIf(!fs.existsSync(AGREEMENT))("ink placement on the real agreement", () => {
  it("finds both rules and draws inside them", async () => {
    const bytes = new Uint8Array(fs.readFileSync(AGREEMENT));
    const anchors = findSignatureAnchors(await extractPageText(bytes));
    expect(anchors.client).toBeDefined();
    expect(anchors.provider).toBeDefined();

    const doc = await PDFDocument.load(bytes);
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
    const drew = await drawInkOnLine({
      doc,
      anchor: anchors.client!,
      typedName: "Alex Greenwood",
      dateText: formatSignatureDate("2026-08-07T16:29:37.663Z"),
      helvetica: helv,
      italic,
    });
    expect(drew).toBe(true);

    // Re-read: the client rule now carries a name and a date on its baseline.
    const after = await extractPageText(await doc.save());
    const line = after
      .at(-1)!
      .items.filter((i) => Math.abs(i.y - anchors.client!.sigY) < 6)
      .map((i) => i.str)
      .join(" ");
    expect(line).toContain("Alex Greenwood");
    expect(line).toContain("August 7, 2026");
  });

  it("formats the stamped date in UTC", () => {
    expect(formatSignatureDate("2026-08-07T00:30:00.000Z")).toBe("August 7, 2026");
  });
});

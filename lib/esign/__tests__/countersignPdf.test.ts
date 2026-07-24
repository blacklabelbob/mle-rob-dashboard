import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { stampCountersignature } from "../countersignPdf";
import { countersignedPath, documentPath } from "../storage";

async function fakeSignedPdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage([612, 792]).drawText(`page ${i + 1}`, { x: 72, y: 700, size: 12, font });
  }
  return doc.save();
}

const ARGS = {
  documentTitle: "Phase 1 Agreement - The Title Base",
  documentId: "doc-cs-1",
  version: 1,
  signerName: "Trent Brands",
  signedAtIso: "2026-07-23T12:00:00.000Z",
  countersignerName: "Rob Acheson",
  countersignerTitle: "Managing Member",
  countersignerEmail: "rob@aivoicetech.io",
  countersignedAtIso: "2026-07-23T21:30:00.000Z",
  sha256Signed: "b".repeat(64),
};

describe("stampCountersignature", () => {
  it("appends exactly one page and leaves the signed pages intact", async () => {
    const signedPdf = await fakeSignedPdf(3);
    const out = await stampCountersignature({ ...ARGS, signedPdf });
    const before = await PDFDocument.load(signedPdf);
    const after = await PDFDocument.load(out);
    expect(after.getPageCount()).toBe(before.getPageCount() + 1);
  });

  it("puts the countersignature facts on the appended page", async () => {
    const out = await stampCountersignature({ ...ARGS, signedPdf: await fakeSignedPdf() });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: out, useSystemFonts: true }).promise;
    const page = await doc.getPage(doc.numPages);
    const text = (await page.getTextContent()).items
      .map((i) => ("str" in i ? i.str : ""))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(text).toContain("COUNTERSIGNATURE");
    expect(text).toContain("Rob Acheson");
    expect(text).toContain("Managing Member");
    expect(text).toContain(ARGS.countersignedAtIso);
    expect(text).toContain("Trent Brands");
    expect(text).toContain(ARGS.sha256Signed);
  });

  it("refuses blank name, blank title, and a bad timestamp", async () => {
    const signedPdf = await fakeSignedPdf();
    await expect(
      stampCountersignature({ ...ARGS, signedPdf, countersignerName: "   " })
    ).rejects.toThrow(/printed name required/);
    await expect(
      stampCountersignature({ ...ARGS, signedPdf, countersignerTitle: "" })
    ).rejects.toThrow(/title\/authority required/);
    await expect(
      stampCountersignature({ ...ARGS, signedPdf, countersignedAtIso: "not-a-date" })
    ).rejects.toThrow(/bad timestamp/);
  });
});

describe("countersignedPath", () => {
  it("sits beside the signed copy without replacing it", () => {
    expect(countersignedPath("org-1", "doc-1", 2)).toBe("org-1/doc-1/v2-countersigned.pdf");
    expect(countersignedPath("org-1", "doc-1", 2)).not.toBe(documentPath("org-1", "doc-1", 2, true));
  });

  it("inherits documentPath's guards", () => {
    expect(() => countersignedPath("", "doc-1", 1)).toThrow(/anchorId and documentId required/);
    expect(() => countersignedPath("org-1", "doc-1", 0)).toThrow(/bad version/);
  });
});

// Q47 signature placement — the impure half of signatureAnchors.ts.
//
// Reads text positions out of a PDF with pdf.js (the legacy/Node build; the
// browser build assumes DOM globals). react-pdf already ships pdfjs-dist for
// the signer preview, but this is a SERVER dependency now, so it is declared
// explicitly in package.json rather than borrowed transitively — a react-pdf
// bump must not be able to silently remove it.
//
// Never throws: extraction failure degrades to "no anchors found", which makes
// every caller fall back to certificate-only stamping (the pre-2026-08-07
// behaviour). A malformed upload must not be able to break signing.

import type { PageText, TextItem } from "./signatureAnchors";

export async function extractPageText(pdf: Uint8Array): Promise<PageText[]> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Copy: pdf.js transfers/detaches the buffer it is handed, and callers
    // reuse these bytes to hash and to stamp.
    const doc = await getDocument({
      data: new Uint8Array(pdf),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const raw of content.items) {
        const it = raw as { str?: string; width?: number; transform?: number[] };
        if (!it.str || !it.str.trim() || !it.transform) continue;
        items.push({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width ?? 0,
        });
      }
      pages.push({ pageIndex: n - 1, width: viewport.width, height: viewport.height, items });
    }
    await doc.destroy();
    return pages;
  } catch {
    return [];
  }
}

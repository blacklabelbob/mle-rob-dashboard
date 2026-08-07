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
//
// BUT IT MUST NOT BE SILENT. The first version swallowed the error with a bare
// `catch {}`, so when the import failed inside a Vercel function the signature
// simply stopped appearing on the page and nothing anywhere said why — Rob hit
// it twice before it was diagnosed. Degrade quietly for the SIGNER, never for
// the operator: every failure is logged, and `lastExtractionError` lets a
// caller (and the anchors= diagnostic) report the real reason.

import type { PageText, TextItem } from "./signatureAnchors";

/** Why the last extraction returned nothing. null = it worked (or never ran). */
let lastExtractionError: string | null = null;
export function lastPdfTextError(): string | null {
  return lastExtractionError;
}

/**
 * pdf.js v5 references browser globals while its module body evaluates, so the
 * import itself throws "DOMMatrix is not defined" in a bare Node runtime — which
 * is what Vercel gives us (measured 2026-08-07 via the ?anchors= diagnostic;
 * local Node happened to get further, which is why this passed locally).
 *
 * Text extraction never rasterises anything, so these only have to EXIST and
 * hold their values — no geometry is performed through them. Deliberately not
 * pulling in `canvas`/`@napi-rs/canvas`: a native binary in the signing path to
 * satisfy a constructor we never call is a bad trade.
 */
function ensurePdfJsGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrixShim {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
    };
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2DShim {
      addPath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      closePath() {}
      rect() {}
    };
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageDataShim {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }
}

export async function extractPageText(pdf: Uint8Array): Promise<PageText[]> {
  lastExtractionError = null;
  try {
    ensurePdfJsGlobals();
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
  } catch (err) {
    lastExtractionError = (err as Error)?.message ?? String(err);
    // Loud for us, invisible to the signer: signing still completes, and the
    // certificate page still carries the evidence.
    console.error("[esign] pdf text extraction failed — signature will not be placed on the page:", lastExtractionError);
    return [];
  }
}

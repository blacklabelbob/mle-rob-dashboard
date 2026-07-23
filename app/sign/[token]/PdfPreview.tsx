"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Q47 e-sign: in-page agreement preview (react-pdf — the scout's MIT pick).
// Rendered client-only (loaded via next/dynamic ssr:false from SignerClient);
// pdf.js worker bundled from the installed pdfjs-dist via import.meta.url.
// Full-document scroll (every page stacked) — the signer must be able to read
// the whole agreement before the consent checkbox (ESIGN review expectation).

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PdfPreview({
  url,
  onRendered,
}: {
  url: string;
  // Fires once when the document has loaded and pages will render — the
  // consumer flow's §7001(c)(1)(C)(ii) "reasonably demonstrates access"
  // evidence hook (ESIGN-CONSUMER-DISCLOSURE-SPEC §3.3.1).
  onRendered?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const measure = () => setWidth(wrap.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (failed) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        The in-page preview could not load on this device.{" "}
        <a href={url} target="_blank" rel="noreferrer" className="text-sky-400 underline">
          Open the agreement PDF
        </a>{" "}
        to review it, then return here to sign.
      </div>
    );
  }

  return (
    <div ref={wrap} className="overflow-hidden rounded-lg border border-white/10 bg-white">
      <Document
        file={url}
        onLoadSuccess={(d) => {
          setPages(d.numPages);
          onRendered?.();
        }}
        onLoadError={() => setFailed(true)}
        loading={
          <div className="p-6 text-center text-sm text-slate-500">Loading agreement…</div>
        }
      >
        {width > 0 &&
          Array.from({ length: pages }, (_, i) => (
            <Page
              key={i}
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className={i > 0 ? "border-t border-slate-200" : undefined}
            />
          ))}
      </Document>
    </div>
  );
}

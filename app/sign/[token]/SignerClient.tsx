"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import {
  COMMS_CONSENT_TEXT,
  ESIGN_CONSENT_TEXT,
  ESIGN_CONSUMER_CONSENT_TEXT,
} from "@/lib/esign/consent";
import { canSign, consentLocked } from "@/lib/esign/signerGate";

// Q47 e-sign signer surface (walkthrough step 5): full-document review →
// ESIGN consent → draw (signature_pad) or typed-name signature →
// POST /api/esign/sign. Mobile-first: customers sign on phones.
//
// signerType seam (ESIGN-CONSUMER-DISCLOSURE-SPEC §3.3): business = simple
// B2B checkbox; consumer = §7001(c) disclosure block BEFORE the consent step,
// with the consent checkbox LOCKED until the PDF has actually rendered in
// this session (render + click = the §7001(c)(1)(C)(ii) "reasonably
// demonstrates access" evidence; timestamps are sent to the server and land
// in the consent event meta + audit certificate).
//
// Comms consent (Rob 2026-07-23, PEWC): separate, UNCHECKED, OPTIONAL
// checkbox — deliberately quiet styling, never gates signing. Hidden entirely
// when consent is already on file (never re-ask).

const PdfPreview = dynamic(() => import("./PdfPreview"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
      Loading agreement…
    </div>
  ),
});

interface Props {
  token: string;
  pdfUrl: string;
  documentTitle: string;
  version: number;
  defaultName: string;
  defaultEmail: string;
  expiresAt: string;
  signerType: "business" | "consumer";
  consumerDisclosure: string; // rendered server-side (placeholders resolved)
  commsConsentOnFile: boolean;
}

export default function SignerClient(props: Props) {
  const consumer = props.signerType === "consumer";
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState(props.defaultName);
  const [email, setEmail] = useState(props.defaultEmail);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ downloadUrl: string } | null>(null);
  const [padEmpty, setPadEmpty] = useState(true);
  const [commsOptIn, setCommsOptIn] = useState(false);
  const [commsPhone, setCommsPhone] = useState("");
  const [pdfRenderedAt, setPdfRenderedAt] = useState<string | null>(null);
  // Stamped once, when the disclosure first renders for a consumer signer.
  const [disclosureShownAt] = useState<string | null>(() =>
    consumer ? new Date().toISOString() : null
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (mode !== "draw" || !canvasRef.current || done) return;
    const canvas = canvasRef.current;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = padRef.current?.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      if (data) padRef.current?.fromData(data);
    };
    const pad = new SignaturePad(canvas, { penColor: "#0b1220" });
    padRef.current = pad;
    pad.addEventListener("endStroke", () => setPadEmpty(pad.isEmpty()));
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
      padRef.current = null;
    };
  }, [mode, done]);

  // Consumer consent stays locked until the PDF has rendered (spec §3.3.1).
  // Gating logic is pure + unit-tested in lib/esign/signerGate.ts.
  const locked = consentLocked(props.signerType, pdfRenderedAt);
  const signatureReady = mode === "draw" ? !padEmpty : typed.trim().length > 1;
  const signable = canSign({
    signerType: props.signerType,
    pdfRenderedAt,
    consent,
    printedName: name,
    signatureReady,
    busy,
  });

  async function submit() {
    if (!signable) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        token: props.token,
        consent: true,
        signerName: name.trim(),
        signerEmail: email.trim(),
      };
      if (mode === "draw") body.signatureDataUrl = padRef.current?.toDataURL("image/png");
      else body.typedName = typed.trim();
      if (consumer) {
        body.renderEvidence = {
          pdfRenderedAt,
          disclosureShownAt,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        };
      }
      // PEWC comms opt-in: only sent when the box was actively checked AND a
      // number was provided — skipping it changes nothing about signing.
      if (commsOptIn && commsPhone.trim()) {
        body.commsConsent = { optIn: true, phone: commsPhone.trim() };
      }
      const res = await fetch("/api/esign/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `sign failed (${res.status})`);
      setDone({ downloadUrl: json.downloadUrl });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-6 sm:p-8">
        <h1 className="text-lg font-semibold text-white">Agreement signed ✓</h1>
        <p className="mt-2 text-sm text-slate-300">
          Thank you, {name.split(/\s+/)[0]}. Your signature and the signing record have been
          attached to the agreement. A copy is being emailed to {email || "you"} for your
          records.
        </p>
        <a
          href={done.downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Download your signed copy
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">
          My Local Everything · Electronic signature
        </p>
        <h1 className="mt-1 text-xl font-semibold text-white">
          {props.documentTitle}{" "}
          <span className="text-sm font-normal text-slate-500">v{props.version}</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Review the full agreement below, then sign at the bottom. This link expires{" "}
          {props.expiresAt.slice(0, 10)}.
        </p>
      </div>

      <PdfPreview
        url={props.pdfUrl}
        onRendered={() => setPdfRenderedAt((v) => v ?? new Date().toISOString())}
      />
      <p className="text-xs text-slate-500">
        Prefer a separate window?{" "}
        <a href={props.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">
          Open the PDF
        </a>
      </p>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        {consumer && (
          /* §7001(c) disclosure — shown BEFORE the consent checkbox
             (ESIGN-CONSUMER-DISCLOSURE-SPEC §3.3/§3.5, counsel-pending). */
          <div className="whitespace-pre-line rounded-lg border border-white/10 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-300">
            {props.consumerDisclosure}
          </div>
        )}

        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={consent}
            disabled={locked}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-sky-500 disabled:opacity-40"
          />
          <span>
            {consumer ? ESIGN_CONSUMER_CONSENT_TEXT : ESIGN_CONSENT_TEXT}
            {locked && (
              <span className="mt-1 block text-xs text-amber-400/90">
                The consent box unlocks once the agreement has displayed above — if it
                won&apos;t load, request a paper copy instead (see above).
              </span>
            )}
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs text-slate-400">Printed name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full legal name"
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-400">Email for your signed copy</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
            />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMode("draw")}
              className={`rounded-md px-3 py-1.5 ${mode === "draw" ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
            >
              Draw signature
            </button>
            <button
              type="button"
              onClick={() => setMode("type")}
              className={`rounded-md px-3 py-1.5 ${mode === "type" ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
            >
              Type signature
            </button>
            {mode === "draw" && (
              <button
                type="button"
                onClick={() => {
                  padRef.current?.clear();
                  setPadEmpty(true);
                }}
                className="ml-auto text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            )}
          </div>
          {mode === "draw" ? (
            <canvas
              ref={canvasRef}
              className="h-36 w-full touch-none rounded-lg border border-dashed border-white/25 bg-white"
            />
          ) : (
            <div className="rounded-lg border border-dashed border-white/25 bg-white p-4">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your full name"
                className="w-full border-b border-slate-300 bg-transparent pb-1 font-serif text-2xl italic text-slate-900 outline-none"
              />
            </div>
          )}
        </div>

        {/* MLE comms consent — [counsel review] PEWC: optional, unchecked,
            quiet, NEVER gates signing. Hidden when already on file. */}
        {props.commsConsentOnFile ? (
          <p className="text-xs text-slate-500">Communications consent on file ✓</p>
        ) : (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <label className="flex items-start gap-3 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={commsOptIn}
                onChange={(e) => setCommsOptIn(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-slate-500"
              />
              <span>{COMMS_CONSENT_TEXT}</span>
            </label>
            {commsOptIn && (
              <input
                value={commsPhone}
                onChange={(e) => setCommsPhone(e.target.value)}
                type="tel"
                placeholder="Mobile number for calls/texts"
                className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 sm:w-64"
              />
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!signable}
          onClick={submit}
          className="w-full rounded-lg bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition enabled:hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Signing…" : "Sign agreement"}
        </button>
        <p className="text-center text-[11px] text-slate-500">
          The date and time of signing are recorded by the server. Signing this agreement
          electronically is legally binding (ESIGN / UETA).
        </p>
      </div>
    </div>
  );
}

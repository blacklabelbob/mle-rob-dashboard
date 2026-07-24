"use client";

import { useCallback, useEffect, useState } from "react";

// Q47 e-sign Documents section (walkthrough step 7) — the one allowed
// component, mounted on the record page (admin view). Version list w/ status
// chips (draft→sent→viewed→signed / voided / archived), view via time-limited
// signed URL, upload of a locally generated PDF, and Send/Resend through the
// PRE-SEND CHECK popup (walkthrough step 2): every field is a suggestion to
// confirm — prefilled from the last request's remembered answers
// (presend_answers jsonb). Unchanged answers → one-click resend (old link
// voided server-side); changed answers → the server 409s with the
// new-version instruction and it's surfaced verbatim. Email only tonight
// (SMS/Both disabled pending Twilio creds Q5b); consumer signer type
// disabled pending counsel (ESIGN-CONSUMER-DISCLOSURE-SPEC).

interface DocRow {
  id: string;
  title: string;
  phase: string;
  version: number;
  status: string;
  signed_path: string | null;
  created_at: string;
  // 0010 countersign columns — `signed` stays terminal, so "executed" is
  // derived here from countersigned_at, never from a sixth status.
  countersigned_at: string | null;
  countersigner_name: string | null;
  countersigner_title: string | null;
}

interface ReqRow {
  id: string;
  document_id: string;
  sent_to: string;
  signer_name: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  presend_answers: Record<string, unknown>;
  signer_type?: string;
}

const chipStyle: Record<string, string> = {
  draft: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  sent: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  viewed: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  signed: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  executed: "border-emerald-400/60 bg-emerald-500/20 text-emerald-200",
  voided: "border-red-400/40 bg-red-400/10 text-red-300",
  archived: "border-slate-600/40 bg-slate-800 text-slate-500",
};

interface Props {
  personId?: string;
  orgId?: string;
  dealId?: string;
}

interface PresendForm {
  legal_name: string;
  dba: string;
  address: string;
  entity_descriptor: string;
  signer_name: string;
  signer_email: string;
  signer_type: string;
  channel: string;
}

interface CountersignForm {
  name: string;
  title: string;
  email: string;
}

const EMPTY_COUNTERSIGN: CountersignForm = { name: "", title: "", email: "" };

// The countersigner is the same handful of people every time, so the last
// answers are remembered locally (never invented — blank until Rob types them
// once). The server planner still refuses a blank name or authority title.
const CS_MEMORY_KEY = "mle.esign.countersigner";

const EMPTY_FORM: PresendForm = {
  legal_name: "",
  dba: "",
  address: "",
  entity_descriptor: "",
  signer_name: "",
  signer_email: "",
  signer_type: "business",
  channel: "email",
};

export default function DocumentsSection({ personId, orgId, dealId }: Props) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [popupDoc, setPopupDoc] = useState<DocRow | null>(null);
  const [form, setForm] = useState<PresendForm>(EMPTY_FORM);
  const [sendResult, setSendResult] = useState<{ ok: boolean; note: string } | null>(null);
  const [csDoc, setCsDoc] = useState<DocRow | null>(null);
  const [csForm, setCsForm] = useState<CountersignForm>(EMPTY_COUNTERSIGN);
  const [csResult, setCsResult] = useState<{ ok: boolean; note: string; url?: string } | null>(null);

  const anchorQuery = personId
    ? `person=${personId}`
    : orgId
      ? `org=${orgId}`
      : dealId
        ? `deal=${dealId}`
        : "";

  const load = useCallback(() => {
    if (!anchorQuery) return Promise.resolve();
    // .then-style so state lands in async callbacks only
    // (react-hooks/set-state-in-effect — ThingsToAddress pattern).
    return fetch(`/api/esign/documents?${anchorQuery}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        const json = await r.json();
        setDocs(json.documents ?? []);
        setReqs(json.requests ?? []);
        setError("");
      })
      .catch(() => setError("documents unavailable"))
      .finally(() => setLoaded(true));
  }, [anchorQuery]);

  useEffect(() => {
    load();
  }, [load]);

  function latestRequestFor(docId: string): ReqRow | undefined {
    return reqs.find((r) => r.document_id === docId); // list is newest-first
  }

  async function view(docId: string) {
    const r = await fetch(`/api/esign/documents?view=${docId}`);
    if (r.ok) {
      const { url } = await r.json();
      window.open(url, "_blank", "noopener");
    }
  }

  function openPresend(doc: DocRow) {
    const last = latestRequestFor(doc.id);
    const a = (last?.presend_answers ?? {}) as Record<string, string>;
    setForm({
      ...EMPTY_FORM,
      legal_name: a.legal_name ?? "",
      dba: a.dba ?? "",
      address: a.address ?? "",
      entity_descriptor: a.entity_descriptor ?? "",
      signer_name: a.signer_name ?? last?.signer_name ?? "",
      signer_email: a.signer_email ?? last?.sent_to ?? "",
      signer_type: a.signer_type ?? "business",
    });
    setSendResult(null);
    setPopupDoc(doc);
  }

  async function send() {
    if (!popupDoc) return;
    setBusy(true);
    setSendResult(null);
    try {
      const r = await fetch("/api/esign/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: popupDoc.id,
          sentTo: form.signer_email,
          signerName: form.signer_name,
          channel: form.channel,
          signerType: form.signer_type,
          presendAnswers: {
            legal_name: form.legal_name,
            dba: form.dba,
            address: form.address,
            entity_descriptor: form.entity_descriptor,
            signer_name: form.signer_name,
            signer_email: form.signer_email,
          },
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        setSendResult({ ok: false, note: json.error ?? `send failed (${r.status})` });
        return;
      }
      setSendResult({
        ok: true,
        note: json.emailSent
          ? `Link ${json.resend ? "re-sent" : "sent"} to ${form.signer_email} (expires ${String(json.expiresAt).slice(0, 10)})`
          : `Request created but the email did not send (${json.emailReason}). Copy the link manually: ${json.signUrl}`,
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function openCountersign(doc: DocRow) {
    let remembered = EMPTY_COUNTERSIGN;
    try {
      const raw = window.localStorage.getItem(CS_MEMORY_KEY);
      if (raw) remembered = { ...EMPTY_COUNTERSIGN, ...JSON.parse(raw) };
    } catch {
      // corrupt/blocked storage is not a reason to block signing
    }
    setCsForm(remembered);
    setCsResult(null);
    setCsDoc(doc);
  }

  async function countersign() {
    if (!csDoc) return;
    setBusy(true);
    setCsResult(null);
    try {
      const r = await fetch("/api/esign/countersign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: csDoc.id,
          name: csForm.name,
          title: csForm.title,
          email: csForm.email || null,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        // Refusals from the planner are the fix-it text — surfaced verbatim.
        setCsResult({ ok: false, note: json.error ?? `countersign failed (${r.status})` });
        return;
      }
      try {
        window.localStorage.setItem(CS_MEMORY_KEY, JSON.stringify(csForm));
      } catch {
        // remembering is a convenience, never a gate
      }
      setCsResult({
        ok: true,
        note: `Executed ${String(json.countersignedAt).slice(0, 10)} — countersigned copy saved beside the signed one.`,
        url: json.downloadUrl,
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      const r = await fetch("/api/esign/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          orgId,
          dealId,
          title: file.name.replace(/\.pdf$/i, ""),
          pdfBase64: btoa(bin),
          createdBy: "dashboard",
        }),
      });
      if (!r.ok) {
        const json = await r.json();
        setError(json.error ?? "upload failed");
      } else {
        setError("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!anchorQuery) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Documents
        </h2>
        <label className="cursor-pointer rounded-md border border-white/15 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">
          Upload PDF
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error && <p className="mb-2 text-xs text-amber-400">{error}</p>}
      {!loaded ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-slate-500">No agreements yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const last = latestRequestFor(d.id);
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">
                    {d.title} <span className="text-xs text-slate-500">v{d.version} · {d.phase}</span>
                  </p>
                  {last && (
                    <p className="text-xs text-slate-500">
                      {last.status === "signed" ? "signed by" : "→"} {last.sent_to}
                      {last.status === "pending" && ` · link expires ${last.expires_at.slice(0, 10)}`}
                    </p>
                  )}
                  {d.countersigned_at ? (
                    <p className="text-xs text-emerald-400/80">
                      countersigned by {d.countersigner_name}
                      {d.countersigner_title ? `, ${d.countersigner_title}` : ""} ·{" "}
                      {d.countersigned_at.slice(0, 10)}
                    </p>
                  ) : (
                    d.status === "signed" && (
                      <p className="text-xs text-amber-400/80">awaiting your countersignature</p>
                    )
                  )}
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    d.countersigned_at ? chipStyle.executed : (chipStyle[d.status] ?? chipStyle.draft)
                  }`}
                >
                  {d.countersigned_at ? "executed" : d.status}
                </span>
                <button
                  type="button"
                  onClick={() => void view(d.id)}
                  className="rounded-md border border-white/15 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
                >
                  View
                </button>
                {["draft", "sent", "viewed"].includes(d.status) && (
                  <button
                    type="button"
                    onClick={() => openPresend(d)}
                    className="rounded-md bg-sky-500/20 px-2 py-1 text-xs text-sky-300 hover:bg-sky-500/30"
                  >
                    {latestRequestFor(d.id) ? "Resend" : "Send"}
                  </button>
                )}
                {d.status === "signed" && !d.countersigned_at && (
                  <button
                    type="button"
                    onClick={() => openCountersign(d)}
                    className="rounded-md bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Countersign
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {csDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-white">
              Countersign — {csDoc.title} v{csDoc.version}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              The counterparty is already bound. This appends one COUNTERSIGNATURE page
              beside their signed copy — their copy is never altered, and this can only
              be done once.
            </p>
            <div className="mt-3 grid gap-2.5">
              {(
                [
                  ["name", "Printed name (who executes for MLE)", "Rob Acheson"],
                  ["title", "Authority / title", "Managing Member"],
                  ["email", "Email (optional, for the record)", "rob@aivoicetech.io"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key} className="block text-xs text-slate-400">
                  {label}
                  <input
                    value={csForm[key]}
                    placeholder={placeholder}
                    onChange={(e) => setCsForm({ ...csForm, [key]: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  />
                </label>
              ))}
            </div>

            {csResult && (
              <p
                className={`mt-3 break-all rounded-lg border px-3 py-2 text-xs ${
                  csResult.ok
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                }`}
              >
                {csResult.note}
                {csResult.url && (
                  <>
                    {" "}
                    <a
                      href={csResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Download executed copy
                    </a>
                  </>
                )}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCsDoc(null)}
                className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  csResult?.ok === true ||
                  csForm.name.trim().length < 2 ||
                  csForm.title.trim().length < 2
                }
                onClick={() => void countersign()}
                className="rounded-md bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white enabled:hover:bg-emerald-400 disabled:opacity-40"
              >
                {busy ? "Countersigning…" : "Countersign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {popupDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/15 bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-white">
              Pre-send check — {popupDoc.title} v{popupDoc.version}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Every field is a suggestion to confirm or correct. Nothing sends blind.
              Changing answers requires generating a new version.
            </p>
            <div className="mt-3 grid gap-2.5">
              {(
                [
                  ["legal_name", "Legal entity name (agreement preamble)"],
                  ["dba", "DBA / brand name"],
                  ["address", "Business office / address"],
                  ["entity_descriptor", "Entity descriptor (e.g. a Florida limited liability company)"],
                  ["signer_name", "Authorized signer — name"],
                  ["signer_email", "Authorized signer — email"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs text-slate-400">
                  {label}
                  <input
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-xs text-slate-400">
                  Signer type
                  <select
                    value={form.signer_type}
                    onChange={(e) => setForm({ ...form, signer_type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="business">Business</option>
                    <option value="consumer">Consumer (pending counsel)</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-400">
                  Delivery channel
                  <select
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="email">Email</option>
                    <option value="sms" disabled>
                      SMS (awaiting Twilio creds)
                    </option>
                    <option value="both" disabled>
                      Both (awaiting Twilio creds)
                    </option>
                  </select>
                </label>
              </div>
            </div>

            {sendResult && (
              <p
                className={`mt-3 break-all rounded-lg border px-3 py-2 text-xs ${
                  sendResult.ok
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                }`}
              >
                {sendResult.note}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPopupDoc(null)}
                className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
              <button
                type="button"
                disabled={busy || !form.signer_email.includes("@") || form.signer_name.trim().length < 2}
                onClick={() => void send()}
                className="rounded-md bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white enabled:hover:bg-sky-400 disabled:opacity-40"
              >
                {busy ? "Sending…" : "Confirm & send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

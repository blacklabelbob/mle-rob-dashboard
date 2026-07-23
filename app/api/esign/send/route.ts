import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { esignDb, type RequestRow } from "@/lib/esign/db";
import { buildEvent } from "@/lib/esign/events";
import {
  deliverEsignEmail,
  esignSenderConfigured,
  esignSenderEnv,
  signingLinkEmail,
} from "@/lib/esign/sender";
import { canTransition, type DocumentStatus } from "@/lib/esign/status";
import { mintToken } from "@/lib/esign/token";
import { getStore } from "@/lib/storage";

// Q47 e-sign send/resend (walkthrough steps 2+7). Admin route — behind the
// proxy Basic gate like every /api/admin route (deliberately NOT in
// isPublicPath). Creates the request + single-use token (hash at rest),
// remembers the pre-send answers (presend_answers jsonb), voids any open
// link on resend, and delivers the link via the n8n workflow "MLE — agreement
// link sender" (Gmail, rob@aivoicetech.io). Email channel only tonight —
// SMS/Both are 501 until Twilio creds land (Q5b).
//
// Resend semantics (decided UX): UNCHANGED answers → old link voided, fresh
// link, same version. CHANGED answers → 409: a new document version must be
// generated locally and uploaded first (POST /api/esign/documents with
// supersedesId — the engine decision keeps generation off Vercel).

export const dynamic = "force-dynamic";

function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  return `{${Object.keys(v as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const sentTo = typeof body.sentTo === "string" ? body.sentTo.trim().toLowerCase() : "";
  const signerName = typeof body.signerName === "string" ? body.signerName.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel : "email";
  const expiresDaysRaw = typeof body.expiresDays === "number" ? body.expiresDays : 14;
  const presendAnswers =
    body.presendAnswers && typeof body.presendAnswers === "object" && !Array.isArray(body.presendAnswers)
      ? (body.presendAnswers as Record<string, unknown>)
      : {};

  if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });
  if (!sentTo || !sentTo.includes("@")) {
    return NextResponse.json({ error: "sentTo must be an email address" }, { status: 400 });
  }
  if (channel !== "email") {
    return NextResponse.json(
      { error: `channel "${channel}" not available yet — SMS rides Twilio creds (Q5b); email only tonight` },
      { status: 501 }
    );
  }

  // Signer type seam (ESIGN-CONSUMER-DISCLOSURE-SPEC §3.1): chosen in the
  // pre-send popup; consumer sends are hard-blocked until counsel signs off
  // on the §7001(c) language AND ESIGN_CONSUMER_ENABLED is set.
  const signerType =
    body.signerType === "consumer" || presendAnswers.signer_type === "consumer"
      ? "consumer"
      : "business";
  if (signerType === "consumer" && !process.env.ESIGN_CONSUMER_ENABLED) {
    return NextResponse.json(
      {
        error:
          "Consumer signing is not enabled yet — pending counsel review (ESIGN-CONSUMER-DISCLOSURE-SPEC.md)",
      },
      { status: 403 }
    );
  }
  const expiresDays = Math.min(Math.max(Math.round(expiresDaysRaw), 1), 60);

  const { data: document, error: dErr } = await esignDb()
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "document not found" }, { status: 404 });
  if (!["draft", "sent", "viewed"].includes(document.status)) {
    return NextResponse.json(
      { error: `document is ${document.status} — cannot send` },
      { status: 409 }
    );
  }

  // Open requests on this version: resend path.
  const { data: existingRaw, error: eErr } = await esignDb()
    .from("signature_requests")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  const existing = (existingRaw ?? []) as RequestRow[];
  const isResend = existing.length > 0;
  const latest = existing[0];

  // Changed answers ⇒ new version required. Compare on the effective answers
  // (incoming + the signer_type this send resolves to) so the injected
  // signer_type echo never fakes a "changed" verdict.
  if (isResend && Object.keys(presendAnswers).length > 0) {
    if (
      stableJson(latest.presend_answers ?? {}) !==
      stableJson({ ...presendAnswers, signer_type: signerType })
    ) {
      return NextResponse.json(
        {
          error:
            "pre-send answers changed — generate the updated agreement locally and upload it as a new version (POST /api/esign/documents with supersedesId), then send that version",
        },
        { status: 409 }
      );
    }
  }

  const now = new Date().toISOString();

  // Void every still-open link (one live link per document, walkthrough rule).
  for (const r of existing) {
    if (r.status === "pending" || r.status === "viewed") {
      await esignDb()
        .from("signature_requests")
        .update({ status: "voided", voided_at: now, updated_at: now })
        .eq("id", r.id)
        .is("signed_at", null);
      await insertEventSafe(r.id, "voided", now, { reason: "resend" });
    }
  }

  const { token, tokenHash } = mintToken();
  const requestId = `req-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const expiresAt = new Date(Date.now() + expiresDays * 86_400_000).toISOString();
  const { error: insErr } = await esignDb()
    .from("signature_requests")
    .insert({
      id: requestId,
      document_id: documentId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      channel,
      sent_to: sentTo,
      signer_name: signerName || null,
      signer_email: sentTo,
      presend_answers: {
        ...(isResend && Object.keys(presendAnswers).length === 0
          ? latest.presend_answers // remembered answers carry forward on 1-click resend
          : presendAnswers),
        signer_type: signerType, // echoed per spec §3.1
      },
      signer_type: signerType,
      status: "pending",
      created_at: now,
      updated_at: now,
    });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await insertEventSafe(requestId, "created", now, { documentId, expiresAt, channel });
  await insertEventSafe(requestId, isResend ? "resent" : "sent", now, { to: sentTo });

  if (document.status === "draft" && canTransition("draft" as DocumentStatus, "sent")) {
    await esignDb()
      .from("documents")
      .update({ status: "sent", updated_at: now })
      .eq("id", documentId)
      .eq("status", "draft");
  }

  // Timeline activity (idempotent per request id).
  await getStore()
    .upsertActivity({
      id: `esign-sent-${requestId}`,
      personId: document.person_id ?? undefined,
      orgId: document.org_id ?? undefined,
      dealId: document.deal_id ?? undefined,
      createdBy: "esign",
      type: "note",
      source: "api",
      sourceContext: {
        esign: true,
        event: isResend ? "resent" : "sent",
        documentId,
        requestId,
        version: document.version,
        to: sentTo,
        expiresAt,
      },
      summary: `Agreement ${isResend ? "re-sent" : "sent"} for signature: ${document.title} (v${document.version}) → ${sentTo}`,
      bookProtected: false,
      occurredAt: now,
      createdAt: now,
    })
    .catch((err) => console.error("[esign] timeline activity failed:", err));

  const signUrl = `${req.nextUrl.origin}/sign/${token}`;
  let emailSent = false;
  let emailReason = "";
  const env = esignSenderEnv();
  if (esignSenderConfigured(env)) {
    const mail = signingLinkEmail({
      signerName: signerName || sentTo,
      documentTitle: document.title,
      link: signUrl,
      expiresAtIso: expiresAt,
      resend: isResend,
    });
    const result = await deliverEsignEmail({ to: sentTo, ...mail }, env);
    emailSent = result.sent;
    if (!result.sent) emailReason = result.reason;
  } else {
    emailReason = "sender not configured";
  }

  // signUrl is returned to the (already-authenticated) admin so the link can
  // be delivered manually whenever the mailer is down — a dead mailer must
  // not strand a deal.
  return NextResponse.json({
    ok: true,
    requestId,
    expiresAt,
    resend: isResend,
    emailSent,
    ...(emailSent ? {} : { emailReason, signUrl }),
  });
}

async function insertEventSafe(
  requestId: string,
  type: "created" | "sent" | "resent" | "voided",
  at: string,
  meta: Record<string, unknown>
): Promise<void> {
  const { error } = await esignDb()
    .from("signature_events")
    .insert(buildEvent(requestId, type, at, { meta }));
  if (error) console.error(`[esign] ${type} event for ${requestId} failed: ${error.message}`);
}

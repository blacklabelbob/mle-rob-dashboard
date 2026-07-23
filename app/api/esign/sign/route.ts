import { NextRequest, NextResponse } from "next/server";
import {
  COMMS_CONSENT_TEXT,
  COMMS_CONSENT_VERSION,
  CONSENT_VERSION,
  CONSUMER_CONSENT_VERSION,
  renderConsumerDisclosure,
} from "@/lib/esign/consent";
import { anchorIdOf, esignDb, getRequestByTokenHash, insertEvent, listEvents } from "@/lib/esign/db";
import { buildEvent } from "@/lib/esign/events";
import { sha256Hex } from "@/lib/esign/hash";
import {
  ROB_COPY_ADDRESS,
  deliverEsignEmail,
  esignSenderConfigured,
  esignSenderEnv,
  signedCopyEmail,
} from "@/lib/esign/sender";
import { stampAndCertify } from "@/lib/esign/stamp";
import { canTransition, type DocumentStatus } from "@/lib/esign/status";
import { documentPath, downloadPdf, signedUrlFor, uploadPdf } from "@/lib/esign/storage";
import { hashToken, verifyToken } from "@/lib/esign/token";
import { getStore } from "@/lib/storage";

// Q47 e-sign completion (walkthrough steps 5–6). PUBLIC route (proxy
// exemption) — the single-use token is the auth; everything else is verified
// server-side. Flow: verify token → re-download the stored PDF → re-compute
// sha256 (MUST equal sha256_at_upload; a mismatch is a hard stop, never a
// signature) → stamp signature + server UTC date + audit-certificate page
// (@cantoo/pdf-lib) → store v<N>-signed.pdf → flip request+document to signed
// → void the token (signed_at = single-use latch) → append consent+signed
// events → timeline activity → email copies (signer + Rob). Email failure
// never loses a signature — the signed record is durable before any send.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  const signerName = typeof body.signerName === "string" ? body.signerName.trim() : "";
  const signerEmail = typeof body.signerEmail === "string" ? body.signerEmail.trim() : "";
  const signatureDataUrl =
    typeof body.signatureDataUrl === "string" ? body.signatureDataUrl : undefined;
  const typedName = typeof body.typedName === "string" ? body.typedName.trim() : undefined;

  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  if (body.consent !== true) {
    // ESIGN element 2: no consent, no signature — ever.
    return NextResponse.json(
      { error: "electronic-signature consent is required" },
      { status: 400 }
    );
  }
  if (signerName.length < 2) {
    return NextResponse.json({ error: "printed name required" }, { status: 400 });
  }
  if (!signatureDataUrl && !typedName) {
    return NextResponse.json(
      { error: "a drawn signature or typed name is required" },
      { status: 400 }
    );
  }
  if (signatureDataUrl && !signatureDataUrl.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "signature must be a PNG data URL" }, { status: 400 });
  }

  // PEWC comms opt-in (OPTIONAL — its absence never affects signing).
  const commsRaw = body.commsConsent as { optIn?: unknown; phone?: unknown } | undefined;
  const commsConsent =
    commsRaw && commsRaw.optIn === true && typeof commsRaw.phone === "string" && commsRaw.phone.trim()
      ? { phone: commsRaw.phone.trim() }
      : null;

  // Consumer render evidence (§7001(c)(1)(C)(ii)) — required for consumer
  // signers, ignored for business.
  const evidenceRaw = body.renderEvidence as
    | { pdfRenderedAt?: unknown; disclosureShownAt?: unknown; viewport?: unknown }
    | undefined;
  const renderEvidence =
    evidenceRaw &&
    typeof evidenceRaw.pdfRenderedAt === "string" &&
    typeof evidenceRaw.disclosureShownAt === "string"
      ? {
          pdfRenderedAt: evidenceRaw.pdfRenderedAt,
          disclosureShownAt: evidenceRaw.disclosureShownAt,
          viewport: typeof evidenceRaw.viewport === "string" ? evidenceRaw.viewport : undefined,
        }
      : null;

  const found = await getRequestByTokenHash(hashToken(token)).catch(() => null);
  if (!found) return NextResponse.json({ error: "signing link not found" }, { status: 404 });
  const { request, document } = found;

  const verdict = verifyToken(token, request, new Date());
  if (!verdict.ok) {
    const status = verdict.reason === "expired" ? 410 : verdict.reason === "tampered" ? 404 : 409;
    return NextResponse.json({ error: `signing link ${verdict.reason}` }, { status });
  }
  if (!canTransition(document.status as DocumentStatus, "signed")) {
    return NextResponse.json(
      { error: `document is ${document.status} — cannot be signed` },
      { status: 409 }
    );
  }
  const isConsumer = request.signer_type === "consumer";
  if (isConsumer && !renderEvidence) {
    // Spec §3.3.1: the render+click IS the "reasonably demonstrates access"
    // evidence — a consumer signature without it is not accepted.
    return NextResponse.json(
      { error: "consumer signing requires the agreement to have rendered in your browser first" },
      { status: 400 }
    );
  }

  // Hash discipline: the bytes the signer saw must be the bytes that were
  // sent. Re-download, re-hash, compare — mismatch is a hard 409.
  const original = await downloadPdf(document.storage_path);
  const shaAtSign = sha256Hex(original);
  if (shaAtSign !== document.sha256_at_upload) {
    return NextResponse.json(
      { error: "document integrity check failed — signing blocked" },
      { status: 409 }
    );
  }

  const h = req.headers;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const userAgent = h.get("user-agent") ?? "unknown";
  const now = new Date().toISOString();

  // Single-use latch FIRST (race-safe): only the request that flips
  // signed_at from null proceeds to stamp. A concurrent double-post gets 409.
  const { data: latched, error: latchErr } = await esignDb()
    .from("signature_requests")
    .update({
      signed_at: now,
      consent_at: now,
      status: "signed",
      signer_name: signerName,
      signer_email: signerEmail || request.sent_to,
      signer_ip: ip,
      signer_user_agent: userAgent,
      sha256_at_sign: shaAtSign,
      updated_at: now,
    })
    .eq("id", request.id)
    .is("signed_at", null)
    .select("id");
  if (latchErr) return NextResponse.json({ error: latchErr.message }, { status: 500 });
  if (!latched || latched.length === 0) {
    return NextResponse.json({ error: "signing link signed" }, { status: 409 });
  }

  // ------------------------------------------------------------------------
  // CRITICAL SECTION (critic-rob punch #1). The latch above is only a
  // concurrency lock — the signature does not legally EXIST until the stamped
  // PDF is stored and the document row is flipped. If anything in between
  // fails, we REVERT the latch to the exact pre-latch row (snapshot in
  // `request`), file a high flag, and 500 with an honest "nothing was
  // recorded — same link still works" message. Design choice, on record:
  //   * cannot lose a signature — nothing durable existed at failure, and the
  //     link comes back to life for an immediate retry;
  //   * cannot double-sign — the latch update stays atomic
  //     (.is(signed_at,null)); a retry re-takes it cleanly.
  // If the REVERT ITSELF fails the link is stuck consumed — that flag says so
  // explicitly and the signer is told to request a fresh link.
  // ------------------------------------------------------------------------
  let signedPath: string;
  let sha256Signed: string;
  try {
    // Audit chain for the certificate = every prior event + the two being added.
    const prior = await listEvents([request.id]);
    const chain = [
      ...prior.map((e) => ({ type: e.type, at: e.at, ip: e.ip })),
      { type: "consent", at: now, ip },
      { type: "signed", at: now, ip },
    ];

    const signedBytes = await stampAndCertify({
      originalPdf: original,
      documentTitle: document.title,
      documentId: document.id,
      version: document.version,
      phase: document.phase,
      signerName,
      signerEmail: signerEmail || request.sent_to,
      signatureDataUrl,
      typedName,
      signedAtIso: now,
      consentAtIso: now,
      signerIp: ip,
      signerUserAgent: userAgent,
      sha256AtUpload: document.sha256_at_upload,
      sha256AtSign: shaAtSign,
      events: chain,
      consumer:
        isConsumer && renderEvidence
          ? {
              disclosureText: renderConsumerDisclosure(ROB_COPY_ADDRESS, "My Local Everything"),
              disclosureVersion: CONSUMER_CONSENT_VERSION,
              pdfRenderedAt: renderEvidence.pdfRenderedAt,
              disclosureShownAt: renderEvidence.disclosureShownAt,
            }
          : undefined,
      commsConsent: commsConsent
        ? { phone: commsConsent.phone, languageVersion: COMMS_CONSENT_VERSION, text: COMMS_CONSENT_TEXT }
        : undefined,
    });
    sha256Signed = sha256Hex(signedBytes);
    const anchor = anchorIdOf(document);
    signedPath = documentPath(anchor, document.id, document.version, true);
    await uploadPdf(signedPath, signedBytes);

    const { error: docErr } = await esignDb()
      .from("documents")
      .update({
        status: "signed",
        signed_path: signedPath,
        sha256_signed: sha256Signed,
        updated_at: now,
      })
      .eq("id", document.id);
    if (docErr) throw new Error(`document update: ${docErr.message}`);
  } catch (err) {
    const reason = (err as Error).message;
    console.error(`[esign] post-latch failure for ${request.id}: ${reason}`);
    // Revert the latch to the exact pre-latch snapshot.
    const revertAt = new Date().toISOString();
    const { data: reverted, error: revErr } = await esignDb()
      .from("signature_requests")
      .update({
        signed_at: request.signed_at,
        consent_at: request.consent_at,
        status: request.status,
        signer_name: request.signer_name,
        signer_email: request.signer_email,
        signer_ip: request.signer_ip,
        signer_user_agent: request.signer_user_agent,
        sha256_at_sign: request.sha256_at_sign,
        updated_at: revertAt,
      })
      .eq("id", request.id)
      .select("id");
    const revertOk = !revErr && (reverted?.length ?? 0) > 0;
    await esignDb()
      .from("flags")
      .insert({
        entity_id: document.person_id ?? document.org_id ?? document.deal_id,
        entity_name: "E-sign",
        title: `E-sign signing failed after latch — ${request.id}`,
        detail: revertOk
          ? `Signing "${document.title}" (v${document.version}) for ${request.sent_to} failed after the single-use latch (${reason}). Latch REVERTED — the link is live again and the signer was told to retry. No signature was recorded.`
          : `Signing "${document.title}" (v${document.version}) for ${request.sent_to} failed after the single-use latch (${reason}) AND the revert also failed (${revErr?.message ?? "0 rows"}). The link is stuck consumed with NO signed PDF — issue a fresh link via resend.`,
        severity: "high",
      })
      .then(({ error: fErr }) => {
        if (fErr) console.error(`[esign] failure flag insert failed: ${fErr.message}`);
      });
    return NextResponse.json(
      {
        error: revertOk
          ? "signing could not be completed — nothing was recorded. Your link is still valid; please try again."
          : "signing could not be completed — please contact us for a fresh signing link.",
      },
      { status: 500 }
    );
  }

  // From here the signed record is DURABLE — no failure below may 500 or
  // revert. DB-ledger event misses are an audit gap (the certificate already
  // embeds the chain), so they file a flag instead of failing the signer.
  const auditGap = (what: string) => (err: unknown) => {
    console.error(`[esign] ${what} failed post-durability:`, err);
    void esignDb()
      .from("flags")
      .insert({
        entity_id: document.person_id ?? document.org_id ?? document.deal_id,
        entity_name: "E-sign",
        title: `E-sign audit gap: ${what} — ${request.id}`,
        detail: `"${document.title}" signed successfully but ${what} failed to write (${(err as Error).message}). The signed PDF's certificate page carries the full chain; backfill the ledger row.`,
        severity: "high",
      })
      .then(({ error: fErr }) => {
        if (fErr) console.error(`[esign] audit-gap flag insert failed: ${fErr.message}`);
      });
  };

  await insertEvent(
    buildEvent(request.id, "consent", now, {
      ip,
      meta: {
        consentVersion: isConsumer ? CONSUMER_CONSENT_VERSION : CONSENT_VERSION,
        signerType: request.signer_type,
        userAgent,
        ...(isConsumer && renderEvidence
          ? {
              pdfRenderedAt: renderEvidence.pdfRenderedAt,
              disclosureShownAt: renderEvidence.disclosureShownAt,
              viewport: renderEvidence.viewport,
            }
          : {}),
      },
    })
  ).catch(auditGap("consent event"));
  // PEWC comms opt-in — separate event with its own language version, and a
  // person-level record so no surface ever re-asks (0009 people.comms_consent).
  if (commsConsent) {
    await insertEvent(
      buildEvent(request.id, "comms_consent", now, {
        ip,
        meta: {
          phone: commsConsent.phone,
          languageVersion: COMMS_CONSENT_VERSION,
          text: COMMS_CONSENT_TEXT,
          userAgent,
        },
      })
    ).catch(auditGap("comms_consent event"));
    if (document.person_id) {
      await esignDb()
        .from("people")
        .update({
          comms_consent: {
            grantedAt: now,
            phone: commsConsent.phone,
            languageVersion: COMMS_CONSENT_VERSION,
            requestId: request.id,
            ip,
            source: "esign-signer-page",
          },
        })
        .eq("id", document.person_id)
        .is("comms_consent", null); // never overwrite an earlier grant
    }
  }
  await insertEvent(
    buildEvent(request.id, "signed", now, {
      ip,
      meta: {
        signerName,
        signerEmail: signerEmail || request.sent_to,
        method: signatureDataUrl ? "drawn" : "typed",
        sha256AtSign: shaAtSign,
        sha256Signed,
        signedPath,
      },
    })
  ).catch(auditGap("signed event"));

  // Lead-timeline activity (walkthrough: "everything a lead-timeline event").
  // Idempotent id per request; anchors copied from the document row (same
  // ≤1-of-person/org check both tables enforce).
  await getStore()
    .upsertActivity({
      id: `esign-signed-${request.id}`,
      personId: document.person_id ?? undefined,
      orgId: document.org_id ?? undefined,
      dealId: document.deal_id ?? undefined,
      createdBy: "esign",
      type: "note",
      source: "api",
      sourceContext: {
        esign: true,
        event: "signed",
        documentId: document.id,
        requestId: request.id,
        version: document.version,
        signerName,
      },
      summary: `Agreement signed: ${document.title} (v${document.version}) by ${signerName}`,
      bookProtected: false,
      occurredAt: now,
      createdAt: now,
    })
    .catch((err) => console.error("[esign] timeline activity failed:", err));

  // Copy delivery (ESIGN element 4). 7-day link; failures logged, never fatal.
  const downloadUrl = await signedUrlFor(signedPath, 7 * 24 * 3600);
  const env = esignSenderEnv();
  if (esignSenderConfigured(env)) {
    const copy = signedCopyEmail({
      signerName,
      documentTitle: document.title,
      downloadUrl,
      signedAtIso: now,
    });
    for (const to of [signerEmail || request.sent_to, ROB_COPY_ADDRESS]) {
      const result = await deliverEsignEmail({ to, ...copy }, env);
      if (result.sent) {
        await insertEvent(
          buildEvent(request.id, "copy_delivered", new Date().toISOString(), {
            meta: { to },
          })
        ).catch(() => undefined);
      } else {
        console.error(`[esign] signed-copy email to ${to} not sent: ${result.reason}`);
      }
    }
  } else {
    console.error("[esign] sender not configured — signed copies not emailed");
  }

  return NextResponse.json({ ok: true, downloadUrl });
}

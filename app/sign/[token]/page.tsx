import { headers } from "next/headers";
import { renderConsumerDisclosure } from "@/lib/esign/consent";
import { buildEvent } from "@/lib/esign/events";
import { ROB_COPY_ADDRESS } from "@/lib/esign/sender";
import { hashToken, verifyToken } from "@/lib/esign/token";
import { canTransition, type DocumentStatus } from "@/lib/esign/status";
import { esignDb, getRequestByTokenHash, insertEvent, listEvents } from "@/lib/esign/db";
import { signedUrlFor } from "@/lib/esign/storage";
import SignerClient from "./SignerClient";

// Q47 e-sign signer page (walkthrough step 5). PUBLIC (proxy isPublicPath
// exemption) — the single-use expiring token IS the auth. Server component:
// verifies the token, logs the first `viewed` event (idempotent — only when
// viewed_at is null), flips request pending→viewed and document sent→viewed,
// then renders the client signer with a time-limited signed PDF URL.
// The wrapper is `fixed inset-0 z-50` on purpose: customers must see a clean
// signing surface, not the internal CRM chrome the root layout renders.

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">{children}</div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{body}</p>
      </div>
    </Shell>
  );
}

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await getRequestByTokenHash(hashToken(token)).catch(() => null);
  if (!found) {
    return (
      <Notice
        title="This signing link is not valid"
        body="The link may have been mistyped or replaced by a newer one. Please use the most recent email you received, or contact us for a fresh link."
      />
    );
  }
  const { request, document } = found;
  const verdict = verifyToken(token, request, new Date());
  if (!verdict.ok) {
    // Copy delivery is best-effort — only CLAIM it when a copy_delivered
    // event actually exists (critic-rob punch #4).
    let signedBody =
      "A copy of the completed agreement is sent to the signer's email — contact us if it hasn't arrived or you need another copy.";
    if (verdict.reason === "signed") {
      const events = await listEvents([request.id]).catch(() => []);
      if (events.some((e) => e.type === "copy_delivered")) {
        signedBody =
          "A copy of the completed agreement was delivered to the signer's email. Contact us if you need another copy.";
      }
    }
    const msg: Record<string, { title: string; body: string }> = {
      signed: {
        title: "This agreement has already been signed",
        body: signedBody,
      },
      voided: {
        title: "This signing link was replaced",
        body: "A newer signing link was issued for this agreement. Please use the most recent email you received.",
      },
      expired: {
        title: "This signing link has expired",
        body: "For security, signing links expire. Contact us and we'll send a fresh link right away.",
      },
      tampered: {
        title: "This signing link is not valid",
        body: "Please use the exact link from your email, or contact us for a fresh one.",
      },
      status: {
        title: "This signing link is no longer active",
        body: "Contact us and we'll send a fresh link right away.",
      },
    };
    const m = msg[verdict.reason] ?? msg.status;
    return <Notice title={m.title} body={m.body} />;
  }

  // First view: log it (idempotent — one viewed event per request, ever).
  if (!request.viewed_at) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const now = new Date().toISOString();
    await esignDb()
      .from("signature_requests")
      .update({ viewed_at: now, status: "viewed", updated_at: now })
      .eq("id", request.id)
      .is("viewed_at", null); // race-safe: second concurrent view no-ops
    await insertEvent(
      buildEvent(request.id, "viewed", now, {
        ip,
        meta: { userAgent: h.get("user-agent") ?? undefined },
      })
    ).catch(() => undefined); // viewing must never 500 the signer
    if (canTransition(document.status as DocumentStatus, "viewed")) {
      await esignDb()
        .from("documents")
        .update({ status: "viewed", updated_at: now })
        .eq("id", document.id)
        .eq("status", "sent");
    }
  }

  const pdfUrl = await signedUrlFor(document.storage_path, 3600);

  // PEWC comms consent: never re-ask a person who's already on file
  // (0009 people.comms_consent; org/deal-anchored docs have no person row to
  // check — the checkbox shows and the event still records the proof).
  let commsConsentOnFile = false;
  if (document.person_id) {
    const { data: person } = await esignDb()
      .from("people")
      .select("comms_consent")
      .eq("id", document.person_id)
      .maybeSingle();
    commsConsentOnFile = Boolean(person?.comms_consent);
  }

  const signerType = request.signer_type === "consumer" ? "consumer" : "business";

  return (
    <Shell>
      <SignerClient
        token={token}
        pdfUrl={pdfUrl}
        documentTitle={document.title}
        version={document.version}
        defaultName={request.signer_name ?? ""}
        defaultEmail={request.signer_email ?? request.sent_to}
        expiresAt={request.expires_at}
        signerType={signerType}
        consumerDisclosure={renderConsumerDisclosure(ROB_COPY_ADDRESS, "My Local Everything")}
        commsConsentOnFile={commsConsentOnFile}
      />
    </Shell>
  );
}

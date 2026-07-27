import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import {
  allParties,
  directionOf,
  emailToActivity,
  identityGate,
  matchContact,
  n8nEmailConfigured,
  n8nEmailEnv,
  verifyN8nSecret,
  type EmailPayload,
} from "@/lib/n8nEmail";
import { buildGraphIndex } from "@/lib/comms/emailGraphIndex";
import { resolveMailboxLink } from "@/lib/comms/mailboxLink";
import { planOrgProposals, recordOrgProposals } from "@/lib/comms/orgProposal";
import { supabaseProposalSink } from "@/lib/comms/orgProposalSink";

export const dynamic = "force-dynamic";

// n8n Gmail capture endpoint (PRD Task 3.2, BUILD-QUEUE Q8). The n8n workflow
// POSTs each rob@aivoicetech.io message here; matched contacts get an
// `activities` row on their timeline. Secret-checked via x-n8n-secret; no
// N8N_EMAIL_WEBHOOK_SECRET set → 503, inert. Rejections return 200 so n8n
// never retry-loops, with the verdict logged for the identity-rule DoD
// ("boostuppayments.com mail never ingested — log-verified").
export async function POST(req: Request) {
  const env = n8nEmailEnv();
  if (!n8nEmailConfigured(env)) {
    return NextResponse.json(
      { error: "n8n email capture not configured" },
      { status: 503 }
    );
  }
  const secret = req.headers.get("x-n8n-secret") ?? "";
  if (!verifyN8nSecret(env.webhookSecret!, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (!payload?.messageId || !payload?.from) {
    return NextResponse.json(
      { error: "messageId and from are required" },
      { status: 400 }
    );
  }

  // Q69 inc.7 — the link_id invariant: nothing is ingested until we know WHICH
  // connected mailbox captured it. An unregistered mailbox is refused rather
  // than defaulted, so a second inbox wired into n8n can never file as Rob's.
  const mailbox = resolveMailboxLink(payload.mailbox);
  if (!mailbox.ok) {
    console.log("[n8n-email] REJECTED", payload.messageId, mailbox.reason);
    return NextResponse.json({ ok: true, ingested: false, reason: mailbox.reason });
  }
  const link = mailbox.link;

  const verdict = identityGate(payload, link);
  if (!verdict.ok) {
    console.log("[n8n-email] REJECTED", payload.messageId, verdict.reason);
    return NextResponse.json({ ok: true, ingested: false, reason: verdict.reason });
  }

  const store = getStore();
  const data = await store.getNetwork();
  const index = buildGraphIndex(data);
  const match = matchContact(data, payload, index, link);
  if (!match) {
    // Q69 inc.3: the ladder anchored nothing. If we SENT this, rung 6 proposes
    // the company on the ledger's "Things to Address" — proposes, never
    // creates. Received mail from an unknown domain still queues nothing.
    const counterparts = allParties(payload).filter((a) => a !== link.address);
    const proposals = planOrgProposals(counterparts, directionOf(payload, link), index);
    let queued: string[] = [];
    if (proposals.length > 0) {
      const sink = supabaseProposalSink();
      if (sink) {
        try {
          const res = await recordOrgProposals(proposals, sink);
          queued = res.created;
          console.log(
            "[n8n-email] org proposals",
            payload.messageId,
            "queued:",
            res.created.join(",") || "none",
            "already-queued:",
            res.duplicate.join(",") || "none"
          );
        } catch (err) {
          // The email is still not ingested either way; a failed queue write is
          // logged loudly rather than swallowed into a cheerful 200.
          console.error("[n8n-email] org proposal queue FAILED", payload.messageId, err);
        }
      } else {
        console.log(
          "[n8n-email] org proposals (no ledger store configured)",
          proposals.map((p) => p.domain).join(",")
        );
      }
    }
    console.log("[n8n-email] no contact match", payload.messageId);
    return NextResponse.json({
      ok: true,
      ingested: false,
      reason: "no contact match",
      proposedOrgs: queued,
    });
  }

  const activity = emailToActivity(payload, match, new Date().toISOString(), link);
  await store.upsertActivity(activity);
  console.log(
    "[n8n-email] ingested",
    payload.messageId,
    "→",
    activity.personId ? `person:${activity.personId}` : `org:${activity.orgId}`
  );
  return NextResponse.json({ ok: true, ingested: true, activityId: activity.id });
}

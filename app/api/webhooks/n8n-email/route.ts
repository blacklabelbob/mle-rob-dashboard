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
  partiesOf,
  verifyN8nSecret,
  type EmailPayload,
} from "@/lib/n8nEmail";
import { buildGraphIndex } from "@/lib/comms/emailGraphIndex";
import { resolveMailboxLink } from "@/lib/comms/mailboxLink";
import { planOrgProposals, recordOrgProposals } from "@/lib/comms/orgProposal";
import { supabaseProposalSink } from "@/lib/comms/orgProposalSink";
import { planPeopleForEmail } from "@/lib/comms/emailPeople";
import { applyPeopleWrites, type PersonWriteFailure } from "@/lib/comms/emailPeopleWrites";
import { ingestOutcome, proposalOutcome } from "@/lib/comms/ingestOutcome";

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
    const planned = proposals.map((p) => p.domain);
    const sink = proposals.length > 0 ? supabaseProposalSink() : null;
    let result: { created: string[]; duplicate: string[] } | undefined;
    let queueError: unknown;
    if (proposals.length > 0) {
      if (sink) {
        try {
          result = await recordOrgProposals(proposals, sink);
          console.log(
            "[n8n-email] org proposals",
            payload.messageId,
            "queued:",
            result.created.join(",") || "none",
            "already-queued:",
            result.duplicate.join(",") || "none"
          );
        } catch (err) {
          // The email is still not ingested either way; a failed queue write is
          // logged loudly AND reported in the body (inc.22) rather than
          // swallowed into a cheerful 200 n8n cannot tell from success.
          queueError = err;
          console.error("[n8n-email] org proposal queue FAILED", payload.messageId, err);
        }
      } else {
        console.error(
          "[n8n-email] org proposals DROPPED (no ledger store configured)",
          payload.messageId,
          planned.join(",")
        );
      }
    }
    console.log("[n8n-email] no contact match", payload.messageId);
    return NextResponse.json(
      proposalOutcome({
        planned,
        result,
        storeConfigured: sink !== null,
        error: queueError,
      })
    );
  }

  const capturedAt = new Date().toISOString();

  // Q69 inc.12 — the people half reaches the store. Rungs 1–3 anchored this
  // message; rung 3 means the human behind it is NOT in the CRM yet, and until
  // now that human stayed invisible while their mail filed on the company.
  // The planner (inc.11) decides every counterpart at once — the capture
  // mailbox removed, because Rob's own record carries that address and leaving
  // it in would merge every message into Rob.
  const people = planPeopleForEmail({
    data,
    parties: partiesOf(payload).filter((p) => p.address !== link.address),
    direction: directionOf(payload, link),
    index,
    capturedAtISO: capturedAt,
    emailDateISO: payload.date,
  });
  let peopleWritten = {
    created: [] as string[],
    merged: [] as string[],
    failed: [] as PersonWriteFailure[],
  };
  if (people.writes.length > 0) {
    const res = await applyPeopleWrites(people.writes, store);
    peopleWritten = { created: res.created, merged: res.merged, failed: res.failed };
    if (res.failed.length > 0) {
      // Loud, never swallowed: a person we failed to create is a human the rep
      // will not see. The email itself still lands — losing the timeline row
      // too would make one failed write cost us the message as well.
      console.error(
        "[n8n-email] person write FAILED",
        payload.messageId,
        res.failed.map((f) => `${f.kind}:${f.personId}:${f.error}`).join(" | ")
      );
    }
    console.log(
      "[n8n-email] people",
      payload.messageId,
      "created:",
      res.created.join(",") || "none",
      "merged:",
      res.merged.join(",") || "none"
    );
  }

  const activity = emailToActivity(payload, match, capturedAt, link);
  // Q69 inc.23 — the write this route exists for is no longer the only one that
  // can take the route down. A throw here used to escape as a framework 500,
  // which breaks the route's own contract (200 so n8n never retry-loops) and
  // reads to n8n as "endpoint down" rather than "this message is lost".
  let activityError: unknown;
  try {
    await store.upsertActivity(activity);
    console.log(
      "[n8n-email] ingested",
      payload.messageId,
      "→",
      activity.personId ? `person:${activity.personId}` : `org:${activity.orgId}`
    );
  } catch (err) {
    activityError = err;
    console.error("[n8n-email] activity write FAILED", payload.messageId, err);
  }
  return NextResponse.json(
    ingestOutcome({
      activityId: activity.id,
      messageId: payload.messageId,
      created: peopleWritten.created,
      merged: peopleWritten.merged,
      failed: peopleWritten.failed,
      activityError,
    })
  );
}

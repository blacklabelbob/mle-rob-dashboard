// Q47 e-sign delivery: thin client for the n8n workflow
// "MLE — agreement link sender" (webhook → header-secret gate → Gmail send,
// cred zafHNwGNRYD8V9aq, FROM rob@aivoicetech.io — identity rule
// ~/.claude/rules/email-identity.md: aivoicetech.io only, boostuppayments.com
// never). Same env-gated contract as lib/n8nEmail.ts: with the env unset the
// send is skipped and reported as skipped — a missing mailer must never lose
// a signature or block a send record.

export interface EsignSenderEnv {
  webhookUrl?: string; // ESIGN_SENDER_WEBHOOK_URL
  secret?: string; // ESIGN_SENDER_SECRET (x-esign-secret header)
}

export function esignSenderEnv(env: NodeJS.ProcessEnv = process.env): EsignSenderEnv {
  return { webhookUrl: env.ESIGN_SENDER_WEBHOOK_URL, secret: env.ESIGN_SENDER_SECRET };
}

export function esignSenderConfigured(env: EsignSenderEnv): boolean {
  return Boolean(env.webhookUrl && env.secret);
}

export interface EsignEmail {
  to: string;
  subject: string;
  text: string;
}

export type SendResult = { sent: true } | { sent: false; reason: string };

export async function deliverEsignEmail(
  email: EsignEmail,
  env: EsignSenderEnv = esignSenderEnv()
): Promise<SendResult> {
  if (!esignSenderConfigured(env)) {
    return { sent: false, reason: "sender not configured (ESIGN_SENDER_WEBHOOK_URL/SECRET unset)" };
  }
  try {
    const res = await fetch(env.webhookUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-esign-secret": env.secret! },
      body: JSON.stringify(email),
    });
    if (!res.ok) return { sent: false, reason: `sender webhook ${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: `sender webhook error: ${(err as Error).message}` };
  }
}

// --- email copy (pure builders, tested) -----------------------------------

export function signingLinkEmail(args: {
  signerName: string;
  documentTitle: string;
  link: string;
  expiresAtIso: string;
  resend?: boolean;
}): Omit<EsignEmail, "to"> {
  const first = args.signerName.split(/\s+/)[0] || "there";
  const expires = args.expiresAtIso.slice(0, 10);
  return {
    subject: `${args.resend ? "Reminder: " : ""}${args.documentTitle} — ready for your signature`,
    text:
      `Hi ${first},\n\n` +
      `Your agreement "${args.documentTitle}" is ready to review and sign electronically:\n\n` +
      `${args.link}\n\n` +
      `The link is unique to you and expires on ${expires}. Review the full document, ` +
      `then sign directly on the page (phone or computer both work). You'll receive a ` +
      `copy of the completed agreement for your records.\n\n` +
      `Questions? Just reply to this email.\n\n` +
      `Rob Acheson\nMy Local Everything`,
  };
}

export function signedCopyEmail(args: {
  signerName: string;
  documentTitle: string;
  downloadUrl: string;
  signedAtIso: string;
}): Omit<EsignEmail, "to"> {
  // Rob, 2026-08-07: "if only Alex has signed, you should not say completed and
  // all that other bullshit. Its incorrect if I havent Countersigned it yet."
  // One party has signed here, by definition — this email fires from the signer
  // route. Saying "completed agreement" is simply false at this moment, and the
  // counterparty is one of the recipients. State the real state, and say what
  // happens next so nobody has to ask.
  return {
    subject: `Signed: ${args.documentTitle}`,
    text:
      `${args.documentTitle} was signed by ${args.signerName} on ` +
      `${args.signedAtIso.slice(0, 10)} (UTC).\n\n` +
      `This is not yet fully executed — My Local Everything still has to ` +
      `countersign. Both parties receive the executed copy as soon as that ` +
      `happens.\n\n` +
      `Download the signed copy (includes the signature & audit certificate):\n\n` +
      `${args.downloadUrl}\n\n` +
      `The link stays valid and always returns the current version, so it will ` +
      `hand back the fully executed agreement once countersigning is complete.\n\n` +
      `My Local Everything`,
  };
}

export const ROB_COPY_ADDRESS = "rob@aivoicetech.io"; // identity rule — never boostuppayments

// Both signatures on the paper (Rob 2026-08-07: "when Both people sign, do I
// get another email showing Completed"). Sent to the counterparty AND MLE at
// countersignature — the moment the agreement is actually executed.
export function fullyExecutedEmail(args: {
  signerName: string;
  documentTitle: string;
  downloadUrl: string;
  countersignerName: string;
  countersignerTitle: string;
  executedAtIso: string;
}): Omit<EsignEmail, "to"> {
  const first = args.signerName.split(/\s+/)[0] || "there";
  return {
    subject: `Complete: ${args.documentTitle} — fully executed`,
    text:
      `Hi ${first},\n\n` +
      `"${args.documentTitle}" is now fully executed — signed by both parties ` +
      `as of ${args.executedAtIso.slice(0, 10)} (UTC).\n\n` +
      `Countersigned for My Local Everything by ${args.countersignerName}, ` +
      `${args.countersignerTitle}.\n\n` +
      `Download the fully executed agreement (both signatures + audit certificate):\n\n` +
      `${args.downloadUrl}\n\n` +
      `The link stays valid and always returns the current copy.\n\n` +
      `Rob Acheson\nMy Local Everything`,
  };
}

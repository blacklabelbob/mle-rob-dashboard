import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import {
  assistantRequestResponse,
  callerNumberFrom,
  toolCallResults,
  vapiConfigured,
  vapiEnv,
  verifyVapiSecret,
} from "@/lib/vapi";

export const dynamic = "force-dynamic";

// Vapi server-URL webhook (BUILD-QUEUE Q15). One endpoint, two jobs:
//  • assistant-request (pre-answer): pick the receptionist assistant and hand
//    it the caller's CRM context before the call is even answered.
//  • tool-calls (mid-call): crm_caller_lookup — instant caller→CRM lookup.
// Secret-checked via x-vapi-secret; no VAPI_WEBHOOK_SECRET set → 503, inert.
export async function POST(req: Request) {
  const env = vapiEnv();
  if (!vapiConfigured(env)) {
    return NextResponse.json({ error: "Vapi not configured" }, { status: 503 });
  }
  const secret = req.headers.get("x-vapi-secret") ?? "";
  if (!verifyVapiSecret(env.webhookSecret!, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let message: Record<string, unknown>;
  try {
    const body = await req.json();
    message = body?.message ?? {};
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const callerNumber = callerNumberFrom(message);

  if (message.type === "assistant-request") {
    const data = await getStore().getNetwork();
    const response = assistantRequestResponse(env, data, callerNumber);
    console.log("[vapi] assistant-request", callerNumber, JSON.stringify(response));
    return NextResponse.json(response);
  }

  if (message.type === "tool-calls") {
    const toolCalls = (message.toolCallList ??
      message.toolCalls ??
      []) as Parameters<typeof toolCallResults>[0];
    const data = await getStore().getNetwork();
    const response = toolCallResults(toolCalls, data, callerNumber);
    console.log("[vapi] tool-calls", callerNumber, JSON.stringify(response));
    return NextResponse.json(response);
  }

  // Status updates, transcripts, end-of-call reports: acknowledged, and
  // end-of-call logged so call artifacts are recoverable from Vercel logs
  // until the activities table lands with Q9.
  if (message.type === "end-of-call-report") {
    console.log("[vapi] end-of-call-report", JSON.stringify(message));
  }
  return NextResponse.json({ ok: true });
}

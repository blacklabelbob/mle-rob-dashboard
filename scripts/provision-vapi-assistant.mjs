#!/usr/bin/env node
// Provision the MLE receptionist assistant in Vapi — BUILD-QUEUE Q15 (HYBRID).
// The assistant is defined HERE in code (CR-3), not clicked together in Vapi's
// dashboard: one idempotent run creates it (or updates it in place by name)
// the moment VAPI_API_KEY lands, and prints the VAPI_ASSISTANT_ID to set in
// Vercel. Without a key it explains exactly what's missing and exits 1 —
// nothing anywhere changes.
// Usage: node scripts/provision-vapi-assistant.mjs   (reads .env.local)
import { readFileSync, existsSync } from "node:fs";

export const ASSISTANT_NAME = "MLE Receptionist";
export const TOOL_NAME = "crm_caller_lookup"; // must match lib/vapi.ts toolCallResults
export const DEFAULT_SERVER_URL =
  "https://mle-rob-dashboard.vercel.app/api/webhooks/vapi";

// The full assistant definition. Pure so tests can pin it against the webhook
// handler; variable names in the prompt must be keys callerContext() emits.
export function assistantPayload({
  serverUrl = DEFAULT_SERVER_URL,
  webhookSecret,
  model = process.env.VAPI_MODEL || "claude-sonnet-4-5-20250929",
  modelProvider = process.env.VAPI_MODEL_PROVIDER || "anthropic",
} = {}) {
  return {
    name: ASSISTANT_NAME,
    // Human-first: Vapi only answers when the rep didn't, so open accordingly.
    firstMessage:
      "Hi, you've reached AI VoiceTech — the team's on another call, but I'm their assistant and I can help right now. Who am I speaking with?",
    firstMessageMode: "assistant-speaks-first",
    model: {
      provider: modelProvider,
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are the phone receptionist and rep assistant for AI VoiceTech (Rob Acheson's team). You answer inbound calls the human rep missed.",
            "",
            "Caller context is pre-loaded when we recognize the number: callerKnown={{callerKnown}}, name {{callerName}}, business {{callerBusiness}}, status {{callerStatus}}, referred by {{referredBy}}, assigned rep {{assignedRep}}.",
            "If callerKnown is true, greet them BY NAME and speak like you know the relationship — never make them re-explain who they are.",
            `If callerKnown is false, or the caller mentions a different callback number, use the ${TOOL_NAME} tool with their phone number to pull their CRM record instantly.`,
            "",
            "Your job on every call: (1) find out who's calling and why, (2) capture anything actionable — callback number, best time, what they need — and (3) promise the right follow-up from the team. Keep answers short and natural; one question at a time. Never invent pricing, commitments, or availability. If the caller asks for something only a human can do, take a detailed message and say the rep will call back shortly.",
          ].join("\n"),
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description:
              "Look up a caller in the CRM by phone number. Returns who they are, their business, status, who referred them, and their assigned rep.",
            parameters: {
              type: "object",
              properties: {
                phoneNumber: {
                  type: "string",
                  description:
                    "The caller's phone number, any format (defaults to the live caller's number if omitted).",
                },
              },
            },
          },
        },
      ],
    },
    voice: { provider: "vapi", voiceId: "Paige" },
    // One server URL for everything; secret must equal VAPI_WEBHOOK_SECRET in
    // Vercel or the webhook 403s (verifyVapiSecret in lib/vapi.ts).
    server: webhookSecret
      ? { url: serverUrl, secret: webhookSecret }
      : { url: serverUrl },
    serverMessages: ["tool-calls", "end-of-call-report"],
  };
}

async function vapi(key, path, init = {}) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Vapi ${init.method || "GET"} ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  // Minimal .env.local loader, same pattern as regen-fallback.mjs.
  if (!process.env.VAPI_API_KEY) {
    const envPath = new URL("../.env.local", import.meta.url);
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      }
    }
  }
  const key = process.env.VAPI_API_KEY;
  if (!key) {
    console.error(
      "VAPI_API_KEY not set (need a Vapi account — the PING-INBOX ask to Rob). Add it to .env.local and re-run; this script is a no-op until then."
    );
    process.exit(1);
  }
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "VAPI_WEBHOOK_SECRET not set — the assistant's server.secret must match the one the webhook verifies. Set the same value in .env.local AND Vercel prod, then re-run."
    );
    process.exit(1);
  }
  const payload = assistantPayload({
    serverUrl: process.env.VAPI_SERVER_URL || DEFAULT_SERVER_URL,
    webhookSecret: secret,
  });

  const existing = (await vapi(key, "/assistant")).find(
    (a) => a.name === ASSISTANT_NAME
  );
  const saved = existing
    ? await vapi(key, `/assistant/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
    : await vapi(key, "/assistant", {
        method: "POST",
        body: JSON.stringify(payload),
      });

  console.log(`${existing ? "Updated" : "Created"} "${ASSISTANT_NAME}" → ${saved.id}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Set VAPI_ASSISTANT_ID=${saved.id} in .env.local and Vercel prod (with VAPI_WEBHOOK_SECRET).`);
  console.log(`  2. Import the Twilio number into Vapi (SIP) and point its inbound to this assistant / assistant-request → ${payload.server.url}`);
  console.log(`  3. Live-call DoD: call the number, let it ring past the rep, verify the assistant answers with CRM context.`);
}

// Only run when executed directly — vitest imports assistantPayload without side effects.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

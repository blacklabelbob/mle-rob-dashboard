import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { heuristicEstimate } from "@/lib/estimator";
import { getStore } from "@/lib/storage";
import type { Estimate } from "@/lib/types";

export const dynamic = "force-dynamic";

// Key-gated: with ANTHROPIC_API_KEY set this is Claude-powered; without it the
// transparent heuristic keeps the feature alive (no-stall rule).
async function claudeEstimate(description: string): Promise<Estimate> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 700,
    system: [
      "You estimate the total contribution of a person to a B2B services network business.",
      "The business sells 'Phase One' AI/automation packages to local businesses at",
      "$10,000 upfront + $1,000/month recurring (~$22k year-one value per signed deal),",
      "across roofing, medical, title/real-estate, and payment processing, growing through referrals.",
      "A person is worth: direct revenue THEY pay + aggregate revenue behind doors they can open.",
      "Return STRICT JSON: {\"estRevenue\": number (USD aggregate), \"estNewNodes\": number,",
      "\"probability\": number 0-1, \"reasoning\": string (2-4 sentences, concrete)}.",
      "Be directionally honest, not promotional. Discount unscheduled intros.",
    ].join(" "),
    messages: [{ role: "user", content: description }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return {
    estRevenue: Number(json.estRevenue) || 0,
    estNewNodes: Number(json.estNewNodes) || 0,
    probability: Math.min(Math.max(Number(json.probability) || 0, 0), 1),
    reasoning: String(json.reasoning ?? ""),
    source: "claude",
    estimatedAt: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  let body: { personId?: string; description?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const { personId, description } = body;
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: "description too short" }, { status: 400 });
  }

  let estimate: Estimate | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      estimate = await claudeEstimate(description);
    } catch {
      // fall through to heuristic — the estimator never hard-fails
    }
  }
  estimate = estimate ?? heuristicEstimate(description);

  // Persist onto the person when we can; report honestly when we can't
  // (e.g. file store on a read-only Vercel deploy).
  let persisted = false;
  if (personId) {
    try {
      const store = getStore();
      const data = await store.getNetwork();
      const person = data.people.find((p) => p.id === personId);
      if (person) {
        await store.upsertPerson({ ...person, description, estimate });
        persisted = true;
      }
    } catch (err) {
      console.error("[estimate] not persisted:", err);
    }
  }

  return NextResponse.json({ ...estimate, persisted });
}

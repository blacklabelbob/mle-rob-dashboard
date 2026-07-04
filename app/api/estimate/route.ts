import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { heuristicEstimate } from "@/lib/estimator";
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
      "The business sells ~$5k 'Phase One' AI/automation packages to local businesses",
      "(roofing, medical, title/real-estate, payment processing) and grows through referrals.",
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
  const { description } = (await req.json()) as {
    personId?: string;
    description?: string;
  };
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: "description too short" }, { status: 400 });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return NextResponse.json(await claudeEstimate(description));
    } catch {
      // fall through to heuristic — the estimator never hard-fails
    }
  }
  return NextResponse.json(heuristicEstimate(description));
}

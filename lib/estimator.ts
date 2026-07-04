import type { Estimate } from "@/lib/types";

// v1 heuristic estimator — deliberately transparent. The Claude-powered path in
// /api/estimate replaces this when ANTHROPIC_API_KEY is set (Phase 2.1 makes it default).
// Rob's pricing (2026-07-04): Phase One = $10,000 upfront + $1,000/mo.
// Year-one value of a signed deal ≈ $22k; a warm company intro carries roughly
// two deals' worth of aggregate downstream revenue.
const AVG_DEAL = 22000;
const AVG_DOOR_VALUE = 44000;

const COMPANY_HINT = /\b([A-Z][a-zA-Z]+(?:Tech|Logic|Sync|Soft|ware|ia))\b/g;

export function heuristicEstimate(description: string): Estimate {
  const text = description.toLowerCase();

  // Count doors: named companies + explicit "walk us into / intro" phrasing
  const named = new Set(
    (description.match(COMPANY_HINT) ?? []).map((m) => m.toLowerCase())
  );
  const listMentions = (description.match(/,\s*[A-Z][\w&\s]{2,20}(?=[,—-])/g) ?? []).length;
  const doors = Math.max(named.size, listMentions);

  // Signal scoring for probability
  let prob = 0.25;
  if (/never turns down|always says yes|loves us|best friend/.test(text)) prob += 0.15;
  if (/#1|top referr|brings so much business/.test(text)) prob += 0.1;
  if (/signed|paying|client/.test(text)) prob += 0.15;
  if (/free|no charge/.test(text)) prob += 0.05; // reciprocity working
  if (doors >= 3) prob += 0.05;
  prob = Math.min(prob, 0.9);

  const directDeal = /signed|quoted|paying/.test(text) ? AVG_DEAL : 0;
  const estRevenue = directDeal + Math.max(doors, 1) * AVG_DOOR_VALUE;
  const estNewNodes = Math.max(doors * 3, 2); // each door ≈ company + 2 people inside

  const reasoning =
    `Heuristic v1: detected ~${doors || 1} door(s) worth ~$${AVG_DOOR_VALUE / 1000}k aggregate each` +
    (directDeal ? `, plus a direct deal near the $${AVG_DEAL / 1000}k Phase One anchor` : "") +
    `. Probability ${Math.round(prob * 100)}% from relationship-strength signals in the description. ` +
    `Claude-powered estimate replaces this when the API key is wired (PRD 2.1).`;

  return {
    estRevenue,
    estNewNodes,
    probability: Number(prob.toFixed(2)),
    reasoning,
    source: "heuristic",
    estimatedAt: new Date().toISOString(),
  };
}

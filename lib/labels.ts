// Human-facing labels for node types (Rob 2026-07-17: "Change lead selfgen to Self-Gen Lead").
// DB keeps stable slugs; the UI speaks sales language. One map, used everywhere.

import type { DealStage } from "./types";

export const TYPE_LABELS: Record<string, string> = {
  "mle-admin": "MLE Admin",
  partner: "Partner",
  lead: "Lead",
  client: "Client",
  connector: "Connector",
  "vertical-anchor": "Vertical Anchor",
  "rep-candidate": "Rep Candidate",
};

export function typeLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return TYPE_LABELS[t] ?? t.replace(/-/g, " ");
}

// Deal-stage labels: one definition for every surface that shows the ladder
// (the board, the MC.12 ops panels). Keys are the canonical DEAL_STAGES slugs.
export const STAGE_LABELS: Record<DealStage, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  meeting_booked: "Meeting booked",
  meeting_held: "Meeting held",
  quote_sent: "Quote sent",
  negotiating: "Negotiating",
  signed: "Signed",
  invoiced: "Invoiced",
  paid: "Paid",
  delivering: "Delivering",
  stalled: "Stalled",
  lost: "Lost",
};

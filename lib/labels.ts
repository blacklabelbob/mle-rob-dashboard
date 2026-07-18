// Human-facing labels for node types (Rob 2026-07-17: "Change lead selfgen to Self-Gen Lead").
// DB keeps stable slugs; the UI speaks sales language. One map, used everywhere.

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

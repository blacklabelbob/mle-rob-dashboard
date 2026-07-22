// Q21 (Rob direct ask 2026-07-22) — AI voice-law monitor → Overview Alerts.
// The "AI Voice Call Law Monitor" n8n workflow (weekly RSS poll of FCC / FTC /
// TCPAWorld / JD Supra / NatLawReview, keyword-filtered to AI-voice &
// telemarketing law) POSTs its flagged items to /api/webhooks/voice-law, and
// this module maps them to flags-ledger rows so they surface in the Overview
// "Things to Address" digest — ONLY when there are changes (Rob: "IF theres
// changes"; no items → no rows → the section renders nothing).
//
// Pure per CR-3: no network, no clock. Idempotency: the flag title is the
// item's own headline — the monitor's 8-day RSS window overlaps its weekly
// runs, so the same article WILL be re-posted; title-dedupe against the
// ledger (done by the route, same contract as /api/webhooks/n8n-error)
// keeps it to one flag per story ever.

export interface LawMonitorItem {
  title?: string;
  link?: string;
  published?: string;
  source?: string;
  matched_keyword?: string;
  snippet?: string;
}

export interface LawFlag {
  title: string;
  detail: string;
  severity: "medium";
}

// n8n's HTTP Request node may send one item per call, a bare array, or an
// aggregated { items: [...] } body — accept all three shapes.
export function lawItemsFromPayload(body: unknown): LawMonitorItem[] {
  if (Array.isArray(body)) return body.filter(isItemShaped);
  if (body && typeof body === "object") {
    const items = (body as { items?: unknown }).items;
    if (Array.isArray(items)) return items.filter(isItemShaped);
    if (isItemShaped(body)) return [body as LawMonitorItem];
  }
  return [];
}

function isItemShaped(v: unknown): v is LawMonitorItem {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as LawMonitorItem).title === "string" &&
    (v as LawMonitorItem).title!.trim().length > 0
  );
}

export function lawFlagTitle(itemTitle: string): string {
  // Stable across re-posts (no date component) — the headline IS the identity.
  const clean = itemTitle.trim().replace(/\s+/g, " ");
  return `Voice-law update: ${clean.length > 160 ? clean.slice(0, 157) + "..." : clean}`;
}

export function lawItemToFlag(item: LawMonitorItem): LawFlag {
  const source = item.source?.trim() || "unknown source";
  const published = item.published
    ? item.published.slice(0, 10)
    : "date unknown";
  const parts = [
    `${source} · ${published}`,
    item.matched_keyword ? `matched: "${item.matched_keyword}"` : null,
    item.snippet?.trim() || null,
    item.link?.trim() || null,
  ].filter(Boolean);
  return {
    title: lawFlagTitle(item.title!),
    // detail carries source | date | keyword | snippet | link — the link is the
    // last line so the UI (and Rob, via hover/entity page) can reach the story.
    detail: parts.join("\n"),
    severity: "medium",
  };
}

// Q21 (Rob direct ask 2026-07-22) — AI voice-law monitor → Overview Alerts.
// The "AI Voice Call Law Monitor" n8n workflow (weekly RSS poll of FCC / FTC /
// TCPAWorld / JD Supra / NatLawReview, keyword-filtered to AI-voice &
// telemarketing law) POSTs its flagged items to /api/webhooks/voice-law, and
// this module maps them to flags-ledger rows so they surface in the Overview
// "Things to Address" digest — ONLY when there are changes (Rob: "IF theres
// changes"; no items → no rows → the section renders nothing).
//
// NARROWED 2026-07-27 (Rob dev-chat #50, verbatim): "on the overview page we DO
// NOT NEED any of those Voice Law notes. I dont care about the law unless theres
// been an actual full change in the legal status of Voice AI." So the ledger is
// no longer fed by keyword-matched law NEWS — an item now has to clear
// isLegalStatusChange(): it must be about AI/synthetic voice calling AND carry a
// status-change event (enacted / effective / adopted final rule / court ruling /
// ban). Commentary, settlements, "what you should know" explainers, and general
// TCPA litigation coverage are dropped silently.
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

// --- Rob's bar: "an actual full change in the legal status of Voice AI" ------
// Both halves must be present in the item's own words (title + snippet +
// matched keyword). One half alone is exactly the noise Rob rejected: a voice-AI
// think-piece with no change, or a real rule change about something unrelated.

// Half 1 — it is about AI / synthetic voice on the phone.
const VOICE_AI_TERMS = [
  "ai voice",
  "ai-voice",
  "ai-generated voice",
  "ai generated voice",
  "artificial voice",
  "synthetic voice",
  "voice clon", // cloning / cloned
  "voice ai",
  "ai calling",
  "ai caller",
  "ai call",
  "ai robocall",
  "robocall",
  "artificial or prerecorded voice",
  "prerecorded voice",
  "voicebot",
  "voice bot",
  "conversational ai",
];

// Half 2 — the legal status actually MOVED (not "may", not "proposed", not
// commentary). Proposals are deliberately excluded: a proposed rule is not a
// change in status.
const STATUS_CHANGE_TERMS = [
  "signed into law",
  "enacted",
  "enacts",
  "takes effect",
  "took effect",
  "goes into effect",
  "effective date",
  "now effective",
  "adopts final rule",
  "adopted final rule",
  "final rule",
  "declaratory ruling",
  "issues order",
  "issued an order",
  "adopts rules",
  "adopted rules",
  "new rule",
  "new law",
  "passes law",
  "passed law",
  "bans ",
  "banned",
  "ban on",
  "prohibits",
  "outlaws",
  "legalizes",
  "supreme court rules",
  "court strikes down",
  "struck down",
  "upholds",
  "upheld",
  "vacates",
  "vacated",
  "repeals",
  "repealed",
  "amends the tcpa",
  "amended the tcpa",
];

function haystack(item: LawMonitorItem): string {
  return [item.title, item.snippet, item.matched_keyword]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Rob's gate (dev-chat #50): only a real change in the legal status of voice AI
 * earns a spot on his Overview. Everything else — settlements, enforcement
 * roundups, law-firm explainers, proposed rules — returns false and never
 * reaches the ledger.
 */
export function isLegalStatusChange(item: LawMonitorItem): boolean {
  const text = haystack(item);
  if (!text) return false;
  const aboutVoiceAi = VOICE_AI_TERMS.some((t) => text.includes(t));
  if (!aboutVoiceAi) return false;
  return STATUS_CHANGE_TERMS.some((t) => text.includes(t));
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

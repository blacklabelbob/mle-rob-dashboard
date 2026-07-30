// Q46 R7 inc.1 (rep cockpit wiring, research §5 Δ7) — the pure seam behind the
// "Present" shelf: the right asset for THIS account, filtered by vertical and
// stage, resolved before anything renders.
//
// WHY A CONFIG TABLE AND NOT A CONTENT SYSTEM (research §2.6 + §4): Highspot and
// Seismic solve a 500-rep problem. A 3-person shop needs the PATTERN — vertical
// × stage → asset — and the assets themselves live where they already live
// (Drive, /public, the live demo). When a deck is updated the link does not
// change, so there is no version drift in front of a prospect.
//
// THE LOAD-BEARING RULE HERE IS THAT A DEAD LINK NEVER RENDERS. This shelf's
// failure mode is not a wrong tint or a missing sentence — it is a rep clicking
// "Roofing demo deck" WITH THE PROSPECT WATCHING and landing on a 404. That is
// worse than having no shelf at all, because the shelf promised. So a URL we do
// not have is modelled as a FIRST-CLASS STATE, never as an empty string, and
// `assetViewsFor` is pinned to emit no href for it.
//
// AND THAT STATE IS OURS, NOT THE REP'S. Research open question #3 ("are the
// vertical demo decks in Drive today, and is a link-out acceptable for v1? Need
// the canonical URLs to seed config/collateral.ts") is still unanswered by Rob,
// so most of this table ships DECLARED BUT UNLINKED on purpose. The honest
// render is "we owe you this link", not a hidden row — hiding it hides the gap,
// and the rep would go on believing MLE has no roofing deck.
//
// THREE OUTCOMES, NEVER TWO (R2's `repBandState`, R10's door state, R6's draft
// state, one surface over): `ready` / `awaiting_link` / `not_yet` are three
// different instructions — "present it" / "ping us for the link" / "this client
// does not have one yet". Collapsing the last two would tell a rep that a
// Growth Scan we have not run is a broken link, and that a broken link is
// something they should wait on.

import type { DealStage } from "../types";
import { STAGE_LABELS } from "../labels";
import { DEMO_LINK } from "./emailTemplates";

/**
 * Stages at which a delivery artifact exists to present. Signed onward — before
 * signature there is nothing delivered, and research §2.6 pins the Growth Scan
 * as "pinned collateral on every account from Signed onward".
 *
 * `stalled` and `lost` are deliberately absent: a stalled pre-sale deal has no
 * delivered artifact, and if a signed customer stalls their stage says so
 * elsewhere. Sales assets (below) are offered at EVERY stage, including these
 * two, because a stalled deal is exactly when a rep re-sends the demo.
 */
export const DELIVERED_STAGES: readonly DealStage[] = [
  "signed",
  "invoiced",
  "paid",
  "delivering",
];

export interface CollateralAsset {
  id: string;
  /** What the rep sees on the shelf. */
  label: string;
  /** One sentence: what this is FOR. A shelf of unlabelled links is a folder. */
  purpose: string;
  /**
   * Stages this asset is offered at. `undefined` = every stage, which is the
   * right default for a sales asset — a demo link is as useful on a stalled
   * deal as on a new one.
   */
  stages?: readonly DealStage[];
  /**
   * Verticals this asset is scoped to. `undefined` = generic. A vertical-scoped
   * asset wins over a generic one, same deterministic rule as `templatesFor`.
   */
  verticals?: readonly string[];
  /**
   * The canonical URL. `undefined` means WE DO NOT HAVE IT YET and the shelf
   * says so — it does NOT mean hide the row, and it must never become "".
   */
  url?: string;
  /**
   * True when the asset belongs to ONE account and its link can only come from
   * that account's record — never from this table. See `resolveAsset`: this
   * flag is what makes cross-account leakage structurally impossible rather
   * than merely unlikely.
   */
  perAccount?: boolean;
}

/**
 * The shelf. Small on purpose, and mostly unlinked on purpose — see the header:
 * the canonical deck URLs are Rob's answer to research open question #3 and are
 * not invented here. An invented URL is a 404 in front of a prospect wearing our
 * name; an admitted gap is a five-minute ask.
 */
export const COLLATERAL: readonly CollateralAsset[] = [
  {
    id: "live-demo",
    label: "Live demo",
    purpose: "The working system, no deck. Open it on the call.",
    url: DEMO_LINK,
  },
  {
    id: "deck-roofing",
    label: "Roofing demo deck",
    purpose: "The missed-call leak, priced, for a roofing shop.",
    verticals: ["roofing"],
  },
  {
    id: "deck-title",
    label: "Title / real-estate deck",
    purpose: "The two-sided angle — their office, plus a tool for their agents.",
    verticals: ["title"],
  },
  {
    id: "one-pager",
    label: "MLE one-pager",
    purpose: "What we do, on one page, to forward internally after a meeting.",
  },
  {
    id: "growth-scan",
    label: "Their AI Growth Scan",
    purpose:
      "This customer's own tech-stack scan — the P1 deliverable and the opening for the Top Automations conversation.",
    stages: DELIVERED_STAGES,
    perAccount: true,
  },
];

/** Per-account links the caller reads off the record it is already rendering. */
export interface CollateralContext {
  /** `Person.verticalId` — the slug, not the display name. */
  verticalId: string;
  /** Stage of the anchored deal. Absent = no anchored deal on this record. */
  stage?: DealStage;
  /**
   * This account's own artifact links, keyed by asset id. Only `perAccount`
   * assets read from here. Absent key = not produced yet, which is a fact worth
   * telling, not an error.
   */
  accountUrls?: Readonly<Record<string, string | undefined>>;
}

export type CollateralState = "ready" | "awaiting_link" | "not_yet";

export interface CollateralView {
  id: string;
  label: string;
  purpose: string;
  state: CollateralState;
  /** Populated EXACTLY when `state === "ready"`. Never "" — see `resolveAsset`. */
  url?: string;
  /** Rep-readable reason this cannot be presented. Empty exactly when ready. */
  blocker?: string;
}

/**
 * Assets offered for this context, vertical-scoped first.
 *
 * NO DEAL IS NOT STAGE ZERO. A record with no anchored deal gets the assets that
 * carry no stage restriction, and NOTHING from `DELIVERED_STAGES` — we have not
 * delivered anything to someone who has not signed. `hasDeal` is returned so the
 * surface can say "no deal yet" rather than implying a stage nobody set (same
 * refusal as R5's stage chip and R6's draft picker).
 */
export function assetsFor(ctx: CollateralContext): {
  hasDeal: boolean;
  assets: CollateralAsset[];
} {
  const offered = COLLATERAL.filter(
    (a) => !a.stages || (ctx.stage !== undefined && a.stages.includes(ctx.stage)),
  );
  const scoped = offered.filter((a) => a.verticals?.includes(ctx.verticalId));
  const generic = offered.filter((a) => !a.verticals);
  return { hasDeal: ctx.stage !== undefined, assets: [...scoped, ...generic] };
}

/**
 * A URL we would actually hand a prospect, or nothing.
 *
 * Whitespace-only and empty strings resolve to nothing rather than to a link,
 * because a config typo (`url: " "`) would otherwise render an anchor to the
 * current page — a click that silently does nothing while the prospect watches
 * is indistinguishable from broken software.
 */
function usableUrl(raw: string | undefined): string | undefined {
  const url = (raw ?? "").trim();
  return url || undefined;
}

/**
 * Resolve one asset against one account.
 *
 * A `perAccount` asset NEVER reads `asset.url`. That is not a stylistic
 * preference: the Growth Scan is one customer's own scan, and a table-level
 * fallback would show customer A's scan on customer B's account — our worst
 * possible data incident, done by a rep in good faith with a prospect on the
 * line. The flag makes the fallback unreachable instead of merely unwritten.
 */
export function resolveAsset(asset: CollateralAsset, ctx: CollateralContext): CollateralView {
  const base = { id: asset.id, label: asset.label, purpose: asset.purpose };

  if (asset.perAccount) {
    const url = usableUrl(ctx.accountUrls?.[asset.id]);
    if (url) return { ...base, state: "ready", url };
    return {
      ...base,
      state: "not_yet",
      // No "nothing is broken" reassurance, and no interpolated label: the
      // sentence a rep reads mid-call has to land in one pass, and denying a
      // problem is how you plant one. It says what is true and what to do.
      blocker: "This account does not have one yet. Nothing to fix — just do not promise it on the call.",
    };
  }

  const url = usableUrl(asset.url);
  if (url) return { ...base, state: "ready", url };
  return {
    ...base,
    state: "awaiting_link",
    blocker:
      "We have not given you a link for this yet — that is ours to fix, not yours. Ask Rob for the file and it appears here for everyone.",
  };
}

/**
 * The whole shelf for one account, resolved.
 *
 * Every offered asset comes back, including the ones we cannot link. A shelf
 * that silently drops what it cannot serve teaches a rep that MLE has no
 * roofing deck; a shelf that names the gap gets the gap closed.
 */
export function collateralViewsFor(ctx: CollateralContext): {
  hasDeal: boolean;
  stageLabel?: string;
  views: CollateralView[];
} {
  const { hasDeal, assets } = assetsFor(ctx);
  return {
    hasDeal,
    stageLabel: ctx.stage ? STAGE_LABELS[ctx.stage] : undefined,
    views: assets.map((a) => resolveAsset(a, ctx)),
  };
}

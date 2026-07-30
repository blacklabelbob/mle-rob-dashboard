// Q46 R7 inc.1 — the collateral shelf, graded before it renders.
//
// The defect this file exists to make impossible: a rep clicks an asset ON A
// CALL and lands nowhere. So the pins here are mostly about the ABSENCE of a
// url, not the presence of one — every non-ready state must carry a sentence and
// must carry no href.

import { describe, expect, it } from "vitest";
import {
  COLLATERAL,
  DELIVERED_STAGES,
  assetsFor,
  collateralViewsFor,
  resolveAsset,
  type CollateralAsset,
} from "../collateral";
import { DEMO_LINK } from "../emailTemplates";
import { STAGE_LABELS } from "../../labels";
import type { DealStage } from "../../types";

const ALL_STAGES = Object.keys(STAGE_LABELS) as DealStage[];

describe("collateral config integrity", () => {
  it("has unique ids", () => {
    const ids = COLLATERAL.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never carries an empty-or-blank url — undefined is the way to say 'no link'", () => {
    for (const asset of COLLATERAL) {
      if (asset.url !== undefined) expect(asset.url.trim()).not.toBe("");
    }
  });

  it("gives every asset a purpose sentence — a shelf of bare links is a folder", () => {
    for (const asset of COLLATERAL) {
      expect(asset.purpose.trim().length).toBeGreaterThan(10);
    }
  });

  it("never puts a table-level url on a per-account asset", () => {
    // Belt to resolveAsset's braces: even if someone adds one, it is unreadable,
    // but config that LOOKS like a shared Growth Scan invites the next mistake.
    for (const asset of COLLATERAL) {
      if (asset.perAccount) expect(asset.url).toBeUndefined();
    }
  });

  it("keeps the live demo pointed at the one canonical demo url", () => {
    const demo = COLLATERAL.find((a) => a.id === "live-demo");
    expect(demo?.url).toBe(DEMO_LINK);
  });
});

describe("assetsFor — selection", () => {
  it("offers no delivered artifact when there is no anchored deal", () => {
    const { hasDeal, assets } = assetsFor({ verticalId: "roofing" });
    expect(hasDeal).toBe(false);
    expect(assets.some((a) => a.id === "growth-scan")).toBe(false);
  });

  it("offers the Growth Scan from signed onward and not before", () => {
    for (const stage of ALL_STAGES) {
      const { assets } = assetsFor({ verticalId: "roofing", stage });
      const offered = assets.some((a) => a.id === "growth-scan");
      expect(offered).toBe(DELIVERED_STAGES.includes(stage));
    }
  });

  it("still offers sales assets on a stalled or lost deal — that is when they get re-sent", () => {
    for (const stage of ["stalled", "lost"] as DealStage[]) {
      const { assets } = assetsFor({ verticalId: "roofing", stage });
      expect(assets.map((a) => a.id)).toContain("live-demo");
      expect(assets.map((a) => a.id)).toContain("deck-roofing");
    }
  });

  it("puts the vertical-scoped asset ahead of the generic ones, deterministically", () => {
    const { assets } = assetsFor({ verticalId: "roofing", stage: "contacted" });
    expect(assets[0]?.id).toBe("deck-roofing");
    expect(assets.every((a) => !a.verticals || a.verticals.includes("roofing"))).toBe(true);
  });

  it("shows another vertical's deck to nobody", () => {
    const { assets } = assetsFor({ verticalId: "title", stage: "contacted" });
    expect(assets.map((a) => a.id)).toContain("deck-title");
    expect(assets.map((a) => a.id)).not.toContain("deck-roofing");
  });

  it("gives an unknown vertical the generic shelf rather than an empty one", () => {
    const { assets } = assetsFor({ verticalId: "medical", stage: "contacted" });
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((a) => !a.verticals)).toBe(true);
  });
});

describe("resolveAsset — a dead link never renders", () => {
  const ctx = { verticalId: "roofing", stage: "contacted" as DealStage };

  it("resolves an asset we have a link for", () => {
    const view = resolveAsset(COLLATERAL.find((a) => a.id === "live-demo")!, ctx);
    expect(view.state).toBe("ready");
    expect(view.url).toBe(DEMO_LINK);
    expect(view.blocker).toBeUndefined();
  });

  it("reports an unlinked asset as ours to fix, with no url", () => {
    const view = resolveAsset(COLLATERAL.find((a) => a.id === "deck-roofing")!, ctx);
    expect(view.state).toBe("awaiting_link");
    expect(view.url).toBeUndefined();
    expect(view.blocker).toMatch(/ours to fix/i);
  });

  it("treats a whitespace-only url as no url at all", () => {
    const typo: CollateralAsset = { id: "x", label: "X", purpose: "A typo'd config row.", url: "   " };
    const view = resolveAsset(typo, ctx);
    expect(view.state).toBe("awaiting_link");
    expect(view.url).toBeUndefined();
  });

  it("NEVER falls back to a table url for a per-account asset — that would show one client's scan on another's account", () => {
    const leaky: CollateralAsset = {
      id: "growth-scan",
      label: "Their AI Growth Scan",
      purpose: "Per-account artifact.",
      perAccount: true,
      url: "https://example.com/some-other-customers-scan.pdf",
    };
    const view = resolveAsset(leaky, { verticalId: "roofing", stage: "signed" });
    expect(view.state).toBe("not_yet");
    expect(view.url).toBeUndefined();
  });

  it("reads a per-account asset only from this account's own links", () => {
    const asset = COLLATERAL.find((a) => a.id === "growth-scan")!;
    const view = resolveAsset(asset, {
      verticalId: "roofing",
      stage: "signed",
      accountUrls: { "growth-scan": "https://drive.example.com/scan-p1002" },
    });
    expect(view.state).toBe("ready");
    expect(view.url).toBe("https://drive.example.com/scan-p1002");
  });

  it("ignores another asset's per-account link — keys are not interchangeable", () => {
    const asset = COLLATERAL.find((a) => a.id === "growth-scan")!;
    const view = resolveAsset(asset, {
      verticalId: "roofing",
      stage: "signed",
      accountUrls: { "one-pager": "https://drive.example.com/wrong" },
    });
    expect(view.state).toBe("not_yet");
    expect(view.url).toBeUndefined();
  });

  it("says 'not produced yet' rather than 'broken' for a scan we have not run", () => {
    const view = resolveAsset(COLLATERAL.find((a) => a.id === "growth-scan")!, {
      verticalId: "roofing",
      stage: "delivering",
    });
    expect(view.state).toBe("not_yet");
    expect(view.blocker).toMatch(/does not have one yet/i);
    expect(view.blocker).not.toMatch(/broken|error|fail/i);
  });
});

describe("collateralViewsFor — the whole shelf", () => {
  it("carries a blocker sentence for every non-ready view and none for a ready one", () => {
    for (const stage of [...ALL_STAGES, undefined]) {
      for (const verticalId of ["roofing", "title", "medical"]) {
        const { views } = collateralViewsFor({ verticalId, stage });
        for (const view of views) {
          if (view.state === "ready") {
            expect(view.blocker, `${view.id} ready with a blocker`).toBeUndefined();
            expect((view.url ?? "").trim(), `${view.id} ready with no url`).not.toBe("");
          } else {
            expect(view.url, `${view.id} not ready but has a url`).toBeUndefined();
            expect((view.blocker ?? "").trim().length, `${view.id} silent refusal`).toBeGreaterThan(20);
          }
        }
      }
    }
  });

  it("never drops an offered asset — a hidden gap is a gap nobody closes", () => {
    const ctx = { verticalId: "roofing", stage: "signed" as DealStage };
    expect(collateralViewsFor(ctx).views).toHaveLength(assetsFor(ctx).assets.length);
  });

  it("hands the surface the stage in words, and says nothing when there is no deal", () => {
    expect(collateralViewsFor({ verticalId: "roofing", stage: "quote_sent" }).stageLabel).toBe(
      STAGE_LABELS.quote_sent,
    );
    expect(collateralViewsFor({ verticalId: "roofing" }).stageLabel).toBeUndefined();
  });

  it("never renders a blocker that leaks a schema name at the rep", () => {
    // R6 inc.2's rule, one shelf over: our column and key names are not
    // instructions. `growth-scan` is an id; "Their AI Growth Scan" is English.
    for (const stage of ALL_STAGES) {
      for (const view of collateralViewsFor({ verticalId: "roofing", stage }).views) {
        if (view.blocker) expect(view.blocker).not.toMatch(/[a-z]+_[a-z]+|[a-z]+-[a-z]+\b/);
      }
    }
  });
});

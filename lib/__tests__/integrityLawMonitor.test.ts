import { describe, expect, it } from "vitest";
import {
  lawFlagTitle,
  lawItemsFromPayload,
  lawItemToFlag,
} from "@/lib/integrity/lawMonitor";

// Q21 — AI voice-law monitor items → flags-ledger rows.
const ITEM = {
  matched_keyword: "tcpa",
  title: "FCC Adopts New One-to-One Consent Rule for AI Voice Calls",
  link: "https://www.fcc.gov/document/one-to-one-consent",
  published: "2026-07-20T14:00:00.000Z",
  source: "www.fcc.gov",
  snippet: "The FCC today adopted rules requiring one-to-one consent...",
};

describe("lawItemsFromPayload", () => {
  it("accepts a bare array, an { items } wrapper, and a single item", () => {
    expect(lawItemsFromPayload([ITEM])).toHaveLength(1);
    expect(lawItemsFromPayload({ items: [ITEM, ITEM] })).toHaveLength(2);
    expect(lawItemsFromPayload(ITEM)).toHaveLength(1);
  });

  it("drops items without a usable title and junk payloads", () => {
    expect(lawItemsFromPayload([{ link: "https://x.test" }, { title: "  " }])).toHaveLength(0);
    expect(lawItemsFromPayload(null)).toHaveLength(0);
    expect(lawItemsFromPayload("nope")).toHaveLength(0);
    expect(lawItemsFromPayload({ items: "nope" })).toHaveLength(0);
  });
});

describe("lawItemToFlag", () => {
  it("maps an item to a medium flag carrying source, date, keyword, snippet and link", () => {
    const flag = lawItemToFlag(ITEM);
    expect(flag.severity).toBe("medium");
    expect(flag.title).toBe(
      "Voice-law update: FCC Adopts New One-to-One Consent Rule for AI Voice Calls"
    );
    expect(flag.detail).toContain("www.fcc.gov · 2026-07-20");
    expect(flag.detail).toContain('matched: "tcpa"');
    expect(flag.detail).toContain("one-to-one consent...");
    expect(flag.detail).toContain("https://www.fcc.gov/document/one-to-one-consent");
  });

  it("is deterministic across re-posts (no date in the title = the dedupe key)", () => {
    const again = lawItemToFlag({ ...ITEM, published: "2026-07-27T09:00:00.000Z" });
    expect(again.title).toBe(lawItemToFlag(ITEM).title);
  });

  it("survives a minimal item (title only) with honest placeholders", () => {
    const flag = lawItemToFlag({ title: "Georgia mini-TCPA amended" });
    expect(flag.title).toBe("Voice-law update: Georgia mini-TCPA amended");
    expect(flag.detail).toContain("unknown source · date unknown");
  });

  it("truncates marathon headlines and collapses whitespace", () => {
    const long = "A ".repeat(200) + "end";
    const title = lawFlagTitle(long);
    expect(title.length).toBeLessThanOrEqual("Voice-law update: ".length + 160);
    expect(title.endsWith("...")).toBe(true);
    expect(lawFlagTitle("  spaced\n\nout   headline ")).toBe(
      "Voice-law update: spaced out headline"
    );
  });
});

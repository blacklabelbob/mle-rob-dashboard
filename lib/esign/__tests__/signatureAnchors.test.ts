import { describe, expect, it } from "vitest";
import {
  findSignatureAnchors,
  labelFraction,
  type PageText,
  type TextItem,
} from "../signatureAnchors";

// Q47 signature placement (Rob 2026-08-07: "On the Agreement itself it doesnt
// fill in my Signature or the Date"). These pin the ONE property that makes
// drawing on the source pages safe at all: ink is placed only at coordinates
// read off the page, and anything we cannot locate degrades to no anchor —
// which sends every caller back to certificate-only stamping.

function item(str: string, x: number, y: number, width = str.length * 5): TextItem {
  return { str, x, y, width };
}

/** The execution block as the Phase 1 engine lays it out: two headings, each
 *  with its own "Signature: ____" / "Date: ____" row on a shared baseline. */
function executionPage(pageIndex = 3): PageText {
  return {
    pageIndex,
    width: 612,
    height: 792,
    items: [
      item("PROVIDER — My Local Everything, LLC", 72, 400),
      item("Signature: ____________________", 72, 360, 200),
      item("Date: ____________", 320, 360, 120),
      item("CLIENT", 72, 280),
      item("Signature: ____________________", 72, 240, 200),
      item("Date: ____________", 320, 240, 120),
    ],
  };
}

describe("findSignatureAnchors", () => {
  it("locates both blocks and pairs each with the Date on its own baseline", () => {
    const { provider, client } = findSignatureAnchors([executionPage()]);

    expect(provider).toBeDefined();
    expect(provider!.pageIndex).toBe(3);
    expect(provider!.sigY).toBe(360);
    expect(provider!.dateX).toBe(320);
    expect(provider!.dateY).toBe(360);

    expect(client).toBeDefined();
    expect(client!.sigY).toBe(240);
    expect(client!.dateY).toBe(240);
  });

  it("binds each heading to the NEAREST signature line below it, not the first found", () => {
    // If PROVIDER grabbed the lowest line on the page it would steal the
    // client's rule and Rob's countersignature would land in Alex's block.
    const { provider } = findSignatureAnchors([executionPage()]);
    expect(provider!.sigY).toBe(360); // its own row, not the client's 240
  });

  it("ignores a mid-sentence mention of the defined term", () => {
    const page: PageText = {
      pageIndex: 0,
      width: 612,
      height: 792,
      items: [
        item("...jointly referred to as the Client, agrees to...", 72, 700),
        item("Signature: ____________________", 72, 660, 200),
      ],
    };
    // The recital is not a heading, so this page carries no execution block.
    expect(findSignatureAnchors([page])).toEqual({});
  });

  it("searches from the last page backwards so an earlier page cannot hijack it", () => {
    const decoy: PageText = {
      pageIndex: 0,
      width: 612,
      height: 792,
      items: [item("CLIENT", 72, 500), item("Signature: ______", 72, 460, 120)],
    };
    const { client } = findSignatureAnchors([decoy, executionPage(1)]);
    expect(client!.pageIndex).toBe(1); // the real execution page, not the decoy
  });

  it("reads the heading separators an UPLOADED agreement uses, not only our own em dash", () => {
    // Our generator emits "PROVIDER — ..."; a Word/Docs original of the same
    // block routinely comes through with a colon, an en dash or a hyphen.
    for (const heading of [
      "PROVIDER: My Local Everything, LLC",
      "PROVIDER – My Local Everything, LLC",
      "PROVIDER - My Local Everything, LLC",
    ]) {
      const page: PageText = {
        pageIndex: 0,
        width: 612,
        height: 792,
        items: [item(heading, 72, 400), item("Signature: ______________", 72, 360, 200)],
      };
      expect(findSignatureAnchors([page]).provider?.sigY, heading).toBe(360);
    }
  });

  it("does not let a party block ABOVE the execution block steal the other party's line", () => {
    // The regression the colon separator opens: "Client: Gulf Coast Realty"
    // in the opening party block sits above BOTH rules, so a top-down search
    // binds CLIENT to the provider's line — Alex's ink in Rob's block.
    const page: PageText = {
      pageIndex: 0,
      width: 612,
      height: 792,
      items: [
        item("Client: Gulf Coast Realty, LLC", 72, 720),
        item("PROVIDER — My Local Everything, LLC", 72, 400),
        item("Signature: ____________________", 72, 360, 200),
        item("CLIENT", 72, 280),
        item("Signature: ____________________", 72, 240, 200),
      ],
    };
    const { provider, client } = findSignatureAnchors([page]);
    expect(provider!.sigY).toBe(360);
    expect(client!.sigY).toBe(240); // its own rule, not the provider's 360
  });

  it("skips a party named BELOW the block and keeps the real anchor", () => {
    // A notice clause or footer naming the client after the rules must not win
    // and resolve to nothing — that would discard a perfectly good anchor.
    const page: PageText = {
      pageIndex: 0,
      width: 612,
      height: 792,
      items: [
        item("CLIENT", 72, 300),
        item("Signature: ____________________", 72, 260, 200),
        item("Client: notices to the address above", 72, 90),
      ],
    };
    expect(findSignatureAnchors([page]).client!.sigY).toBe(260);
  });

  it("returns no anchors when nothing can be located — the safe fallback", () => {
    const scan: PageText = {
      pageIndex: 0,
      width: 612,
      height: 792,
      items: [item("(scanned image, no extractable text)", 0, 0)],
    };
    expect(findSignatureAnchors([scan])).toEqual({});
    expect(findSignatureAnchors([])).toEqual({});
  });

  it("does not pair a Date from a different row", () => {
    const page: PageText = {
      pageIndex: 0,
      width: 612,
      height: 792,
      items: [
        item("CLIENT", 72, 300),
        item("Signature: ____________________", 72, 260, 200),
        item("Date: ____________", 320, 120, 120), // far below — a different row
      ],
    };
    const { client } = findSignatureAnchors([page]);
    expect(client!.sigY).toBe(260);
    expect(client!.dateX).toBeNull(); // date left blank rather than misplaced
  });
});

describe("labelFraction", () => {
  const measure = (s: string) => s.length; // monospace stand-in

  it("returns the share of the run occupied by the label before the rule", () => {
    // "Signature: " is 11 of 21 chars in "Signature: __________".
    expect(labelFraction("Signature: __________", measure)).toBeCloseTo(11 / 21, 5);
  });

  it("is font-size agnostic — scaling the measurer does not move the fraction", () => {
    const big = (s: string) => s.length * 7.3;
    expect(labelFraction("Signature: __________", big)).toBeCloseTo(
      labelFraction("Signature: __________", measure),
      5
    );
  });

  it("never exceeds the whole run", () => {
    expect(labelFraction("Signature:", measure)).toBeLessThanOrEqual(1);
  });

  it("yields 0 when there is no label to skip", () => {
    expect(labelFraction("__________", measure)).toBe(0);
  });
});

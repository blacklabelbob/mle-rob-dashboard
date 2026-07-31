import { describe, expect, it } from "vitest";
import { linkifyRecordIds } from "@/lib/flags/recordLinks";

/** The invariant that makes this safe to drop into a paragraph Rob reads. */
function rejoin(detail: string) {
  return linkifyRecordIds(detail)
    .map((s) => s.text)
    .join("");
}

describe("linkifyRecordIds", () => {
  it("returns nothing for empty input rather than an empty segment", () => {
    expect(linkifyRecordIds("")).toEqual([]);
  });

  it("leaves prose with no record id as one plain segment", () => {
    const text = "33 never said who the meeting was with at all.";
    expect(linkifyRecordIds(text)).toEqual([{ text }]);
  });

  it("links a bracketed org id — the exact shape inc.18 writes", () => {
    const segs = linkifyRecordIds("one is the same name plus a qualifier: Omega Title (FL) [C-2019] — confirm it");
    expect(segs).toContainEqual({ text: "C-2019", href: "/companies/C-2019" });
    expect(rejoin("one is the same name plus a qualifier: Omega Title (FL) [C-2019] — confirm it")).toBe(
      "one is the same name plus a qualifier: Omega Title (FL) [C-2019] — confirm it"
    );
  });

  it("links a person id and the org id that follows the arrow, in order", () => {
    const detail = "it names a person: Dixith Magadiev [P-1010] → C-2006 — put that person's company in Notion";
    const linked = linkifyRecordIds(detail).filter((s) => s.href);
    expect(linked).toEqual([
      { text: "P-1010", href: "/people/P-1010" },
      { text: "C-2006", href: "/companies/C-2006" },
    ]);
    expect(rejoin(detail)).toBe(detail);
  });

  it("never rewrites the prose it splits, on the full multi-line finding body", () => {
    const detail = [
      "The other 39 need a person first — 5 name a company the CRM does not match.",
      "",
      "• 2026-07-29 — Rob & Dix | MLE & Skin Cancer Detection AI Model",
      "    → “Dixith” is not a company: Dixith Magadiev [P-1010] → C-2006; do NOT create a new org",
      "• 2026-07-28 — Meeting",
      "    → Omega Title (FL) [C-2019] — confirm it is the same company",
    ].join("\n");
    expect(rejoin(detail)).toBe(detail);
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toHaveLength(3);
  });

  it("does NOT link an id embedded in a longer code — an invoice number is not a company", () => {
    // MLE-2026-100123 is a real invoice number on this CRM (Gulf Coast, paid 7/16).
    const detail = "inv MLE-2026-100123 was paid; see also ABC-2019 and C-2019-draft";
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toEqual([]);
    expect(rejoin(detail)).toBe(detail);
  });

  it("links an id sitting at the very start and the very end of the string", () => {
    expect(linkifyRecordIds("C-2019")).toEqual([{ text: "C-2019", href: "/companies/C-2019" }]);
    expect(linkifyRecordIds("confirm C-2019")).toEqual([
      { text: "confirm " },
      { text: "C-2019", href: "/companies/C-2019" },
    ]);
  });

  it("is not stateful across calls — the second call links the same as the first", () => {
    const detail = "Omega Title (FL) [C-2019] and Dix [C-2006]";
    expect(linkifyRecordIds(detail)).toEqual(linkifyRecordIds(detail));
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toHaveLength(2);
  });

  it("leaves a lowercase or malformed id alone — an id is unambiguous or it is not a link", () => {
    const detail = "c-2019 and C- and C-abc are not record ids";
    expect(linkifyRecordIds(detail).filter((s) => s.href)).toEqual([]);
    expect(rejoin(detail)).toBe(detail);
  });
});

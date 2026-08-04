import { describe, expect, it } from "vitest";
import { LEDGER_KEYS_PARAM, ledgerReadUrl, parseLedgerKeys } from "../ledgerRead";

describe("ledgerReadUrl", () => {
  it("asks for exactly the keys given", () => {
    expect(ledgerReadUrl("https://x.app", ["a", "b"])).toBe(`https://x.app/api/admin/flags?${LEDGER_KEYS_PARAM}=a,b`);
  });

  it("encodes a key containing the characters this project's keys actually use", () => {
    const url = ledgerReadUrl("https://x.app", ["wrapper-census-departure:foo.sh"]);
    expect(url).toContain("wrapper-census-departure%3Afoo.sh");
  });

  it("drops a trailing slash on the base rather than doubling it", () => {
    expect(ledgerReadUrl("https://x.app/", ["a"])).toBe(`https://x.app/api/admin/flags?${LEDGER_KEYS_PARAM}=a`);
  });

  it("de-duplicates so one key is asked for once", () => {
    expect(ledgerReadUrl("https://x.app", ["a", "a", "b"])).toBe(
      `https://x.app/api/admin/flags?${LEDGER_KEYS_PARAM}=a,b`,
    );
  });

  it("asks for the WHOLE ledger when it has no keys — never for nothing", () => {
    expect(ledgerReadUrl("https://x.app", [])).toBe("https://x.app/api/admin/flags");
    expect(ledgerReadUrl("https://x.app")).toBe("https://x.app/api/admin/flags");
    expect(ledgerReadUrl("https://x.app", [""])).toBe("https://x.app/api/admin/flags");
  });
});

describe("parseLedgerKeys", () => {
  it("reads a missing param as 'the whole ledger'", () => {
    expect(parseLedgerKeys(null)).toBeNull();
  });

  it("reads the keys asked for, trimmed and de-duplicated", () => {
    expect(parseLedgerKeys("a, b ,a")).toEqual(["a", "b"]);
  });

  it("widens rather than narrows to nothing on an empty or comma-only param", () => {
    expect(parseLedgerKeys("")).toBeNull();
    expect(parseLedgerKeys(",, ,")).toBeNull();
  });

  it("round-trips what ledgerReadUrl builds", () => {
    const keys = ["wrapper-census-departure:a.sh", "wrapper-census-departure:b.sh"];
    const url = new URL(ledgerReadUrl("https://x.app", keys));
    expect(parseLedgerKeys(url.searchParams.get(LEDGER_KEYS_PARAM))).toEqual(keys);
  });
});

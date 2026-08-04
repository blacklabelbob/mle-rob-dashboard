import { describe, expect, it } from "vitest";
import { LEDGER_KEYS_PARAM, keySurvivesTransport, ledgerReadPlan, ledgerReadUrl, parseLedgerKeys } from "../ledgerRead";
import { departureKey } from "../../integrity/wrapperClock";

// Q84 inc.167 — the un-narrowed read is a DIFFERENT read, and a caller has to be able to see that
// before it happens. These pin the distinction itself, not the URL it produces.
describe("ledgerReadPlan", () => {
  it("reports a real key list as narrowed, deduped, in order", () => {
    expect(ledgerReadPlan(["b", "a", "b"])).toEqual({ keys: ["b", "a"], narrowed: true, unaskable: [] });
  });

  it("reports every shape of 'no keys' as NOT narrowed — that is the whole-ledger read", () => {
    expect(ledgerReadPlan([])).toEqual({ keys: [], narrowed: false, unaskable: [] });
    expect(ledgerReadPlan()).toEqual({ keys: [], narrowed: false, unaskable: [] });
    expect(ledgerReadPlan([""])).toEqual({ keys: [], narrowed: false, unaskable: [] });
  });

  it("agrees with the URL it builds, so the two cannot drift about what 'empty' means", () => {
    for (const keys of [["a"], ["a", ""], [], [""], ["a", "a"]]) {
      const narrowed = ledgerReadUrl("https://x.app", keys).includes(`?${LEDGER_KEYS_PARAM}=`);
      expect(narrowed).toBe(ledgerReadPlan(keys).narrowed);
    }
  });
});

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

// Q84 inc.168 — inc.167 asked whether the key this gate FILES and the key it ASKS ABOUT are provably
// the same string. `departureKey()` makes them start identical; these pin the half that was never
// checked — that the string survives being put on a URL and parsed back by the route.
describe("a filed key and an asked key are the same string, or it is not asked", () => {
  const names = ["a.sh", "run thing.sh", "déjà.sh", "a&b.sh", "a#b.sh", "a+b.sh", "a%2Cb.sh", "a=b.sh", "a?b.sh"];

  it("round-trips every ordinary wrapper name through file → ask → parse, unchanged", () => {
    const keys = names.map((n) => departureKey(n));
    const url = new URL(ledgerReadUrl("https://x.app", keys));
    expect(parseLedgerKeys(url.searchParams.get(LEDGER_KEYS_PARAM))).toEqual(keys);
    expect(ledgerReadPlan(keys).unaskable).toEqual([]);
  });

  it("refuses to ask about a key the parser would hand back as two — the comma the route splits on", () => {
    const bad = departureKey("run,thing.sh");
    expect(keySurvivesTransport(bad)).toBe(false);
    // Sent anyway, this is what the route would have been asked — two keys nobody ever filed, and
    // the filed key mentioned by neither.
    expect(parseLedgerKeys(bad)).toEqual([
      "wrapper-census-departure:run",
      "thing.sh",
    ]);
    const plan = ledgerReadPlan([departureKey("a.sh"), bad]);
    expect(plan.keys).toEqual([departureKey("a.sh")]);
    expect(plan.unaskable).toEqual([bad]);
    // …and the URL cannot carry it either: the builder consumes the same plan.
    expect(new URL(ledgerReadUrl("https://x.app", [bad])).searchParams.get(LEDGER_KEYS_PARAM)).toBeNull();
  });

  it("refuses a key the parser would trim, and drops to the whole-ledger refusal when none survive", () => {
    const trimmed = `${departureKey("trailing.sh")} `;
    expect(keySurvivesTransport(trimmed)).toBe(false);
    expect(ledgerReadPlan([trimmed])).toEqual({ keys: [], narrowed: false, unaskable: [trimmed] });
  });

  it("proves the survivor set by the parser, not by a character blacklist", () => {
    for (const key of names.map((n) => departureKey(n))) {
      expect(parseLedgerKeys(key)).toEqual([key]);
      expect(keySurvivesTransport(key)).toBe(true);
    }
  });
});

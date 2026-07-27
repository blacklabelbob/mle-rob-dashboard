import { describe, expect, it } from "vitest";
import { buildGraphIndex, domainFromWebsite } from "../comms/emailGraphIndex";
import type { NetworkData, Person } from "../types";

const person = (over: Partial<Person>): Person => ({
  id: "p1",
  name: "Someone",
  verticalId: "v1",
  status: "warm",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

const net = (people: Person[]): NetworkData => ({
  people,
  edges: [],
  verticals: [],
  projects: [],
});

describe("domainFromWebsite", () => {
  it("survives every shape a hand-typed website field takes", () => {
    for (const raw of [
      "https://www.RoofCo.com/about?x=1#top",
      "http://roofco.com",
      "roofco.com/",
      "  WWW.RoofCo.com  ",
      "roofco.com:8443",
      "roofco.com.",
    ]) {
      expect(domainFromWebsite(raw)).toBe("roofco.com");
    }
  });
  it("refuses what is not a domain — a bare host would match nothing forever", () => {
    expect(domainFromWebsite(undefined)).toBe("");
    expect(domainFromWebsite("")).toBe("");
    expect(domainFromWebsite("localhost")).toBe("");
    expect(domainFromWebsite("just some notes")).toBe("");
  });
});

describe("buildGraphIndex", () => {
  it("indexes every row's email, company or person, lowercased", () => {
    const i = buildGraphIndex(
      net([
        person({ id: "a", email: "  JPolk@PropLogix.com " }),
        person({ id: "b", entityKind: "company", email: "info@gulfcoast.com" }),
      ])
    );
    expect(i.personIdByEmail.get("jpolk@proplogix.com")).toBe("a");
    expect(i.personIdByEmail.get("info@gulfcoast.com")).toBe("b");
  });

  it("ONLY company rows lend a domain — a person never claims their employer's", () => {
    const i = buildGraphIndex(net([person({ id: "a", email: "jpolk@proplogix.com" })]));
    expect(i.orgIdByDomain.has("proplogix.com")).toBe(false);
  });

  it("a company at a generic domain claims nothing", () => {
    const i = buildGraphIndex(
      net([person({ id: "solo", entityKind: "company", email: "solo@gmail.com" })])
    );
    expect(i.orgIdByDomain.has("gmail.com")).toBe(false);
  });

  it("first writer wins, so a later duplicate cannot steal an established domain", () => {
    const i = buildGraphIndex(
      net([
        person({ id: "real", entityKind: "company", website: "roofco.com" }),
        person({ id: "dupe", entityKind: "company", website: "https://www.roofco.com" }),
      ])
    );
    expect(i.orgIdByDomain.get("roofco.com")).toBe("real");
  });

  it("takes both the website and the email domain of a company row", () => {
    const i = buildGraphIndex(
      net([
        person({
          id: "gulf",
          entityKind: "company",
          website: "https://gulfcoast.com",
          email: "info@gulfcoastroofing.net",
        }),
      ])
    );
    expect(i.orgIdByDomain.get("gulfcoast.com")).toBe("gulf");
    expect(i.orgIdByDomain.get("gulfcoastroofing.net")).toBe("gulf");
  });
});

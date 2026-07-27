import { describe, expect, it } from "vitest";
import {
  planOrgProposals,
  proposalTitle,
  proposalToFlag,
  recordOrgProposals,
  suggestedNameFor,
  type OrgProposal,
  type OrgProposalFlag,
} from "@/lib/comms/orgProposal";
import type { GraphIndex } from "@/lib/comms/emailGraph";
import { genericDomainSet } from "@/lib/comms/genericDomains";

function index(over: Partial<GraphIndex> = {}): GraphIndex {
  return {
    personIdByEmail: new Map(),
    orgIdByDomain: new Map(),
    genericDomains: genericDomainSet(),
    contestedDomains: new Set(),
    ...over,
  };
}

function sink(existing: string[] = []) {
  const inserted: OrgProposalFlag[][] = [];
  return {
    inserted,
    existingTitles: async (titles: string[]) => titles.filter((t) => existing.includes(t)),
    insert: async (flags: OrgProposalFlag[]) => {
      inserted.push(flags);
    },
  };
}

describe("planOrgProposals — rung 6 only, and only outbound", () => {
  it("proposes a company for a new domain we SENT to", () => {
    const out = planOrgProposals(["jane@roofco.com"], "outbound", index());
    expect(out).toEqual([
      { domain: "roofco.com", address: "jane@roofco.com", suggestedName: "Roofco" },
    ]);
  });

  it("proposes NOTHING for the same domain received from (rung 7 — the CRM rule)", () => {
    // This is the whole reason the item exists: a recruiter or newsletter
    // mailing Rob must never become a company row.
    expect(planOrgProposals(["jane@roofco.com"], "inbound", index())).toEqual([]);
  });

  it("never proposes a generic domain or a role account", () => {
    const out = planOrgProposals(
      ["jane@gmail.com", "billing+acct@roofco.com"],
      "outbound",
      index()
    );
    expect(out).toEqual([]);
  });

  it("never proposes a domain we already know", () => {
    const known = index({ orgIdByDomain: new Map([["roofco.com", "org-roofco"]]) });
    expect(planOrgProposals(["newguy@roofco.com"], "outbound", known)).toEqual([]);
  });

  it("dedupes two addresses at the same new company into one proposal", () => {
    const out = planOrgProposals(
      ["jane@roofco.com", "bob@roofco.com", "sam@titleco.com"],
      "outbound",
      index()
    );
    expect(out.map((p) => p.domain)).toEqual(["roofco.com", "titleco.com"]);
  });
});

describe("the flag payload", () => {
  it("suggests a readable name without ever making it the entity name", () => {
    expect(suggestedNameFor("the-title-base.com")).toBe("The Title Base");
    expect(suggestedNameFor("mail.roofco.com")).toBe("Mail");
    const flag = proposalToFlag({
      domain: "the-title-base.com",
      address: "trent@the-title-base.com",
      suggestedName: "The Title Base",
    });
    // The entity is the DOMAIN — the guessed name lives in the detail, flagged
    // as a guess, so nobody creates "Mail" as a company.
    expect(flag.entityName).toBe("the-title-base.com");
    expect(flag.entityId).toBeNull();
    expect(flag.detail).toContain('Suggested name: "The Title Base"');
    expect(flag.detail).toContain("Nothing was created");
    expect(flag.severity).toBe("low");
  });

  it("keys the ledger row on the domain alone, never the message", () => {
    // Stable per domain = the same company emailed ten times queues once.
    expect(proposalTitle("roofco.com")).toBe("New company domain: roofco.com");
  });
});

describe("recordOrgProposals", () => {
  const roofco: OrgProposal = {
    domain: "roofco.com",
    address: "jane@roofco.com",
    suggestedName: "Roofco",
  };

  it("queues a new domain once", async () => {
    const s = sink();
    const res = await recordOrgProposals([roofco], s);
    expect(res).toEqual({ created: ["roofco.com"], duplicate: [] });
    expect(s.inserted[0]?.[0]?.title).toBe("New company domain: roofco.com");
  });

  it("does not re-queue a domain already on the ledger", async () => {
    const s = sink([proposalTitle("roofco.com")]);
    const res = await recordOrgProposals([roofco], s);
    expect(res).toEqual({ created: [], duplicate: ["roofco.com"] });
    expect(s.inserted).toEqual([]); // no insert attempted at all
  });

  it("queues only the fresh half of a mixed batch", async () => {
    const s = sink([proposalTitle("roofco.com")]);
    const titleco: OrgProposal = {
      domain: "titleco.com",
      address: "sam@titleco.com",
      suggestedName: "Titleco",
    };
    const res = await recordOrgProposals([roofco, titleco], s);
    expect(res).toEqual({ created: ["titleco.com"], duplicate: ["roofco.com"] });
    expect(s.inserted[0].map((f) => f.entityName)).toEqual(["titleco.com"]);
  });

  it("touches the ledger not at all when there is nothing to propose", async () => {
    const s = sink();
    let asked = false;
    const res = await recordOrgProposals([], {
      existingTitles: async (t) => {
        asked = true;
        return s.existingTitles(t);
      },
      insert: s.insert,
    });
    expect(res).toEqual({ created: [], duplicate: [] });
    expect(asked).toBe(false);
  });
});

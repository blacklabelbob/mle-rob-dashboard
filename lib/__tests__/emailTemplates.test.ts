import { describe, expect, it } from "vitest";
import {
  BANNED_TOKEN_PATTERN,
  DEMO_LINK,
  EMAIL_TEMPLATES,
  type EmailTemplate,
  companyOf,
  firstNameOf,
  gmailComposeUrl,
  invalidTokensIn,
  mailtoUrl,
  resolve,
  templatesFor,
  tokensIn,
  TEMPLATE_TOKENS,
} from "@/lib/rep/emailTemplates";
import type { Deal, Person } from "@/lib/types";

const person = (over: Partial<Person> = {}): Person => ({
  id: "p-1",
  name: "Caleb Green",
  business: "CG Roofing Group",
  verticalId: "roofing",
  status: "lead",
  signed: false,
  keyDates: {},
  phaseOne: "not_started",
  email: "caleb@cgroofing.com",
  ...over,
});

const deal = (over: Partial<Deal> = {}): Deal =>
  ({ id: "d-1", stage: "quote_sent", ...over }) as unknown as Deal;

const ctx = (over: Partial<Parameters<typeof resolve>[1]> = {}) => ({
  person: person(),
  verticalName: "Roofing",
  repName: "Jake Torres (DEMO)",
  ...over,
});

describe("firstNameOf", () => {
  it("takes the first word of a person's name", () => {
    expect(firstNameOf(person({ name: "Caleb Green" }))).toBe("Caleb");
  });

  it("refuses to greet a COMPANY row by a first name", () => {
    // Orgs live in the same people array (R2 inc.2). "Hi Acme," to a company
    // row reads as a mail-merge blowout to the recipient — so there is no first
    // name here, and the draft has to say so.
    expect(firstNameOf(person({ entityKind: "company", name: "Acme Roofing LLC" }))).toBeUndefined();
  });

  it("treats a blank name as absent, never as an empty greeting", () => {
    expect(firstNameOf(person({ name: "   " }))).toBeUndefined();
  });
});

describe("companyOf", () => {
  it("prefers the business field", () => {
    expect(companyOf(person())).toBe("CG Roofing Group");
  });

  it("falls back to the row name only for a company row", () => {
    expect(companyOf(person({ business: undefined, entityKind: "company", name: "Acme LLC" }))).toBe("Acme LLC");
    expect(companyOf(person({ business: undefined, name: "Caleb Green" }))).toBeUndefined();
  });
});

describe("the config table itself", () => {
  it("asks for no token this module cannot honour", () => {
    for (const t of EMAIL_TEMPLATES) {
      expect(invalidTokensIn(t), `template ${t.id}`).toEqual([]);
    }
  });

  it("carries NO money token anywhere — a price we did not confirm must not auto-send", () => {
    for (const t of EMAIL_TEMPLATES) {
      for (const token of tokensIn(t)) {
        expect(BANNED_TOKEN_PATTERN.test(token), `${t.id} → ${token}`).toBe(false);
      }
      expect(t.body).not.toMatch(/\$\s?\d/);
      expect(t.subject).not.toMatch(/\$\s?\d/);
    }
  });

  it("defines no money token in the allow-list either", () => {
    for (const token of TEMPLATE_TOKENS) {
      expect(BANNED_TOKEN_PATTERN.test(token), token).toBe(false);
    }
  });

  it("has unique ids", () => {
    const ids = EMAIL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers at least one GENERIC template at every stage it covers", () => {
    // A vertical-only stage would leave a medical or food record with no
    // template at all, which reads on screen as "email isn't wired here".
    const stages = new Set(EMAIL_TEMPLATES.flatMap((t) => t.stages));
    for (const stage of stages) {
      const generic = EMAIL_TEMPLATES.filter((t) => t.stages.includes(stage) && !t.verticals);
      expect(generic.length, `stage ${stage}`).toBeGreaterThan(0);
    }
  });
});

describe("templatesFor", () => {
  it("puts the vertical-scoped template ahead of the generic one, deterministically", () => {
    const out = templatesFor(ctx({ deal: deal({ stage: "contacted" }) }));
    expect(out.templates[0].id).toBe("intro-roofing");
    expect(out.templates.map((t) => t.id)).toContain("intro-generic");
  });

  it("gives a title/RE record the title intro, not roofing's", () => {
    const out = templatesFor(
      ctx({ person: person({ verticalId: "title" }), deal: deal({ stage: "contacted" }) }),
    );
    expect(out.templates[0].id).toBe("intro-title");
    expect(out.templates.map((t) => t.id)).not.toContain("intro-roofing");
  });

  it("gives an unscoped vertical the generic intro rather than nothing", () => {
    const out = templatesFor(
      ctx({ person: person({ verticalId: "medical" }), deal: deal({ stage: "contacted" }) }),
    );
    expect(out.templates.map((t) => t.id)).toEqual(["intro-generic"]);
  });

  it("reports NO DEAL as its own fact while still offering the new_lead set", () => {
    // hasDeal=false is what lets the surface say "no deal yet" instead of
    // implying a stage nobody set.
    const out = templatesFor(ctx({ deal: undefined }));
    expect(out.hasDeal).toBe(false);
    expect(out.stageUsed).toBe("new_lead");
    expect(out.templates.length).toBeGreaterThan(0);
  });

  it("follows the deal's stage, so a signed account gets kickoff not an intro", () => {
    const out = templatesFor(ctx({ deal: deal({ stage: "signed" }) }));
    expect(out.templates.map((t) => t.id)).toEqual(["kickoff"]);
  });
});

describe("resolve", () => {
  it("merges every token and leaves no braces behind", () => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === "intro-roofing")!;
    const draft = resolve(template, ctx());
    expect(draft.state).toBe("ready");
    expect(draft.subject).toBe("CG Roofing Group — the calls you're missing after hours");
    expect(draft.body).toContain("Hi Caleb,");
    expect(draft.body).toContain(DEMO_LINK);
    expect(draft.body).toContain("Jake Torres (DEMO)");
    expect(draft.body).not.toMatch(/\{\{/);
    expect(draft.subject).not.toMatch(/\{\{/);
    expect(draft.missing).toEqual([]);
  });

  it("names the missing field instead of merging a blank", () => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === "intro-generic")!;
    const draft = resolve(template, ctx({ person: person({ business: undefined, name: "Caleb Green" }) }));
    expect(draft.state).toBe("missing_fields");
    expect(draft.missing).toContain("company");
    expect(draft.subject).toBeUndefined();
    expect(draft.body).toBeUndefined();
  });

  it("separates NO RECIPIENT from missing fields — they are fixed in different places", () => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === "intro-generic")!;
    const draft = resolve(template, ctx({ person: person({ email: undefined }) }));
    expect(draft.state).toBe("no_recipient");
    expect(draft.to).toBeUndefined();
  });

  it("reports no_recipient ahead of merge gaps when both are absent", () => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === "intro-generic")!;
    const draft = resolve(
      template,
      ctx({ person: person({ email: undefined, business: undefined, name: "Caleb Green" }) }),
    );
    expect(draft.state).toBe("no_recipient");
    // still enumerated, so a surface can show both blockers at once
    expect(draft.missing).toContain("company");
  });

  it("blocks a company row on first_name rather than greeting the company", () => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === "intro-generic")!;
    const draft = resolve(
      template,
      ctx({ person: person({ entityKind: "company", name: "Acme Roofing LLC", business: undefined }) }),
    );
    expect(draft.state).toBe("missing_fields");
    expect(draft.missing).toEqual(["first_name"]);
  });

  it("refuses an UNKNOWN token as OUR bug, not as missing customer data", () => {
    const typo: EmailTemplate = {
      id: "typo",
      label: "typo",
      stages: ["contacted"],
      subject: "hi {{firstname}}",
      body: "x",
    };
    const draft = resolve(typo, ctx());
    expect(draft.state).toBe("missing_fields");
    expect(draft.invalidTokens).toEqual(["firstname"]);
    // not reported as a field a rep could go fill in
    expect(draft.missing).toEqual([]);
    expect(draft.body).toBeUndefined();
  });

  it("refuses a MONEY token even though every merge value is present", () => {
    const priced: EmailTemplate = {
      id: "priced",
      label: "priced",
      stages: ["quote_sent"],
      subject: "your quote",
      body: "Hi {{first_name}}, the number is {{quoted_amount}}.",
    };
    const draft = resolve(priced, ctx());
    expect(draft.state).toBe("missing_fields");
    expect(draft.invalidTokens).toEqual(["quoted_amount"]);
    expect(draft.body).toBeUndefined();
  });

  it("still refuses a money token if someone adds it to the allow-list", () => {
    // The ban must not be defeatable by editing one list — invalidTokensIn
    // checks the money pattern before the allow-list.
    expect(invalidTokensIn({
      id: "x",
      label: "x",
      stages: ["quote_sent"],
      subject: "s",
      body: "{{deal_value}}",
    })).toEqual(["deal_value"]);
  });

  it("resolves {{stage}} from the deal, and from new_lead when there is no deal", () => {
    const staged: EmailTemplate = {
      id: "staged",
      label: "staged",
      stages: ["quote_sent", "new_lead"],
      subject: "{{stage}}",
      body: "{{stage}}",
    };
    expect(resolve(staged, ctx({ deal: deal({ stage: "quote_sent" }) })).subject).toBe("Quote sent");
    expect(resolve(staged, ctx({ deal: undefined })).subject).toBe("New lead");
  });

  it("treats a blank rep name as missing rather than signing an email nobody", () => {
    const template = EMAIL_TEMPLATES.find((t) => t.id === "intro-generic")!;
    const draft = resolve(template, ctx({ repName: "   " }));
    expect(draft.state).toBe("missing_fields");
    expect(draft.missing).toContain("rep_name");
  });
});

describe("compose handoff", () => {
  const template = EMAIL_TEMPLATES.find((t) => t.id === "intro-roofing")!;

  it("builds a Gmail compose URL with the draft encoded", () => {
    const url = gmailComposeUrl(resolve(template, ctx()))!;
    expect(url.startsWith("https://mail.google.com/mail/?")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("view")).toBe("cm");
    expect(q.get("to")).toBe("caleb@cgroofing.com");
    expect(q.get("su")).toBe("CG Roofing Group — the calls you're missing after hours");
    expect(q.get("body")).toContain("Hi Caleb,");
  });

  it("builds a mailto fallback with the same draft", () => {
    const url = mailtoUrl(resolve(template, ctx()))!;
    expect(url.startsWith("mailto:caleb@cgroofing.com?")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Hi Caleb,");
  });

  it("percent-encodes spaces in BOTH urls — a `+` renders literally in a mail client", () => {
    // The bug this pins: URLSearchParams form-encodes, so the rep's draft would
    // have opened as "Hi+Caleb,+Most+roofing+shops…". Asserted on the raw string
    // because URL.searchParams decodes `+` back to a space and would hide it.
    const draft = resolve(template, ctx());
    for (const url of [gmailComposeUrl(draft)!, mailtoUrl(draft)!]) {
      const query = url.slice(url.indexOf("?") + 1);
      expect(query).not.toMatch(/\+/);
      expect(query).toContain("%20");
      expect(decodeURIComponent(query)).toContain("Hi Caleb,");
      expect(decodeURIComponent(query)).toContain("My Local Everything");
    }
  });

  it("emits NO url for a draft that is not ready — a disabled button cannot leak a half-merged email", () => {
    const blocked = resolve(template, ctx({ person: person({ business: undefined }) }));
    expect(blocked.state).not.toBe("ready");
    expect(gmailComposeUrl(blocked)).toBeUndefined();
    expect(mailtoUrl(blocked)).toBeUndefined();
  });

  it("emits no url when there is no recipient", () => {
    const blocked = resolve(template, ctx({ person: person({ email: undefined }) }));
    expect(gmailComposeUrl(blocked)).toBeUndefined();
    expect(mailtoUrl(blocked)).toBeUndefined();
  });
});

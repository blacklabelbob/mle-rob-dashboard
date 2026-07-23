import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import {
  buildAgreementPdf,
  buildScopeContent,
  checkIntake,
  expectedSecondBrains,
  lead,
  namesPhrase,
  parseMarkup,
  wn,
  words,
  type AgreementConfig,
} from "../agreementPdf";
import {
  COMMS_CONSENT_TEXT,
  ESIGN_CONSUMER_DISCLOSURE_TEXT,
  renderConsumerDisclosure,
} from "../consent";

// CG-Roofing-shaped fixture (the battle-tested reference input; parity vs the
// Python engine's PDF is logged in ESIGN-BUILD-LOG — 4/4 pages, 94.6% char
// similarity, all 13 clauses byte-matching after whitespace normalization).
function cgConfig(): AgreementConfig {
  return {
    fee: "$10,000",
    client: {
      legal_name: "CG Roofing and Waterproofing LLC and Red Rock Roofing LLC",
      descriptor: "each a Florida limited liability company",
      address: "4320 Deerwood Lake Pkwy, Suite 101-133, Jacksonville, Florida 32216",
    },
    entities: [
      { name: "CG Roofing and Waterproofing LLC", website_pages: 500, agents: null },
      { name: "Red Rock Roofing LLC", website_pages: 500, agents: null },
    ],
    intake: {
      confirmed_by: "Rob",
      date: "2026-06-19",
      entities_count: 2,
      second_brains_total: 2,
      other_adjustments: "two sibling LLCs under one agreement",
    },
  };
}

describe("number words (port of _words/wn)", () => {
  it("matches the Python engine's phrasing", () => {
    expect(words(7)).toBe("seven");
    expect(words(20)).toBe("twenty");
    expect(words(64)).toBe("sixty-four");
    expect(words(100)).toBe("one hundred");
    expect(words(120)).toBe("one hundred twenty");
    expect(words(4200)).toBe("4,200");
    expect(wn(120)).toBe("one hundred twenty (120)");
  });
});

describe("intake gate (port of check_intake)", () => {
  it("refuses to generate without an intake block, quoting the questions", () => {
    const cfg = cgConfig();
    delete cfg.intake;
    expect(() => checkIntake(cfg, "x.json")).toThrow(/INTAKE GATE: x.json has no "intake" block/);
    expect(() => checkIntake(cfg, "x.json")).toThrow(/three intake questions/);
  });

  it("refuses when intake fields are missing", () => {
    const cfg = cgConfig();
    cfg.intake!.other_adjustments = "";
    expect(() => checkIntake(cfg)).toThrow(/missing \[other_adjustments\]/);
  });

  it("refuses when entity count disagrees with entities[]", () => {
    const cfg = cgConfig();
    cfg.intake!.entities_count = 1;
    expect(() => checkIntake(cfg)).toThrow(/intake says 1 entit/);
  });

  it("refuses when second-brain math disagrees (structural scope enforcement)", () => {
    const cfg = cgConfig();
    cfg.intake!.second_brains_total = 5;
    expect(() => checkIntake(cfg)).toThrow(/implies 2/);
  });

  it("second-brain expectation counts company + per-agent brains", () => {
    expect(
      expectedSecondBrains([
        { name: "A", website_pages: 500, agents: { count: 60, website_pages: 60, second_brain: true } },
        { name: "B", website_pages: 500, agents: null },
      ])
    ).toBe(62);
  });
});

describe("markup + phrasing helpers", () => {
  it("namesPhrase matches the Python", () => {
    expect(namesPhrase(["A"])).toBe("A");
    expect(namesPhrase(["A", "B"])).toBe("A and B");
    expect(namesPhrase(["A", "B", "C"])).toBe("A, B, and C");
  });

  it("lead() bolds the numbered-clause lead-in", () => {
    expect(lead("3. Fees and Payment.  Client will pay.")).toBe(
      "<b>3. Fees and Payment.</b>  Client will pay."
    );
  });

  it("parseMarkup decodes entities, bold spans, and highlights placeholders", () => {
    const segs = parseMarkup("pay <b>now</b> &mdash; [Phase I Fee amount] due");
    expect(segs).toEqual([
      { text: "pay ", bold: false, highlight: false },
      { text: "now", bold: true, highlight: false },
      { text: " — ", bold: false, highlight: false },
      { text: "[Phase I Fee amount]", bold: false, highlight: true },
      { text: " due", bold: false, highlight: false },
    ]);
  });
});

describe("scope builder (port of build_scope)", () => {
  it("single entity → 'Main Website' singular", () => {
    const s = buildScopeContent([{ name: "Acme LLC", website_pages: 500 }], "Acme LLC");
    expect(s.head).toContain("<b>Main Website</b> &mdash; up to 500 pages");
    expect(s.items[0]).toContain("for the Company"); // sole-entity label
    expect(s.subOpts).toHaveLength(3);
  });

  it("two entities same pages → 'each' phrasing with both names", () => {
    const s = buildScopeContent(cgConfig().entities, cgConfig().client.legal_name);
    expect(s.head).toContain(
      "Main Websites for CG Roofing and Waterproofing LLC and Red Rock Roofing LLC"
    );
    expect(s.head).toContain("500 pages each");
    expect(s.items).toHaveLength(2); // one Second Brain per entity
    expect(s.items[0]).toContain("for CG Roofing and Waterproofing LLC");
  });

  it("differing page counts are spelled out per entity", () => {
    const s = buildScopeContent(
      [
        { name: "A LLC", website_pages: 500 },
        { name: "B LLC", website_pages: 250 },
      ],
      "A LLC and B LLC"
    );
    expect(s.head).toContain("A LLC up to 500 pages; B LLC up to 250 pages");
  });

  it("agent bundles produce dedicated-site + per-agent brain + social lines (Gulf-Coast shape)", () => {
    const s = buildScopeContent(
      [
        {
          name: "Gulf Coast LLC",
          website_pages: 500,
          agents: { count: 60, website_pages: 60, second_brain: true, social_media: true },
        },
      ],
      "Gulf Coast LLC"
    );
    const joined = s.items.join("\n");
    expect(joined).toContain("sixty (60) agents");
    expect(joined).toContain("for each of the Client’s sixty (60) agents"); // per-agent brain line
    expect(joined).toContain("Automated Social Media Posting");
  });

  it("social_media as {count, note} overrides the standard phrasing", () => {
    const s = buildScopeContent(
      [
        {
          name: "X LLC",
          website_pages: 500,
          agents: {
            count: 10,
            website_pages: 60,
            social_media: { count: 12, note: "(two extra house accounts)" },
          },
        },
      ],
      "X LLC"
    );
    expect(s.items.join("\n")).toContain("twelve (12) accounts (two extra house accounts)");
  });
});

describe("buildAgreementPdf (full render)", () => {
  it("renders the CG config to a loadable multi-page PDF (Python reference: 4 pages)", async () => {
    const r = await buildAgreementPdf(cgConfig(), "cg.json");
    expect(Buffer.from(r.bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(r.pageCount).toBe(4);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toBe("Phase I Services Agreement");
  });

  it("null fee renders (highlighted placeholder path) instead of failing", async () => {
    const cfg = cgConfig();
    cfg.fee = null;
    const r = await buildAgreementPdf(cfg);
    expect(r.pageCount).toBeGreaterThanOrEqual(4);
  });

  it("hard-refuses to render past the intake gate", async () => {
    const cfg = cgConfig();
    delete cfg.intake;
    await expect(buildAgreementPdf(cfg)).rejects.toThrow(/INTAKE GATE/);
  });
});

describe("consumer disclosure (§7001(c) checklist — spec §3.5)", () => {
  const t = ESIGN_CONSUMER_DISCLOSURE_TEXT;
  it("covers all seven checklist elements", () => {
    expect(t).toMatch(/paper instead, at no charge/); // 1 paper right + fee
    expect(t).toMatch(/withdraw your consent .* at no charge and with no penalty/s); // 2 + fees
    expect(t).toMatch(/only to this transaction and its related documents/); // 3 scope
    expect(t).toMatch(/update the email address or mobile number/); // 4 contact update
    expect(t).toMatch(/by emailing\s+\{SENDER_EMAIL\}/); // 4 withdrawal procedure
    expect(t).toMatch(/web browser able to display PDF files/); // 5 hw/sw requirements
    expect(t).toMatch(/requirements ever change .* notify you of the new requirements/s); // 7 change notice
    // 6 (demonstrable access) lives in the consent checkbox mechanic + text:
  });
  it("placeholder rendering resolves sender + company", () => {
    const r = renderConsumerDisclosure("rob@aivoicetech.io", "My Local Everything");
    expect(r).toContain("rob@aivoicetech.io");
    expect(r).toContain("My Local Everything representative");
    expect(r).not.toContain("{SENDER_EMAIL}");
    expect(r).not.toContain("{COMPANY}");
  });
});

describe("comms consent (PEWC — Rob directive)", () => {
  const t = COMMS_CONSENT_TEXT;
  it("hits every PEWC element", () => {
    expect(t).toContain("My Local Everything (MLE)"); // names the company
    expect(t).toMatch(/automated, prerecorded, and AI-assisted/); // autodialed/prerecorded/AI
    expect(t).toMatch(/calls and texts/); // both channels
    expect(t).toMatch(/at the number provided/);
    expect(t).toMatch(/For communications with MLE only/); // scope
    expect(t).toMatch(/Not required\s+to sign/); // NOT a condition — load-bearing
    expect(t).toMatch(/STOP/); // opt-out
  });
});

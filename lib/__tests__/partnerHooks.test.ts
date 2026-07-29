import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PARTNER_CONTRACT,
  PARTNER_HOOKS,
  contractBaseUrl,
  contractBreaches,
  contractDoors,
  distinctHeaders,
  doorParityBreaches,
  openQuestions,
  headerIsRead,
  hookBreaches,
  undocumentedHooks,
  type HookFile,
} from "@/lib/partnerHooks";

const REPO_ROOT = join(__dirname, "..", "..");
const WEBHOOKS = "app/api/webhooks";

function hookFiles(): HookFile[] {
  const dir = join(REPO_ROOT, WEBHOOKS);
  return readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .filter((entry) => existsSync(join(dir, entry, "route.ts")))
    .map((entry) => ({
      route: entry,
      source: readFileSync(join(dir, entry, "route.ts"), "utf8"),
    }));
}

function libHaystack(): string {
  const parts: string[] = [];
  const walk = (relDir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, relDir))) {
      if (entry === "__tests__" || entry.endsWith(".test.ts")) continue;
      const rel = `${relDir}/${entry}`;
      if (statSync(join(REPO_ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry)) parts.push(readFileSync(join(REPO_ROOT, rel), "utf8"));
    }
  };
  walk("lib");
  return parts.join("\n");
}

function existingDocs(): string[] {
  return PARTNER_HOOKS.map((h) => h.deepSpec).filter(
    (p): p is string => p !== null && existsSync(join(REPO_ROOT, p)),
  );
}

const contract = () => readFileSync(join(REPO_ROOT, PARTNER_CONTRACT), "utf8");

const audit = () => ({
  declared: PARTNER_HOOKS,
  files: hookFiles(),
  libHaystack: libHaystack(),
  existingDocs: existingDocs(),
});

describe("partner connection contract (Q75)", () => {
  it("declares every inbound webhook route, and nothing that is not one", () => {
    expect(hookBreaches(audit())).toEqual([]);
  });

  it("fails by name when a webhook route is added without a declaration", () => {
    const a = audit();
    const breaches = hookBreaches({
      ...a,
      files: [...a.files, { route: "partner-hub", source: "export async function POST() {}" }],
    });
    expect(breaches).toContain(
      "partner-hub: inbound webhook route with no PARTNER_HOOKS entry — undeclared door",
    );
  });

  it("fails when a declared hook drops its 403 or 503", () => {
    const a = audit();
    const breaches = hookBreaches({
      ...a,
      files: a.files.map((f) =>
        f.route === "vapi"
          ? { ...f, source: f.source.replace(/status: 503/g, "status: 200") }
          : f,
      ),
    });
    expect(breaches).toContain("vapi: no 503 response — must stay inert while unconfigured");
  });

  it("fails on a phantom route left behind by a rename", () => {
    const a = audit();
    const breaches = hookBreaches({
      ...a,
      declared: [
        ...a.declared,
        {
          route: "n8n-emails",
          header: "x-n8n-secret",
          secretEnv: "N8N_EMAIL_WEBHOOK_SECRET",
          caller: "typo",
          contractAnchor: "n8n-email",
          deepSpec: null,
        },
      ],
    });
    expect(breaches).toContain("n8n-emails: declared but no such webhook route on disk");
  });

  it("fails on a declared secret env that exists nowhere in code", () => {
    const a = audit();
    const breaches = hookBreaches({
      ...a,
      declared: a.declared.map((h) =>
        h.route === "vapi" ? { ...h, secretEnv: "VAPI_IMAGINARY_SECRET" } : h,
      ),
    });
    expect(breaches).toContain(
      "vapi: declares secret env VAPI_IMAGINARY_SECRET, which appears nowhere in code",
    );
  });

  it("accepts a header read through a shared constant, rejects an undeclared one", () => {
    const viaConstant = 'const s = req.headers.get(PHASE_SIGNAL_HEADER) ?? "";';
    expect(
      headerIsRead(viaConstant, 'export const PHASE_SIGNAL_HEADER = "x-phase-signal-secret";', "x-phase-signal-secret"),
    ).toBe(true);
    expect(headerIsRead(viaConstant, "", "x-phase-signal-secret")).toBe(false);
    expect(headerIsRead('req.headers.get("x-vapi-secret")', "", "x-vapi-secret")).toBe(true);
  });

  // --- inc.2: the ONE recipe, checked against the code it describes ---------

  it("specifies every door in the single partner contract", () => {
    expect(contractBreaches(contract(), PARTNER_HOOKS)).toEqual([]);
  });

  it("fails when a route's header changes and the contract is not updated", () => {
    const breaches = contractBreaches(
      contract(),
      PARTNER_HOOKS.map((h) =>
        h.route === "vapi" ? { ...h, header: "x-vapi-token" } : h,
      ),
    );
    expect(breaches).toContain("vapi: contract section never names its header x-vapi-token");
  });

  it("fails when a door is declared with no section on the page", () => {
    const breaches = contractBreaches(
      contract(),
      PARTNER_HOOKS.map((h) =>
        h.route === "voice-law" ? { ...h, contractAnchor: "voice-laws" } : h,
      ),
    );
    expect(breaches).toContain(
      `voice-law: no "## voice-laws" section in ${PARTNER_CONTRACT}`,
    );
  });

  it("fails when the contract drops a linked deeper spec", () => {
    const stripped = contract().replace("docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md", "(removed)");
    expect(contractBreaches(stripped, PARTNER_HOOKS)).toContain(
      "phase-signal: contract section never links its deeper spec docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md",
    );
  });

  // The two numbers Q75's decision is made against. Debt: they may shrink by
  // choice, never grow by accident.
  it("pins the documentation gap at ZERO — five of seven on inc.1", () => {
    expect(undocumentedHooks(contract(), PARTNER_HOOKS)).toEqual([]);
  });

  // Q75 inc.3 — the page from the INTEGRATOR's side. Everything below is what a
  // hub owner acts on without our repo, so it is checked against the code the
  // same way the code is checked against the page.
  describe("the partner's view of the page (inc.3 worked example)", () => {
    it("exposes every door machine-readably, with the header and env the code uses", () => {
      expect(doorParityBreaches(contract(), PARTNER_HOOKS)).toEqual([]);
    });

    it("states a base URL, so a partner can address a door without asking", () => {
      expect(contractBaseUrl(contract())).toBe("https://mle-rob-dashboard.vercel.app");
    });

    it("parses the doors a partner can see — including which one is form-encoded", () => {
      const doors = contractDoors(contract());
      expect(doors.map((d) => d.door)).toEqual(PARTNER_HOOKS.map((h) => h.contractAnchor));
      expect(doors.filter((d) => d.formEncoded).map((d) => d.door)).toEqual([
        "twilio-recording",
      ]);
    });

    it("fails when the page tells partners a header the route does not read", () => {
      const lied = contract().replace("`x-vapi-secret`", "`x-vapi-token`");
      expect(doorParityBreaches(lied, PARTNER_HOOKS)).toContain(
        "vapi: page tells partners to send x-vapi-token, code reads x-vapi-secret",
      );
    });

    it("fails when the page drops its base URL", () => {
      const stripped = contract().replace("POST https://mle-rob-dashboard.vercel.app", "POST <ask us>");
      expect(doorParityBreaches(stripped, PARTNER_HOOKS)).toContain(
        "contract: no POST base URL on the page — a partner cannot address a door",
      );
    });

    // The item's score: how many times an integrator still has to ask a human.
    it("pins the integrator's remaining questions at FOUR", () => {
      const questions = openQuestions(contract());
      expect(questions).toHaveLength(4);
      expect(questions[0]).toContain("How do I get a secret");
    });

    it("counts nothing when the page stops admitting its gaps", () => {
      const hidden = contract().replace("## What this page still does not answer", "## (removed)");
      expect(openQuestions(hidden)).toEqual([]);
    });
  });

  it("pins how many distinct secret headers an integrator must learn", () => {
    expect(distinctHeaders(PARTNER_HOOKS)).toEqual([
      "x-aidre-secret",
      "x-n8n-secret",
      "x-phase-signal-secret",
      "x-twilio-signature",
      "x-vapi-secret",
    ]);
  });
});

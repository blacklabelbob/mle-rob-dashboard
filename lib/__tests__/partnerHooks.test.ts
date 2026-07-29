import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PARTNER_HOOKS,
  distinctHeaders,
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
  return PARTNER_HOOKS.map((h) => h.payloadDoc).filter(
    (p): p is string => p !== null && existsSync(join(REPO_ROOT, p)),
  );
}

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
          payloadDoc: null,
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

  // The two numbers Q75's decision gets made against. Both are debt: they may
  // shrink when a recipe is written, never grow by accident.
  it("pins the documentation gap — hooks a partner cannot wire without this repo", () => {
    expect(undocumentedHooks(PARTNER_HOOKS)).toEqual([
      "n8n-email",
      "n8n-error",
      "twilio-recording",
      "vapi",
      "voice-law",
    ]);
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

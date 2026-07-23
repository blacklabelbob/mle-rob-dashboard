import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canSign, consentLocked, type SignerGateInput } from "../signerGate";

// Critic-rob punch #6: the render-lock must be test-pinned BEFORE counsel
// ever flips ESIGN_CONSUMER_ENABLED. The gate is pure code (CR-3); the
// source-drift test below pins that SignerClient actually consumes it.

function input(over: Partial<SignerGateInput> = {}): SignerGateInput {
  return {
    signerType: "consumer",
    pdfRenderedAt: null,
    consent: true,
    printedName: "Sam Signer",
    signatureReady: true,
    busy: false,
    ...over,
  };
}

describe("consentLocked (§7001(c)(1)(C)(ii) render lock)", () => {
  it("consumer WITHOUT a rendered PDF is locked — consent unreachable", () => {
    expect(consentLocked("consumer", null)).toBe(true);
  });
  it("consumer unlocks only once the PDF reports rendered", () => {
    expect(consentLocked("consumer", "2026-07-23T12:00:00Z")).toBe(false);
  });
  it("business signers never lock", () => {
    expect(consentLocked("business", null)).toBe(false);
    expect(consentLocked("business", "2026-07-23T12:00:00Z")).toBe(false);
  });
});

describe("canSign", () => {
  it("consumer with EVERYTHING else perfect still cannot sign without a rendered PDF", () => {
    expect(canSign(input())).toBe(false);
  });
  it("same consumer signs once the render evidence exists", () => {
    expect(canSign(input({ pdfRenderedAt: "2026-07-23T12:00:00Z" }))).toBe(true);
  });
  it("business path needs consent + name + signature and no busy", () => {
    const biz = input({ signerType: "business" });
    expect(canSign(biz)).toBe(true);
    expect(canSign({ ...biz, consent: false })).toBe(false);
    expect(canSign({ ...biz, printedName: "X" })).toBe(false);
    expect(canSign({ ...biz, signatureReady: false })).toBe(false);
    expect(canSign({ ...biz, busy: true })).toBe(false);
  });
  it("comms opt-in is structurally absent — PEWC 'not a condition' by construction", () => {
    // The gate's input type and logic carry no comms field at all.
    const src = readFileSync(join(__dirname, "../signerGate.ts"), "utf8");
    const code = src.slice(src.indexOf("export interface SignerGateInput"));
    expect(code).not.toMatch(/comms/i);
  });
});

describe("SignerClient wiring (source-drift gate)", () => {
  const src = readFileSync(
    join(__dirname, "../../../app/sign/[token]/SignerClient.tsx"),
    "utf8"
  );
  it("imports the pure gate and uses it for both the checkbox lock and the submit gate", () => {
    expect(src).toContain('from "@/lib/esign/signerGate"');
    expect(src).toMatch(/const locked = consentLocked\(props\.signerType, pdfRenderedAt\)/);
    expect(src).toMatch(/const signable = canSign\(\{/);
    expect(src).toContain("disabled={locked}"); // consent checkbox honors the lock
    expect(src).toContain("disabled={!signable}"); // sign button honors the gate
    expect(src).toMatch(/if \(!signable\) return;/); // submit double-checks
  });
  it("does not reintroduce inline gating logic beside the pure gate", () => {
    expect(src).not.toMatch(/const consentLocked = consumer &&/);
    expect(src).not.toMatch(/const canSign = consent &&/);
  });
});

// Q47 e-sign signer-side gating, extracted as pure code (CR-3; critic-rob
// punch #6) so the two load-bearing rules are unit-tested instead of living
// only in component JSX:
//   1. A CONSUMER's consent checkbox is LOCKED until the PDF has rendered in
//      this session (§7001(c)(1)(C)(ii) demonstrable-access mechanic —
//      ESIGN-CONSUMER-DISCLOSURE-SPEC §3.3.1). Business signers never lock.
//   2. canSign requires consent + unlock + printed name + a signature —
//      and NEVER references the comms opt-in (PEWC "not a condition").
// SignerClient.tsx consumes exactly these functions; a source-drift gate in
// lib/esign/__tests__/signerGate.test.ts pins that wiring.

export type SignerType = "business" | "consumer";

export function consentLocked(signerType: SignerType, pdfRenderedAt: string | null): boolean {
  return signerType === "consumer" && !pdfRenderedAt;
}

export interface SignerGateInput {
  signerType: SignerType;
  pdfRenderedAt: string | null;
  consent: boolean;
  printedName: string;
  signatureReady: boolean;
  busy: boolean;
}

export function canSign(i: SignerGateInput): boolean {
  return (
    i.consent &&
    !consentLocked(i.signerType, i.pdfRenderedAt) &&
    i.printedName.trim().length > 1 &&
    i.signatureReady &&
    !i.busy
  );
}

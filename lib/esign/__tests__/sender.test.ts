import { describe, expect, it } from "vitest";
import { fullyExecutedEmail, signedCopyEmail, signingLinkEmail } from "../sender";

// Rob, 2026-08-07, reading the email a signature actually produced: "on the
// Signed, if only Alex has signed, you should not say completed and all that
// other bullshit. Its incorrect if I havent Countersigned it yet."
//
// These emails go to the COUNTERPARTY. An email that overstates where the
// agreement stands is a factual misstatement to the other side of a contract,
// so the state language is pinned here rather than left to prose review.

const SIGNED = {
  signerName: "Alex Greenwood",
  documentTitle: "Phase I Services Agreement - Omega Title Florida",
  downloadUrl: "https://mle-rob-dashboard.vercel.app/d/doc-1/abc",
  signedAtIso: "2026-08-07T19:55:00.000Z",
};

describe("signed-copy email (one party has signed)", () => {
  const mail = signedCopyEmail(SIGNED);

  it("never describes THIS file as completed or executed", () => {
    const body = mail.text.toLowerCase();
    // The exact line Rob caught: "Download the completed agreement".
    expect(body).not.toMatch(/download the (completed|executed|fully|final)/);
    expect(body).not.toContain("completed agreement");
    // Referring to the executed copy as a FUTURE thing is fine and wanted —
    // what must never appear is a present-tense claim. Every mention of full
    // execution here has to be qualified by "not yet" or "once".
    for (const m of body.matchAll(/[^.]*fully executed[^.]*/g)) {
      expect(m[0]).toMatch(/not yet|once|as soon as|after/);
    }
  });

  it("says plainly that countersignature is still outstanding", () => {
    expect(mail.text).toContain("not yet fully executed");
    expect(mail.text.toLowerCase()).toContain("countersign");
  });

  it("still reports who signed and when, and carries the link", () => {
    expect(mail.subject).toBe(`Signed: ${SIGNED.documentTitle}`);
    expect(mail.text).toContain("Alex Greenwood");
    expect(mail.text).toContain("2026-08-07");
    expect(mail.text).toContain(SIGNED.downloadUrl);
  });
});

describe("fully-executed email (both parties have signed)", () => {
  const mail = fullyExecutedEmail({
    signerName: "Alex Greenwood",
    documentTitle: "Phase I Services Agreement - Omega Title Florida",
    downloadUrl: "https://mle-rob-dashboard.vercel.app/d/doc-1/abc",
    countersignerName: "Robert Acheson",
    countersignerTitle: "Chief Operating Officer",
    executedAtIso: "2026-08-07T20:10:00.000Z",
  });

  it("leads the subject with Complete — Rob's wording", () => {
    expect(mail.subject.startsWith("Complete:")).toBe(true);
  });

  it("is the ONLY email allowed to claim full execution", () => {
    expect(mail.text).toContain("fully executed");
    expect(mail.text).toContain("Robert Acheson");
    expect(mail.text).toContain("Chief Operating Officer");
  });
});

describe("signing-link email", () => {
  const mail = signingLinkEmail({
    signerName: "Alex Greenwood",
    documentTitle: "Phase I Services Agreement",
    link: "https://mle-rob-dashboard.vercel.app/sign/tok",
    expiresAtIso: "2026-08-14T00:00:00.000Z",
  });

  it("asks for a signature and does not imply anything is signed yet", () => {
    expect(mail.subject).toContain("ready for your signature");
    expect(mail.text.toLowerCase()).not.toContain("was signed by");
  });
});

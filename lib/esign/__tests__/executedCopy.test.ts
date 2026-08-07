import { describe, it, expect } from "vitest";
import {
  EXECUTED_COPY_KIND,
  deliveredExecutedCopies,
  normalizeRecipients,
  pendingExecutedCopies,
  type DeliveryLedgerRow,
} from "../executedCopy";

const receipt = (to: string): DeliveryLedgerRow => ({
  type: "copy_delivered",
  meta: { to, kind: EXECUTED_COPY_KIND },
});

describe("normalizeRecipients", () => {
  it("lowercases, trims and de-duplicates", () => {
    expect(normalizeRecipients([" Rob@AIVoiceTech.io ", "rob@aivoicetech.io"])).toEqual([
      "rob@aivoicetech.io",
    ]);
  });

  it("drops nulls and blanks rather than mailing an empty address", () => {
    expect(normalizeRecipients([null, undefined, "  ", "a@b.com"])).toEqual(["a@b.com"]);
  });
});

describe("deliveredExecutedCopies", () => {
  it("counts only fully-executed receipts, not the signed-copy ones", () => {
    const events: DeliveryLedgerRow[] = [
      { type: "copy_delivered", meta: { to: "signer@x.com", kind: "signed_copy" } },
      receipt("signer@x.com"),
      { type: "signed", meta: {} },
    ];
    expect(deliveredExecutedCopies(events)).toEqual(["signer@x.com"]);
  });

  it("ignores receipts with no address and tolerates null meta", () => {
    const events: DeliveryLedgerRow[] = [
      { type: "copy_delivered", meta: { kind: EXECUTED_COPY_KIND } },
      { type: "copy_delivered", meta: null },
    ];
    expect(deliveredExecutedCopies(events)).toEqual([]);
  });
});

describe("pendingExecutedCopies — the retry contract", () => {
  const both = ["signer@x.com", "rob@aivoicetech.io"];

  it("mails everyone when the ledger is empty", () => {
    expect(pendingExecutedCopies(both, [])).toEqual(both);
  });

  it("mails only the address the first attempt failed to reach", () => {
    expect(pendingExecutedCopies(both, [receipt("rob@aivoicetech.io")])).toEqual(["signer@x.com"]);
  });

  it("mails nobody twice once both are receipted", () => {
    const done = [receipt("signer@x.com"), receipt("rob@aivoicetech.io")];
    expect(pendingExecutedCopies(both, done)).toEqual([]);
  });

  it("matches a receipt written in a different case", () => {
    expect(pendingExecutedCopies(["Signer@X.com"], [receipt("signer@x.com")])).toEqual([]);
  });

  it("collapses the signer and Rob into one send when they are the same address", () => {
    expect(pendingExecutedCopies(["rob@aivoicetech.io", "rob@aivoicetech.io"], [])).toEqual([
      "rob@aivoicetech.io",
    ]);
  });
});

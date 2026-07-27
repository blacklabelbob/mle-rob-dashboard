import { describe, expect, it } from "vitest";
import {
  CROSSOVER_DOMAIN,
  DEFAULT_MAILBOX_LINK,
  MAILBOX_LINKS,
  resolveMailboxLink,
  type MailboxLink,
} from "../comms/mailboxLink";
import {
  CAPTURE_IDENTITY,
  emailToActivity,
  FORBIDDEN_DOMAIN,
  identityGate,
  type ContactMatch,
  type EmailPayload,
} from "../n8nEmail";
import type { Person } from "../types";

const SECOND: MailboxLink = { linkId: "mbx-second", address: "ops@aivoicetech.io" };

describe("mailbox link registry (Q69 inc.7 — the link_id invariant)", () => {
  it("registers exactly one mailbox today, and it is the capture identity", () => {
    expect(MAILBOX_LINKS).toHaveLength(1);
    expect(DEFAULT_MAILBOX_LINK.address).toBe("rob@aivoicetech.io");
    // n8nEmail's constants derive from the registry — one definition only.
    expect(CAPTURE_IDENTITY).toBe(DEFAULT_MAILBOX_LINK.address);
    expect(FORBIDDEN_DOMAIN).toBe(CROSSOVER_DOMAIN);
  });

  it("never registers a crossover-domain mailbox (the 2026-07-08 rule, as data)", () => {
    for (const link of MAILBOX_LINKS) {
      expect(link.address.endsWith(`@${CROSSOVER_DOMAIN}`)).toBe(false);
    }
  });

  it("resolves by link id and by address, case-insensitively", () => {
    expect(resolveMailboxLink("mbx-aivoicetech-rob")).toEqual({
      ok: true,
      link: DEFAULT_MAILBOX_LINK,
    });
    expect(resolveMailboxLink("Rob@AIVoiceTech.io")).toEqual({
      ok: true,
      link: DEFAULT_MAILBOX_LINK,
    });
  });

  it("REFUSES an unknown mailbox instead of defaulting to the only one", () => {
    // The whole point: a second inbox wired into n8n must not file as Rob's.
    const res = resolveMailboxLink("someone@elsewhere.com");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("not a connected mailbox");
  });

  it("refuses a crossover-domain mailbox even though it is spelled like ours", () => {
    const res = resolveMailboxLink(`rob@${CROSSOVER_DOMAIN}`);
    expect(res.ok).toBe(false);
  });

  it("infers the mailbox from silence ONLY while one is connected", () => {
    expect(resolveMailboxLink(undefined).ok).toBe(true);
    expect(resolveMailboxLink("").ok).toBe(true);
    // Add a second link and the same silence becomes a hard refusal — the
    // migration is the registry entry, not a code change at the call sites.
    const two = [DEFAULT_MAILBOX_LINK, SECOND];
    const res = resolveMailboxLink(undefined, two);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("2 mailboxes connected");
    expect(resolveMailboxLink("mbx-second", two)).toEqual({ ok: true, link: SECOND });
  });
});

describe("the resolved link drives the identity gate and the stamped row", () => {
  const payloadFrom = (from: string, to: string): EmailPayload => ({
    messageId: "m1",
    from,
    to,
    subject: "Roof estimate",
    date: "2026-07-26T12:00:00.000Z",
  });

  it("gates on the RESOLVED mailbox, not a hardcoded address", () => {
    const toSecond = payloadFrom("owner@roofco.com", SECOND.address);
    // Rob's mailbox is not on this thread → refused for the default link…
    expect(identityGate(toSecond).ok).toBe(false);
    // …and accepted once the second mailbox is the one that captured it.
    expect(identityGate(toSecond, SECOND).ok).toBe(true);
  });

  it("stamps link id + address on the activity, and direction follows the link", () => {
    const person: Person = {
      id: "p1",
      name: "Dana Owner",
      email: "owner@roofco.com",
      entityKind: "person",
    } as Person;
    const match: ContactMatch = {
      person,
      email: "owner@roofco.com",
      matchedBy: "person-email",
    };
    const sent = payloadFrom(SECOND.address, "owner@roofco.com");
    const activity = emailToActivity(sent, match, "2026-07-26T13:00:00.000Z", SECOND);
    expect(activity.sourceContext?.mailboxLinkId).toBe(SECOND.linkId);
    expect(activity.sourceContext?.capturedMailbox).toBe(SECOND.address);
    // Sent FROM the capturing mailbox → outbound; judged per-link, so the same
    // message is not mislabelled inbound just because it is not Rob's address.
    expect(activity.sourceContext?.direction).toBe("outbound");
    expect(emailToActivity(sent, match, "2026-07-26T13:00:00.000Z").sourceContext?.direction).toBe(
      "inbound"
    );
  });
});

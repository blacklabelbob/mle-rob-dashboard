import { describe, expect, it } from "vitest";
import {
  buildCallActivity,
  callActivityId,
  callOccurredAt,
  resolveCallParty,
} from "../calls/recordingActivity";
import type { CallActivityPayload } from "../twilio";
import type { Person } from "../types";

const person = (id: string, phone: string): Person =>
  ({ id, name: id, phone, status: "warm" }) as unknown as Person;

const payload = (over: Partial<CallActivityPayload> = {}): CallActivityPayload => ({
  type: "call",
  source: "dialer",
  callSid: "CA1",
  recordingSid: "RE1",
  recordingUrl: "https://api.twilio.com/rec.mp3",
  durationSec: 134,
  from: "+1 (239) 555-0142",
  to: "+12395550100",
  occurredAt: "Fri, 13 Sep 2024 12:00:00 +0000",
  ...over,
});

const OURS = ["+1 239-555-0100"];

describe("resolveCallParty", () => {
  const people = [person("p-caleb", "(239) 555-0142"), person("p-trent", "239.555.0199")];

  it("matches the contact side on an inbound call, our line subtracted", () => {
    expect(resolveCallParty(people, payload(), OURS)).toEqual({
      kind: "resolved",
      personId: "p-caleb",
      matchedOn: "from",
      direction: "inbound",
    });
  });

  it("calls it outbound when the contact is the dialled side", () => {
    const r = resolveCallParty(
      people,
      payload({ from: "+12395550100", to: "12395550199" }),
      OURS
    );
    expect(r).toEqual({
      kind: "resolved",
      personId: "p-trent",
      matchedOn: "to",
      direction: "outbound",
    });
  });

  it("does NOT file the call on our own rep when our line is also a person row", () => {
    // The failure this exists to prevent: every outbound call landing on the
    // rep's own timeline instead of the contact's.
    const withRep = [...people, person("p-rob", "2395550100")];
    expect(resolveCallParty(withRep, payload(), OURS)).toMatchObject({
      kind: "resolved",
      personId: "p-caleb",
    });
  });

  it("is ambiguous — never a first-hit guess — when both sides are CRM people", () => {
    const r = resolveCallParty(people, payload({ from: "2395550142", to: "2395550199" }), []);
    expect(r.kind).toBe("ambiguous");
    expect(r.kind === "ambiguous" && r.personIds.sort()).toEqual(["p-caleb", "p-trent"]);
  });

  it("is ambiguous when one number belongs to two person rows (duplicate CRM data)", () => {
    const dupes = [person("p-a", "2395550142"), person("p-b", "+1 239 555 0142")];
    expect(resolveCallParty(dupes, payload(), OURS)).toMatchObject({ kind: "ambiguous" });
  });

  it("reports the unmatched reasons apart", () => {
    expect(resolveCallParty(people, payload({ from: null, to: null }), OURS)).toEqual({
      kind: "unmatched",
      reason: "no-numbers",
    });
    expect(
      resolveCallParty(people, payload({ from: "+12395550100", to: "2395550100" }), OURS)
    ).toEqual({ kind: "unmatched", reason: "only-our-lines" });
    expect(resolveCallParty(people, payload({ from: "+13055551234" }), OURS)).toEqual({
      kind: "unmatched",
      reason: "no-crm-party",
    });
  });

  it("ignores blank/absent entries in ourNumbers", () => {
    expect(resolveCallParty(people, payload(), [undefined, "", "   "])).toMatchObject({
      kind: "resolved",
      personId: "p-caleb",
    });
  });
});

describe("callOccurredAt", () => {
  it("normalises Twilio's RFC-2822 stamp to ISO", () => {
    expect(callOccurredAt("Fri, 13 Sep 2024 12:00:00 +0000", "2026-07-26T13:00:00.000Z")).toBe(
      "2024-09-13T12:00:00.000Z"
    );
  });

  it("falls back to receipt time rather than throwing at insert", () => {
    expect(callOccurredAt("not a date", "2026-07-26T13:00:00.000Z")).toBe(
      "2026-07-26T13:00:00.000Z"
    );
    expect(callOccurredAt(null, "2026-07-26T13:00:00.000Z")).toBe("2026-07-26T13:00:00.000Z");
  });
});

describe("buildCallActivity", () => {
  const resolved = {
    kind: "resolved" as const,
    personId: "p-caleb",
    matchedOn: "from" as const,
    direction: "inbound" as const,
  };

  it("derives the id from the recording sid so a Twilio retry upserts, not duplicates", () => {
    expect(callActivityId(payload())).toBe("dialer-RE1");
    const a = buildCallActivity(payload(), resolved, "2026-07-26T13:00:00.000Z");
    const again = buildCallActivity(payload(), resolved, "2026-07-26T13:09:00.000Z");
    expect(a?.id).toBe("dialer-RE1");
    expect(again?.id).toBe(a?.id);
  });

  it("refuses to build a row with no stable identity", () => {
    expect(callActivityId(payload({ recordingSid: "  " }))).toBeNull();
    expect(buildCallActivity(payload({ recordingSid: "" }), resolved, "2026-07-26T13:00:00.000Z"))
      .toBeNull();
  });

  it("writes a dialer call anchored on the contact, with no fabricated summary", () => {
    const a = buildCallActivity(payload(), resolved, "2026-07-26T13:00:00.000Z")!;
    expect(a).toMatchObject({
      personId: "p-caleb",
      type: "call",
      source: "dialer",
      recordingUrl: "https://api.twilio.com/rec.mp3",
      bookProtected: false,
      occurredAt: "2024-09-13T12:00:00.000Z",
    });
    expect(a.summary).toBeUndefined();
    expect(a.orgId).toBeUndefined();
    expect(a.sourceContext).toMatchObject({ direction: "inbound", durationSec: 134 });
  });

  it("keeps an unreadable duration null instead of zeroing it", () => {
    const a = buildCallActivity(
      payload({ durationSec: null }),
      resolved,
      "2026-07-26T13:00:00.000Z"
    )!;
    expect(a.sourceContext.durationSec).toBeNull();
  });

  it("leaves recordingUrl unset rather than storing an empty string", () => {
    const a = buildCallActivity(
      payload({ recordingUrl: "" }),
      resolved,
      "2026-07-26T13:00:00.000Z"
    )!;
    expect(a.recordingUrl).toBeUndefined();
  });
});

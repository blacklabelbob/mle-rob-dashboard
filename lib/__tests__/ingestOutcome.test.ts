import { describe, expect, it } from "vitest";
import {
  ingestOutcome,
  personWriteProblem,
  proposalOutcome,
} from "@/lib/comms/ingestOutcome";
import type { PersonWriteFailure } from "@/lib/comms/emailPeopleWrites";

const failure = (over: Partial<PersonWriteFailure> = {}): PersonWriteFailure => ({
  address: "dana@roofco.com",
  personId: "person-dana-roofco",
  kind: "create",
  error: "connection reset",
  ...over,
});

describe("Q69 inc.22 — the webhook answer stops lying", () => {
  it("reports a clean ingest as complete with no problems", () => {
    expect(
      ingestOutcome({ activityId: "act-1", messageId: "msg-1", created: ["p1"], merged: [], failed: [] })
    ).toEqual({
      ok: true,
      ingested: true,
      complete: true,
      activityId: "act-1",
      proposedOrgs: [],
      alreadyQueued: [],
      peopleCreated: ["p1"],
      peopleMerged: [],
      problems: [],
    });
  });

  it("a failed person write flips complete to false and names the address", () => {
    const out = ingestOutcome({
      activityId: "act-2",
      messageId: "msg-2",
      created: ["p1"],
      merged: [],
      failed: [failure()],
    });
    expect(out.complete).toBe(false);
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0].kind).toBe("person-write");
    expect(out.problems[0].detail).toContain("dana@roofco.com");
    expect(out.problems[0].detail).toContain("connection reset");
    // The partial success is still reported — one failed row does not erase the
    // people we did create, and the email itself landed.
    expect(out.ingested).toBe(true);
    expect(out.peopleCreated).toEqual(["p1"]);
  });

  it("names the address, never the id of a person that was never written", () => {
    const problem = personWriteProblem([failure({ personId: "person-ghost" })]);
    expect(problem?.detail).not.toContain("person-ghost");
    expect(problem?.addresses).toEqual(["dana@roofco.com"]);
  });

  it("stays ok:true and 200-shaped even when a write failed (no n8n retry-loop)", () => {
    // The route's contract is that n8n never retry-loops; a later increment may
    // change that, but not by accident.
    expect(
      ingestOutcome({ activityId: "a", messageId: "m", created: [], merged: [], failed: [failure()] }).ok
    ).toBe(true);
    expect(
      proposalOutcome({ planned: ["roofco.com"], storeConfigured: true, error: new Error("x") }).ok
    ).toBe(true);
  });

  it("a queued proposal reports the domain and stays complete", () => {
    expect(
      proposalOutcome({
        planned: ["roofco.com"],
        storeConfigured: true,
        result: { created: ["roofco.com"], duplicate: [] },
      })
    ).toEqual({
      ok: true,
      ingested: false,
      complete: true,
      reason: "no contact match",
      proposedOrgs: ["roofco.com"],
      alreadyQueued: [],
      peopleCreated: [],
      peopleMerged: [],
      problems: [],
    });
  });

  it("an already-queued domain is reported, not silently an empty list", () => {
    // Before this, a duplicate and a total failure were the same empty array.
    const out = proposalOutcome({
      planned: ["roofco.com"],
      storeConfigured: true,
      result: { created: [], duplicate: ["roofco.com"] },
    });
    expect(out.proposedOrgs).toEqual([]);
    expect(out.alreadyQueued).toEqual(["roofco.com"]);
    expect(out.complete).toBe(true);
    expect(out.problems).toEqual([]);
  });

  it("a thrown queue write claims NO split — every planned domain is reported lost", () => {
    // existingTitles runs before the insert, so a throw leaves us unable to say
    // which domains were duplicates. A guessed split would be a printed fact.
    const out = proposalOutcome({
      planned: ["roofco.com", "titlecos.com"],
      storeConfigured: true,
      result: { created: [], duplicate: ["titlecos.com"] },
      error: new Error("insert denied"),
    });
    expect(out.complete).toBe(false);
    expect(out.proposedOrgs).toEqual([]);
    expect(out.alreadyQueued).toEqual([]);
    expect(out.problems[0].kind).toBe("proposal-queue-failed");
    expect(out.problems[0]).toMatchObject({ domains: ["roofco.com", "titlecos.com"] });
    expect(out.problems[0].detail).toContain("insert denied");
  });

  it("an unconfigured ledger store is its own failure, not a quiet success", () => {
    const out = proposalOutcome({ planned: ["roofco.com"], storeConfigured: false });
    expect(out.complete).toBe(false);
    expect(out.problems[0].kind).toBe("proposal-store-unconfigured");
    expect(out.problems[0].detail).toContain("roofco.com");
  });

  it("no proposals planned is silent, configured store or not (no noise)", () => {
    const configured = proposalOutcome({ planned: [], storeConfigured: true });
    const dormant = proposalOutcome({ planned: [], storeConfigured: false });
    expect(configured.complete).toBe(true);
    expect(configured.problems).toEqual([]);
    expect(dormant).toEqual(configured);
  });

  it("every key is present on every branch, and no undefined leaks into a message", () => {
    const outcomes = [
      ingestOutcome({ activityId: "a", messageId: "m", created: [], merged: [], failed: [] }),
      ingestOutcome({ activityId: "a", messageId: "m", created: [], merged: [], failed: [failure()] }),
      ingestOutcome({ activityId: "a", messageId: "m", created: [], merged: [], failed: [], activityError: new Error("boom") }),
      ingestOutcome({ activityId: "a", messageId: "m", created: ["p1"], merged: [], failed: [failure()], activityError: "reset" }),
      proposalOutcome({ planned: [], storeConfigured: true }),
      proposalOutcome({ planned: ["x.com"], storeConfigured: false }),
      proposalOutcome({ planned: ["x.com"], storeConfigured: true, error: undefined }),
      proposalOutcome({ planned: ["x.com"], storeConfigured: true, error: "" }),
    ];
    for (const out of outcomes) {
      for (const key of [
        "proposedOrgs",
        "alreadyQueued",
        "peopleCreated",
        "peopleMerged",
        "problems",
      ] as const) {
        expect(Array.isArray(out[key])).toBe(true);
      }
      expect(typeof out.complete).toBe("boolean");
      for (const problem of out.problems) {
        expect(problem.detail).not.toContain("undefined");
        expect(problem.detail).not.toContain("null");
      }
    }
  });

  it("an empty-string throw still reads as a cause, never a dangling sentence", () => {
    const out = proposalOutcome({ planned: ["x.com"], storeConfigured: true, error: "" });
    expect(out.complete).toBe(false);
    expect(out.problems[0].detail).toContain("unknown error");
  });
});

describe("Q69 inc.23 — the activity write can fail out loud too", () => {
  const failed = (over: Record<string, unknown> = {}) =>
    ingestOutcome({
      activityId: "act-9",
      messageId: "CADm=msg-9@mail.gmail.com",
      created: [],
      merged: [],
      failed: [],
      activityError: new Error("upstream timeout"),
      ...over,
    });

  it("a failed activity write says the message is lost, not that it landed", () => {
    const out = failed();
    expect(out.ingested).toBe(false);
    expect(out.complete).toBe(false);
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0].kind).toBe("activity-write");
    expect(out.problems[0].detail).toContain("upstream timeout");
    expect(out.problems[0].detail).toContain("no rep will ever see it");
  });

  it("names the provider messageId and NEVER the activity id that was never written", () => {
    const out = failed();
    expect(out.activityId).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("act-9");
    expect(out.problems[0]).toMatchObject({ messageId: "CADm=msg-9@mail.gmail.com" });
  });

  it("keeps the 200/ok:true contract so n8n never retry-loops on a lost message", () => {
    expect(failed().ok).toBe(true);
  });

  it("still reports the people that DID land, and warns replay is not safe", () => {
    const out = failed({ created: ["person-dana"], merged: ["person-sam"] });
    expect(out.peopleCreated).toEqual(["person-dana"]);
    expect(out.peopleMerged).toEqual(["person-sam"]);
    expect(out.problems[0].detail).toContain("2 people on this message were still written");
    expect(out.problems[0].detail).toContain("not safe to replay blindly");
  });

  it("says nothing about replay when no person write landed (no invented warning)", () => {
    expect(failed().problems[0].detail).not.toContain("replay");
  });

  it("singularises the partial-write warning", () => {
    expect(failed({ created: ["person-dana"] }).problems[0].detail).toContain(
      "1 person on this message was still written"
    );
  });

  it("reports BOTH failures when the people half failed as well", () => {
    const out = failed({ failed: [failure()] });
    expect(out.problems.map((p) => p.kind)).toEqual(["activity-write", "person-write"]);
    expect(out.complete).toBe(false);
  });

  it("a successful write is untouched by this increment", () => {
    const out = ingestOutcome({
      activityId: "act-1",
      messageId: "m",
      created: [],
      merged: [],
      failed: [],
    });
    expect(out).toMatchObject({ ingested: true, complete: true, activityId: "act-1", problems: [] });
  });

  it("an undefined activityError is a success, not a silent failure", () => {
    expect(
      ingestOutcome({
        activityId: "a",
        messageId: "m",
        created: [],
        merged: [],
        failed: [],
        activityError: undefined,
      }).ingested
    ).toBe(true);
  });

  it("a thrown non-Error still yields a readable cause", () => {
    expect(failed({ activityError: "connection reset" }).problems[0].detail).toContain(
      "connection reset"
    );
    expect(failed({ activityError: null }).problems[0].detail).toContain("unknown error");
  });
});

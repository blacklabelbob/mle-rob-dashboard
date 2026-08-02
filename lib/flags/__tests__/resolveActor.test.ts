import { describe, it, expect } from "vitest";
import { unverifiedActorRefusal, ACTOR_CLAIM_FIELDS } from "../resolveActor";

// Q84 inc.96 — the payloads the live UI actually sends today (ThingsToAddress:299), which
// must keep going through untouched, and the payloads that claim an author, which must not.
const LIVE_RESOLVE = { id: 129, action: "resolve", note: "Rob: same person — merged." };
const LIVE_REOPEN = { id: 137, action: "reopen" };

describe("unverifiedActorRefusal", () => {
  it("lets the two payloads the dashboard sends today through", () => {
    expect(unverifiedActorRefusal(LIVE_RESOLVE)).toBeNull();
    expect(unverifiedActorRefusal(LIVE_REOPEN)).toBeNull();
    expect(unverifiedActorRefusal({ id: 1, action: "read" })).toBeNull();
  });

  it("refuses every spelling of an author claim, camelCase and snake_case alike", () => {
    for (const field of ACTOR_CLAIM_FIELDS) {
      const message = unverifiedActorRefusal({ ...LIVE_RESOLVE, [field]: "dana" });
      expect(message, field).not.toBeNull();
      expect(message, field).toContain(field);
    }
  });

  it("names the alternative instead of only saying no", () => {
    const message = unverifiedActorRefusal({ ...LIVE_RESOLVE, resolvedBy: "rob" });
    // inc.93's rule: a refusal that states the way back is an answer, not a wall.
    expect(message).toContain("resolution note");
    expect(message).toContain("no signed-in user");
  });

  it("says an empty claim is no claim — a caller agreeing with this file is not punished", () => {
    // inc.48: 409-ing a no-op teaches a caller to fear a button that did nothing wrong.
    expect(unverifiedActorRefusal({ ...LIVE_RESOLVE, actor: "" })).toBeNull();
    expect(unverifiedActorRefusal({ ...LIVE_RESOLVE, actor: "   " })).toBeNull();
    expect(unverifiedActorRefusal({ ...LIVE_RESOLVE, resolved_by: null })).toBeNull();
    expect(unverifiedActorRefusal({ ...LIVE_RESOLVE, resolved_by: undefined })).toBeNull();
  });

  it("refuses a non-string claim too — an object or an id is still an assertion", () => {
    expect(unverifiedActorRefusal({ ...LIVE_RESOLVE, actor: { name: "dana" } })).not.toBeNull();
    expect(unverifiedActorRefusal({ ...LIVE_RESOLVE, user_id: 7 })).not.toBeNull();
  });

  it("lists every field claimed, so a caller sending three is not told about one", () => {
    const message = unverifiedActorRefusal({ ...LIVE_RESOLVE, actor: "a", reviewer: "b", user: "c" });
    expect(message).toContain("actor");
    expect(message).toContain("reviewer");
    expect(message).toContain("user");
  });

  it("is null for anything that is not an object — the route's json() can return either", () => {
    expect(unverifiedActorRefusal(null)).toBeNull();
    expect(unverifiedActorRefusal(undefined)).toBeNull();
    expect(unverifiedActorRefusal("actor")).toBeNull();
    expect(unverifiedActorRefusal(42)).toBeNull();
  });
});

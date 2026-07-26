import { describe, it, expect } from "vitest";
import {
  canShareWithTeam,
  resolveViewIdentity,
  viewSaveScope,
} from "@/lib/filters/viewIdentity";

describe("resolveViewIdentity", () => {
  it("resolves a configured owner, with and without a team", () => {
    expect(resolveViewIdentity({ owner: "rob", team: "mle" })).toEqual({
      owner: "rob",
      team: "mle",
    });
    expect(resolveViewIdentity({ owner: "rob" })).toEqual({ owner: "rob", team: null });
  });

  it("trims — a trailing newline off a shell-set variable is not a different rep", () => {
    expect(resolveViewIdentity({ owner: "  rob\n", team: " mle " })).toEqual({
      owner: "rob",
      team: "mle",
    });
  });

  it("returns null when nothing is configured — never a stand-in owner", () => {
    expect(resolveViewIdentity({})).toBeNull();
    expect(resolveViewIdentity({ owner: "" })).toBeNull();
    expect(resolveViewIdentity({ owner: "   " })).toBeNull();
    expect(resolveViewIdentity({ owner: null })).toBeNull();
    expect(resolveViewIdentity({ owner: undefined as unknown as string })).toBeNull();
  });

  it("refuses placeholders a build pipeline substitutes for an unset variable", () => {
    for (const junk of ["undefined", "null", "NONE", "changeme", "your-owner-id"]) {
      expect(resolveViewIdentity({ owner: junk })).toBeNull();
    }
  });

  it("a team with no owner is not an identity", () => {
    // Otherwise this browser lists the team's shared views under a person who cannot
    // save, rename or delete any of them.
    expect(resolveViewIdentity({ team: "mle" })).toBeNull();
  });

  it("a placeholder team degrades to no team, it does not void the identity", () => {
    expect(resolveViewIdentity({ owner: "rob", team: "undefined" })).toEqual({
      owner: "rob",
      team: null,
    });
  });
});

describe("viewSaveScope", () => {
  const rob = { owner: "rob", team: "mle" };

  it("defaults to personal", () => {
    expect(viewSaveScope(rob)).toEqual({ scope: "personal", owner_id: "rob", team_id: null });
  });

  it("files a shared view under the team, keeping the owner", () => {
    expect(viewSaveScope(rob, true)).toEqual({
      scope: "team",
      owner_id: "rob",
      team_id: "mle",
    });
  });

  it("a rep with no team cannot produce a team row with a null team_id", () => {
    // 0019's partial index would treat that as one global name space: a view nobody can
    // find under a name nobody else can reuse.
    expect(viewSaveScope({ owner: "rob", team: null }, true)).toEqual({
      scope: "personal",
      owner_id: "rob",
      team_id: null,
    });
  });
});

describe("canShareWithTeam", () => {
  it("is false without an identity or without a team", () => {
    expect(canShareWithTeam(null)).toBe(false);
    expect(canShareWithTeam({ owner: "rob", team: null })).toBe(false);
    expect(canShareWithTeam({ owner: "rob", team: "mle" })).toBe(true);
  });
});

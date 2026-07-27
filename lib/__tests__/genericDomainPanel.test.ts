import { describe, it, expect } from "vitest";
import {
  addOutcome,
  removeOutcome,
  blocklistView,
  floorCaption,
} from "@/lib/comms/genericDomainPanel";

// Q69 inc.26. These tests exist for one reason: the route answers 200 in cases
// where NOTHING was written, and a panel that trusts `r.ok` turns each of those
// into a lie the reviewer acts on.

describe("addOutcome", () => {
  it("reports a real block as changed, so the list refetches", () => {
    const o = addOutcome(200, { ok: true, domain: "mailchimp.com", added: true });
    expect(o.changed).toBe(true);
    expect(o.tone).toBe("ok");
    expect(o.text).toContain("mailchimp.com");
  });

  it("does NOT claim a block when the domain is already in the built-in floor", () => {
    const o = addOutcome(200, {
      ok: true,
      domain: "gmail.com",
      added: false,
      alreadyBlocked: "built-in",
      detail: "gmail.com is already treated as generic and always will be.",
    });
    expect(o.changed).toBe(false);
    expect(o.tone).not.toBe("ok");
    expect(o.text).toBe("gmail.com is already treated as generic and always will be.");
  });

  it("does NOT claim a block when the row already existed", () => {
    const o = addOutcome(200, {
      ok: true,
      domain: "constantcontact.com",
      added: false,
      alreadyBlocked: "row",
      detail: "constantcontact.com was already on your blocklist.",
    });
    expect(o.changed).toBe(false);
    expect(o.text).toContain("already");
  });

  it("shows a 422 refusal verbatim — and never leaks a narrowed domain of its own", () => {
    const o = addOutcome(422, {
      ok: false,
      refused: "looks like an address, not a domain",
      value: "billing@roofco.com",
      detail:
        '"billing@roofco.com" is an email address. Blocking its whole domain off one address is too broad — if you do mean the domain, enter just the part after the @.',
    });
    expect(o.tone).toBe("warn");
    expect(o.changed).toBe(false);
    expect(o.text).toBe(
      '"billing@roofco.com" is an email address. Blocking its whole domain off one address is too broad — if you do mean the domain, enter just the part after the @.'
    );
  });

  it("surfaces a write failure as an error, not a shrug", () => {
    const o = addOutcome(500, { ok: false, error: "write-failed", detail: "connection reset" });
    expect(o.tone).toBe("error");
    expect(o.text).toBe("connection reset");
  });

  it("says no-database out loud instead of rendering silence", () => {
    const o = addOutcome(503, { ok: false, error: "no-database", detail: "The editable blocklist lives in Supabase." });
    expect(o.changed).toBe(false);
    expect(o.text).toContain("Supabase");
  });

  it("a dropped request asks for a reload, never a re-click", () => {
    const o = addOutcome(null, null);
    expect(o.changed).toBe(false);
    expect(o.text).toMatch(/may or may not/);
    expect(o.text).toMatch(/Reload/);
  });
});

describe("removeOutcome", () => {
  it("reports a real unblock as changed", () => {
    const o = removeOutcome(200, { ok: true, domain: "acme-mail.com", removed: true });
    expect(o).toMatchObject({ tone: "ok", changed: true });
  });

  it("does NOT report an unblock when nothing was removed", () => {
    const o = removeOutcome(200, {
      ok: true,
      domain: "nope.com",
      removed: false,
      detail: "nope.com was not on your blocklist — nothing to remove.",
    });
    expect(o.changed).toBe(false);
    expect(o.tone).toBe("info");
  });

  it("409 (built-in floor) is a standing fact, not a retryable error", () => {
    const o = removeOutcome(409, {
      ok: false,
      refused: "in-code-floor",
      detail: "gmail.com is in the built-in generic list, not the editable one.",
    });
    expect(o.tone).toBe("warn");
    expect(o.changed).toBe(false);
    expect(o.text).toContain("built-in");
  });
});

describe("blocklistView", () => {
  it("renders rows only from a successful, readable GET", () => {
    const v = blocklistView(200, {
      ok: true,
      readable: true,
      floorCount: 92,
      added: [{ domain: "mailchimp.com", note: null, added_by: null, created_at: "2026-07-27" }],
    });
    expect(v.kind).toBe("ready");
    expect(v.rows).toHaveLength(1);
    expect(v.floorCount).toBe(92);
  });

  it("never says 'none blocked' when the extras could not be read", () => {
    const v = blocklistView(502, { ok: false, readable: false, floorCount: 92, detail: "read failed" });
    expect(v.kind).toBe("unreadable");
    expect(v.rows).toEqual([]);
    expect(v.notice).toBe("read failed");
  });

  it("treats the no-database 200 as unreadable, not as an empty list", () => {
    // The route answers `ok:true, added:[], readable:false` with no Supabase env.
    // An honest empty state is a claim about the database we cannot make here.
    const v = blocklistView(200, { ok: true, added: [], floorCount: 92, readable: false });
    expect(v.kind).toBe("unreadable");
    expect(v.floorCount).toBe(92);
  });

  it("an unreachable route still says the built-in list applies", () => {
    const v = blocklistView(null, null);
    expect(v.kind).toBe("unreadable");
    expect(v.notice).toContain("built-in");
  });

  it("an empty readable list IS an empty list", () => {
    const v = blocklistView(200, { ok: true, added: [], floorCount: 92, readable: true });
    expect(v.kind).toBe("ready");
    expect(v.rows).toEqual([]);
  });
});

describe("floorCaption", () => {
  it("states the floor so the panel never implies the rows are the whole list", () => {
    expect(floorCaption(92)).toContain("92");
    expect(floorCaption(92)).toContain("cannot be removed");
  });

  it("degrades without inventing a count", () => {
    expect(floorCaption(0)).not.toMatch(/\d/);
  });
});

// ── Q69 inc.27 — the forward-only claim footnote ─────────────────────────────
// A block is forward-only. When the route reports that a company already holds
// the domain (or that it couldn't check), the panel must carry that alongside
// the outcome — a bare green "blocked!" reads as "the CRM is clean now".

describe("addOutcome — existing-claim footnote", () => {
  const claimed = {
    kind: "claimed",
    text: "Heads up: BigMailer Inc already holds bigmailer.com...",
    links: [{ id: "org-bm", name: "BigMailer Inc", href: "/companies/org-bm" }],
  };

  it("attaches the claim to a successful block without softening the success", () => {
    const o = addOutcome(200, { domain: "bigmailer.com", added: true, claim: claimed });
    expect(o.tone).toBe("ok");
    expect(o.changed).toBe(true);
    expect(o.claim?.kind).toBe("claimed");
    expect(o.claim?.links).toHaveLength(1);
  });

  it("attaches it to already-blocked too — the stale company is the same either way", () => {
    const o = addOutcome(200, {
      domain: "bigmailer.com",
      added: false,
      alreadyBlocked: "row",
      detail: "bigmailer.com was already on your blocklist.",
      claim: claimed,
    });
    expect(o.changed).toBe(false);
    expect(o.claim?.kind).toBe("claimed");
  });

  it("carries 'couldn't check' through as unknown, never as silence", () => {
    const o = addOutcome(200, {
      domain: "bigmailer.com",
      added: true,
      claim: { kind: "unknown", text: "Couldn't check whether a company already holds bigmailer.com.", links: [] },
    });
    expect(o.claim?.kind).toBe("unknown");
    expect(o.claim?.text).toContain("Couldn't check");
  });

  it("has no claim when the route sent none — nothing is invented", () => {
    expect(addOutcome(200, { domain: "bigmailer.com", added: true }).claim).toBeUndefined();
  });

  it("drops a malformed claim rather than half-rendering it", () => {
    expect(addOutcome(200, { domain: "x.com", added: true, claim: { kind: "claimed" } }).claim).toBeUndefined();
    expect(addOutcome(200, { domain: "x.com", added: true, claim: { kind: "nope", text: "hi" } }).claim).toBeUndefined();
    expect(addOutcome(200, { domain: "x.com", added: true, claim: "claimed" }).claim).toBeUndefined();
  });

  it("keeps only well-formed links", () => {
    const o = addOutcome(200, {
      domain: "x.com",
      added: true,
      claim: { kind: "claimed", text: "held", links: [{ id: "a" }, { id: "b", name: "B", href: "/companies/b" }] },
    });
    expect(o.claim?.links).toEqual([{ id: "b", name: "B", href: "/companies/b" }]);
  });
});

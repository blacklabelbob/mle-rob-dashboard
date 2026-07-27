import { describe, it, expect } from "vitest";
import {
  flagOutcome,
  heldDomainFlagPayload,
  heldDomainFlagTitle,
  heldFlagDomain,
  heldFlagIndex,
  flagAffordance,
  heldRowCopy,
  heldArchiveNote,
  type HeldFlagIndex,
} from "@/lib/comms/heldDomainFlag";
import type { AuditFinding } from "@/lib/comms/genericDomainAudit";

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    domain: "bigmailer.com",
    orgs: [{ id: "org-1", name: "Big Mailer LLC", href: "/companies/org-1" }],
    text: "Big Mailer LLC still holds bigmailer.com, which is on your blocklist.",
    ...over,
  };
}

describe("held-domain flag title", () => {
  it("round-trips the domain through the title contract", () => {
    expect(heldFlagDomain(heldDomainFlagTitle("bigmailer.com"))).toBe("bigmailer.com");
  });

  it("normalizes case so one domain cannot produce two ledger titles", () => {
    expect(heldDomainFlagTitle(" BigMailer.com ")).toBe(heldDomainFlagTitle("bigmailer.com"));
  });

  it("returns null for an ordinary ledger row", () => {
    expect(heldFlagDomain("New company domain: roofco.com")).toBeNull();
    expect(heldFlagDomain("Invoice missing")).toBeNull();
  });
});

describe("held-domain flag payload", () => {
  it("files a single-company finding ON that company's record", () => {
    const p = heldDomainFlagPayload(finding())!;
    expect(p.entityId).toBe("org-1");
    expect(p.entityName).toBe("Big Mailer LLC");
    expect(p.title).toBe(heldDomainFlagTitle("bigmailer.com"));
  });

  it("refuses to pick one of several companies — the subject is the domain", () => {
    const p = heldDomainFlagPayload(
      finding({
        orgs: [
          { id: "org-1", name: "Big Mailer LLC", href: "/companies/org-1" },
          { id: "org-2", name: "Mailer Holdings", href: "/companies/org-2" },
        ],
      })
    )!;
    // entity_id drives the record-page link and the person filter; attaching a
    // two-company finding to one of them is a quiet mis-filing.
    expect(p.entityId).toBeNull();
    expect(p.entityName).toBe("bigmailer.com");
    expect(p.detail).toContain("Big Mailer LLC");
    expect(p.detail).toContain("Mailer Holdings");
  });

  it("names every company and links to every record", () => {
    const p = heldDomainFlagPayload(
      finding({
        orgs: [
          { id: "org-1", name: "Big Mailer LLC", href: "/companies/org-1" },
          { id: "org-2", name: "Mailer Holdings", href: "/companies/org-2" },
        ],
      })
    )!;
    expect(p.detail).toContain("/companies/org-1");
    expect(p.detail).toContain("/companies/org-2");
  });

  it("says in words what flagging does NOT change — read-only, still blocked", () => {
    const p = heldDomainFlagPayload(finding())!;
    expect(p.detail).toMatch(/Nothing above was changed/);
    expect(p.detail).toMatch(/stays blocked/);
    // HARD LIMIT: nothing here instructs or implies a delete/merge/rename.
    expect(p.detail).not.toMatch(/delete|merge|rename|removed/i);
  });

  it("is medium severity — a review item, not an emergency", () => {
    expect(heldDomainFlagPayload(finding())!.severity).toBe("medium");
  });

  it("refuses a finding with no company rather than filing an unactionable row", () => {
    expect(heldDomainFlagPayload(finding({ orgs: [] }))).toBeNull();
  });

  it("refuses a finding with no domain", () => {
    expect(heldDomainFlagPayload(finding({ domain: "  " }))).toBeNull();
  });
});

describe("flag outcome", () => {
  it("reports success only on a 200 that actually said ok", () => {
    const o = flagOutcome(200, { ok: true });
    expect(o.flagged).toBe(true);
    expect(o.tone).toBe("ok");
    expect(o.text).toMatch(/Things to Address/);
  });

  it("does NOT claim a write on a 200 whose shape drifted", () => {
    const o = flagOutcome(200, { flags: [] });
    expect(o.flagged).toBe(false);
    expect(o.tone).toBe("error");
  });

  it("shows the server's own sentence on a refusal", () => {
    const o = flagOutcome(400, { error: "need entityName, title, detail" });
    expect(o.text).toBe("need entityName, title, detail");
    expect(o.flagged).toBe(false);
  });

  it("still says something actionable when the server explains nothing", () => {
    expect(flagOutcome(500, null).text).toMatch(/500/);
  });

  it("asks for a look, not a re-click, when the request never came back", () => {
    const o = flagOutcome(null, null);
    expect(o.flagged).toBe(false);
    expect(o.text).toMatch(/check Things to Address/);
  });
});

// ── Q69 inc.31 — cross-session dedupe ───────────────────────────────────────

describe("held-flag index", () => {
  const ok = (flags: unknown[]) => heldFlagIndex(200, { flags });

  it("indexes an open held-domain row by its domain", () => {
    const i = ok([{ status: "open", title: heldDomainFlagTitle("BigMailer.com") }]);
    expect(i.kind).toBe("read");
    expect(i.kind === "read" && i.domains.has("bigmailer.com")).toBe(true);
  });

  it("ignores ordinary ledger rows that are not held-domain flags", () => {
    const i = ok([{ status: "open", title: "New company proposed: Acme" }]);
    expect(i.kind === "read" && i.domains.size).toBe(0);
  });

  it("does NOT count a resolved row — a re-found domain is a new question", () => {
    const i = ok([{ status: "resolved", title: heldDomainFlagTitle("bigmailer.com") }]);
    expect(i.kind === "read" && i.domains.size).toBe(0);
  });

  it("does NOT count a row whose status it cannot read", () => {
    const i = ok([{ title: heldDomainFlagTitle("bigmailer.com") }]);
    expect(i.kind === "read" && i.domains.size).toBe(0);
  });

  it("lets an open row win over a resolved one for the same domain", () => {
    const i = ok([
      { status: "resolved", title: heldDomainFlagTitle("bigmailer.com") },
      { status: "open", title: heldDomainFlagTitle("bigmailer.com") },
    ]);
    expect(i.kind === "read" && i.domains.has("bigmailer.com")).toBe(true);
  });

  it("survives junk rows instead of losing the whole ledger read", () => {
    const i = ok([null, "nope", { status: "open", title: 7 }, { status: "open", title: heldDomainFlagTitle("x.com") }]);
    expect(i.kind === "read" && i.domains.has("x.com")).toBe(true);
  });

  it("is UNKNOWN, never empty, when the ledger could not be read", () => {
    expect(heldFlagIndex(500, null).kind).toBe("unknown");
    expect(heldFlagIndex(null, null).kind).toBe("unknown");
    expect(heldFlagIndex(200, { error: "boom" }).kind).toBe("unknown");
    expect(heldFlagIndex(200, null).kind).toBe("unknown");
  });

  it("reads an empty ledger as read-and-empty, not unknown", () => {
    expect(ok([]).kind).toBe("read");
  });
});

describe("flag affordance", () => {
  const read = (...d: string[]): HeldFlagIndex => ({ kind: "read", domains: new Set(d), judged: new Map() });

  it("offers the button when the ledger has no open row for the domain", () => {
    expect(flagAffordance("bigmailer.com", read()).kind).toBe("button");
  });

  it("says it is already waiting when the ledger has an open row", () => {
    const a = flagAffordance("bigmailer.com", read("bigmailer.com"));
    expect(a.kind).toBe("already");
    expect(a.kind === "already" && a.text).toMatch(/Already on Things to Address/);
  });

  it("keeps the button when the ledger could not be read — never hides the way out", () => {
    expect(flagAffordance("bigmailer.com", { kind: "unknown" }).kind).toBe("button");
  });

  it("lets this session's successful post win over a stale index", () => {
    const a = flagAffordance("bigmailer.com", read(), flagOutcome(200, { ok: true }));
    expect(a.kind).toBe("already");
    expect(a.kind === "already" && a.text).toMatch(/still be there/);
  });

  it("does not treat a FAILED post as already-flagged", () => {
    expect(flagAffordance("bigmailer.com", read(), flagOutcome(500, null)).kind).toBe("button");
  });

  it("matches case-insensitively, the way the title contract stores it", () => {
    expect(flagAffordance("  BigMailer.COM ", read("bigmailer.com")).kind).toBe("already");
  });
});

// ── Q69 inc.32 — the ledger-side row copy ───────────────────────────────────
describe("held-domain ledger row copy", () => {
  it("reads a held-domain row off the same title contract that wrote it", () => {
    const c = heldRowCopy(heldDomainFlagTitle("BigMailer.com"))!;
    expect(c).not.toBeNull();
    expect(c.domain).toBe("bigmailer.com");
    expect(c.badge).toContain("bigmailer.com");
  });

  it("says the domain is STILL BLOCKED on the row, not only in the prose", () => {
    // The whole point: a reviewer scanning rows must not read "flagged" as
    // "someone unblocked it".
    expect(heldRowCopy(heldDomainFlagTitle("bigmailer.com"))!.badge).toMatch(/still blocked/i);
  });

  it("is null for an ordinary finding and for a company proposal", () => {
    // A "still blocked" badge on a row where nothing is blocked is the noise
    // that teaches Rob to ignore the badge on the row that means it.
    expect(heldRowCopy("Invoice missing")).toBeNull();
    expect(heldRowCopy("New company domain: roofco.com")).toBeNull();
  });

  it("is null for a near-miss title rather than rendering a blank domain", () => {
    expect(heldRowCopy("Blocked domain still held")).toBeNull();
    expect(heldRowCopy("Blocked domain still held: ")).toBeNull();
  });

  it("tells the reviewer resolving does not unblock and does not delete", () => {
    const c = heldRowCopy(heldDomainFlagTitle("bigmailer.com"))!;
    expect(c.hint).toMatch(/does not unblock/i);
    expect(c.hint).toMatch(/does not delete/i);
    expect(c.hint).toContain("bigmailer.com");
  });

  it("warns the sweep can raise it again — inc.31 dedupes only OPEN rows", () => {
    // Resolve elsewhere on this ledger means "this stops coming back"; a row
    // that quietly returns next week reads as a bug rather than the design.
    expect(heldRowCopy(heldDomainFlagTitle("bigmailer.com"))!.hint).toMatch(/again/i);
  });

  it("links back to the blocklist with an ABSOLUTE href — the row renders on record pages too", () => {
    // A single-company finding files onto that company's record (inc.30), where
    // a bare "#generic-domains" scrolls to nothing.
    const c = heldRowCopy(heldDomainFlagTitle("bigmailer.com"))!;
    expect(c.href.startsWith("/")).toBe(true);
    expect(c.href).toContain("#");
    expect(c.linkText.trim().length).toBeGreaterThan(0);
  });
});

// ── Q69 inc.33 — the sweep remembers a judgement it already got ─────────────

describe("already-judged domains", () => {
  const ok = (flags: unknown[]) => heldFlagIndex(200, { flags });
  const resolved = (domain: string, resolved_at?: unknown) => ({
    status: "resolved",
    title: heldDomainFlagTitle(domain),
    ...(resolved_at === undefined ? {} : { resolved_at }),
  });

  it("indexes a RESOLVED held-domain row with the date Rob judged it", () => {
    const i = ok([resolved("BigMailer.com", "2026-07-24")]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")).toBe("2026-07-24");
  });

  it("keeps the resolved row OUT of the open set — the button must survive", () => {
    // inc.31's call stands: a re-found domain is a new question.
    const i = ok([resolved("bigmailer.com", "2026-07-24")]);
    expect(i.kind === "read" && i.domains.size).toBe(0);
    expect(flagAffordance("bigmailer.com", i).kind).toBe("button");
  });

  it("tells Rob he already resolved it, with the date, next to the button", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com", "2026-07-24")]));
    expect(a.kind === "button" && a.judged).toMatch(/already resolved/i);
    expect(a.kind === "button" && a.judged).toContain("2026-07-24");
  });

  it("says 'earlier' rather than inventing a date it cannot read", () => {
    // A wrong date on a review item is worse than none: Rob reasons about
    // whether his decision predates whatever changed.
    for (const bad of [undefined, null, 7, "", "last tuesday"]) {
      const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com", bad)]));
      expect(a.kind === "button" && a.judged).toMatch(/earlier/);
      expect(a.kind === "button" && a.judged).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("normalises a timestamped resolved_at to its date, never half-printed", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com", "2026-07-24T18:03:11Z")]));
    expect(a.kind === "button" && a.judged).toContain("2026-07-24");
    expect(a.kind === "button" && a.judged).not.toContain("T18");
  });

  it("keeps the LATEST judgement when a domain was resolved more than once", () => {
    const i = ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24")]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")).toBe("2026-07-24");
    const j = ok([resolved("bigmailer.com", "2026-07-24"), resolved("bigmailer.com", "2026-07-20")]);
    expect(j.kind === "read" && j.judged.get("bigmailer.com")).toBe("2026-07-24");
  });

  it("prefers a dated row over an undated one for the same domain", () => {
    const i = ok([resolved("bigmailer.com"), resolved("bigmailer.com", "2026-07-24")]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")).toBe("2026-07-24");
  });

  it("does NOT treat an unreadable status as a judgement", () => {
    // Same call inc.31 made about counting it as open: we did not see a decision.
    const i = ok([{ title: heldDomainFlagTitle("bigmailer.com"), resolved_at: "2026-07-24" }]);
    expect(i.kind === "read" && i.judged.size).toBe(0);
  });

  it("shows no note for a domain the ledger has never held a row for", () => {
    const a = flagAffordance("newone.com", ok([resolved("bigmailer.com", "2026-07-24")]));
    expect(a.kind === "button" && a.judged).toBeNull();
  });

  it("shows no note when the ledger could not be read — unknown is not 'never judged'", () => {
    const a = flagAffordance("bigmailer.com", { kind: "unknown" });
    expect(a.kind === "button" && a.judged).toBeNull();
  });

  it("lets an OPEN row win over a resolved one — the live question outranks the note", () => {
    const i = ok([resolved("bigmailer.com", "2026-07-24"), { status: "open", title: heldDomainFlagTitle("bigmailer.com") }]);
    expect(flagAffordance("bigmailer.com", i).kind).toBe("already");
  });
});

// ── Q69 inc.34 — the resolved row, from the side Rob closed it on ───────────

describe("heldArchiveNote", () => {
  const title = heldDomainFlagTitle("bigmailer.com");

  it("names the domain and dates the decision", () => {
    const n = heldArchiveNote(title, "2026-07-24");
    expect(n).toContain("bigmailer.com");
    expect(n).toContain("on 2026-07-24");
  });

  it("says the closure did NOT unblock or delete anything", () => {
    const n = heldArchiveNote(title, "2026-07-24") ?? "";
    expect(n).toMatch(/stays blocked/);
    expect(n).toMatch(/nothing was deleted/i);
  });

  it("warns that the sweep will raise it again — this ledger's 'resolved' means the opposite", () => {
    expect(heldArchiveNote(title, "2026-07-24")).toMatch(/raise a new row/);
  });

  it("is null for an ordinary finding — a 'this can come back' line where it cannot is noise", () => {
    expect(heldArchiveNote("Missing phone number", "2026-07-24")).toBeNull();
  });

  it("is null for a company proposal — archiveConsequence owns that row", () => {
    expect(heldArchiveNote("New company proposed: bigmailer.com", "2026-07-24")).toBeNull();
  });

  it("says 'earlier' rather than half-printing an unparseable date", () => {
    const n = heldArchiveNote(title, "last Tuesday") ?? "";
    expect(n).toContain("earlier");
    expect(n).not.toContain("last Tuesday");
  });

  it("survives a null/absent resolved_at without printing 'null'", () => {
    for (const v of [null, undefined, 12345, {}]) {
      const n = heldArchiveNote(title, v) ?? "";
      expect(n).toContain("earlier");
      expect(n).not.toMatch(/null|undefined|NaN|object/);
    }
  });

  it("normalises a timestamp to the same date the panel note shows — one decision, one date", () => {
    // The two sentences are read a week apart about the same row; they must agree.
    const i = heldFlagIndex(200, {
      flags: [{ status: "resolved", title, resolved_at: "2026-07-24T18:03:11.000Z" }],
    });
    const panel = flagAffordance("bigmailer.com", i);
    expect(panel.kind === "button" && panel.judged).toContain("on 2026-07-24");
    expect(heldArchiveNote(title, "2026-07-24T18:03:11.000Z")).toContain("on 2026-07-24");
  });

  it("lower-cases the domain it echoes back", () => {
    expect(heldArchiveNote(heldDomainFlagTitle("BigMailer.COM"), "2026-07-24")).toContain("bigmailer.com");
  });

  it("is null for a held-domain title with no domain in it", () => {
    expect(heldArchiveNote("Blocked domain still held: ", "2026-07-24")).toBeNull();
  });
});

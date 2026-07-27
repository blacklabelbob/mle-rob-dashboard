import { describe, it, expect } from "vitest";
import {
  flagOutcome,
  heldDomainFlagPayload,
  heldDomainFlagTitle,
  heldFlagDomain,
  heldFlagIndex,
  flagAffordance,
  heldRowCopy,
  archiveRepeatMark,
  heldArchiveNote,
  heldArchivePlaces,
  heldPriorJudgements,
  findingRepeatMark,
  badgeRepeatMark,
  ledgerRepeatMark,
  rowRepeatMark,
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
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.date).toBe("2026-07-24");
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
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.date).toBe("2026-07-24");
    const j = ok([resolved("bigmailer.com", "2026-07-24"), resolved("bigmailer.com", "2026-07-20")]);
    expect(j.kind === "read" && j.judged.get("bigmailer.com")?.date).toBe("2026-07-24");
  });

  it("prefers a dated row over an undated one for the same domain", () => {
    const i = ok([resolved("bigmailer.com"), resolved("bigmailer.com", "2026-07-24")]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.date).toBe("2026-07-24");
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

  // ── Q69 inc.35 — how many times this domain has been round the loop ────────

  it("counts one resolved row as one trip round the loop", () => {
    const i = ok([resolved("bigmailer.com", "2026-07-24")]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.times).toBe(1);
  });

  it("counts UNDATED resolved rows too — they are trips we cannot date, not trips that did not happen", () => {
    const i = ok([resolved("bigmailer.com"), resolved("bigmailer.com", "2026-07-24"), resolved("bigmailer.com")]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.times).toBe(3);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.date).toBe("2026-07-24");
  });

  it("counts per domain, never across them", () => {
    const i = ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24"), resolved("sendgrid.net", "2026-07-24")]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.times).toBe(2);
    expect(i.kind === "read" && i.judged.get("sendgrid.net")?.times).toBe(1);
  });

  it("never counts an open row or an unreadable one as a judgement", () => {
    // The count claims Rob DECIDED this many times; a pending question and a
    // row we cannot read are both "no decision seen" (inc.31/33's call).
    const i = ok([
      resolved("bigmailer.com", "2026-07-24"),
      { status: "open", title: heldDomainFlagTitle("sendgrid.net") },
      { title: heldDomainFlagTitle("sendgrid.net"), resolved_at: "2026-07-24" },
    ]);
    expect(i.kind === "read" && i.judged.get("bigmailer.com")?.times).toBe(1);
    expect(i.kind === "read" && i.judged.has("sendgrid.net")).toBe(false);
  });

  it("says nothing about the count on a FIRST judgement — 'once' is a wasted word", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com", "2026-07-24")]));
    expect(a.kind === "button" && a.judged).toMatch(/already resolved/i);
    expect(a.kind === "button" && a.judged).not.toMatch(/\d+ times/);
  });

  it("carries the count from the SECOND trip, with the latest date", () => {
    const a = flagAffordance(
      "bigmailer.com",
      ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24")])
    );
    expect(a.kind === "button" && a.judged).toContain("2 times");
    expect(a.kind === "button" && a.judged).toContain("most recently");
    expect(a.kind === "button" && a.judged).toContain("2026-07-24");
    expect(a.kind === "button" && a.judged).not.toContain("2026-07-20");
  });

  it("prints the real count, not a threshold word", () => {
    const rows = ["2026-07-10", "2026-07-14", "2026-07-20", "2026-07-24"].map((d) => resolved("bigmailer.com", d));
    const a = flagAffordance("bigmailer.com", ok(rows));
    expect(a.kind === "button" && a.judged).toContain("4 times");
  });

  it("keeps 'earlier' when repeats carry no readable date — a count is not permission to invent one", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com"), resolved("bigmailer.com", "nope")]));
    expect(a.kind === "button" && a.judged).toContain("2 times");
    expect(a.kind === "button" && a.judged).toMatch(/earlier/);
    expect(a.kind === "button" && a.judged).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("still offers the button on a domain judged many times — the count informs, it does not decide", () => {
    const rows = [1, 2, 3, 4, 5].map(() => resolved("bigmailer.com", "2026-07-24"));
    expect(flagAffordance("bigmailer.com", ok(rows)).kind).toBe("button");
  });

  it("never leaks NaN/undefined into the note", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com"), resolved("bigmailer.com")]));
    const text = a.kind === "button" ? String(a.judged) : "";
    expect(text).not.toMatch(/NaN|undefined|null/);
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

// ── Q69 inc.36 — the archive row names WHICH trip round the loop it was ─────

describe("heldArchivePlaces / heldArchiveNote ordinal", () => {
  const title = heldDomainFlagTitle("bigmailer.com");
  const row = (id: number, resolved_at: string | null, t = title, status = "resolved") => ({
    id,
    title: t,
    status,
    resolved_at,
  });

  it("orders a domain's resolved rows by date and numbers them", () => {
    const places = heldArchivePlaces([row(3, "2026-07-24"), row(1, "2026-07-10"), row(2, "2026-07-18")]);
    expect(places.get(1)).toEqual({ nth: 1, of: 3 });
    expect(places.get(2)).toEqual({ nth: 2, of: 3 });
    expect(places.get(3)).toEqual({ nth: 3, of: 3 });
  });

  it("says how many but not which when a row cannot be dated", () => {
    const places = heldArchivePlaces([row(1, "2026-07-10"), row(2, null)]);
    expect(places.get(1)).toEqual({ nth: null, of: 2 });
    expect(places.get(2)).toEqual({ nth: null, of: 2 });
  });

  it("declines to order two decisions taken on the same day", () => {
    const places = heldArchivePlaces([row(1, "2026-07-10"), row(2, "2026-07-10")]);
    expect(places.get(1)?.nth).toBeNull();
    expect(places.get(1)?.of).toBe(2);
  });

  it("counts only resolved rows — an open row is not a decision", () => {
    const places = heldArchivePlaces([row(1, "2026-07-10"), row(2, null, title, "open")]);
    expect(places.get(1)).toEqual({ nth: 1, of: 1 });
    expect(places.has(2)).toBe(false);
  });

  it("keeps each domain's history separate", () => {
    const other = heldDomainFlagTitle("gmail.com");
    const places = heldArchivePlaces([row(1, "2026-07-10"), row(2, "2026-07-11", other)]);
    expect(places.get(1)).toEqual({ nth: 1, of: 1 });
    expect(places.get(2)).toEqual({ nth: 1, of: 1 });
  });

  it("ignores proposals, ordinary findings and unreadable rows", () => {
    const places = heldArchivePlaces([
      row(1, "2026-07-10", "New company proposed: bigmailer.com"),
      row(2, "2026-07-10", "Missing phone number"),
      null,
      "nope",
      { id: "x", status: "resolved", title },
    ]);
    expect(places.size).toBe(0);
  });

  it("is an empty map for a non-array body", () => {
    expect(heldArchivePlaces(null).size).toBe(0);
    expect(heldArchivePlaces({ flags: [] }).size).toBe(0);
  });

  it("adds no ordinal when the domain has one decision on record", () => {
    const n = heldArchiveNote(title, "2026-07-24", { nth: 1, of: 1 }) ?? "";
    expect(n).not.toMatch(/decision 1/);
    expect(n).toMatch(/stays blocked/);
  });

  it("adds no ordinal when the archive passes nothing", () => {
    expect(heldArchiveNote(title, "2026-07-24")).toBe(heldArchiveNote(title, "2026-07-24", null));
  });

  it("names the position when the rows could be ordered", () => {
    expect(heldArchiveNote(title, "2026-07-24", { nth: 2, of: 3 })).toContain("decision 2 of 3 on this domain");
  });

  it("gives the count without a position when they could not", () => {
    const n = heldArchiveNote(title, "2026-07-24", { nth: null, of: 3 }) ?? "";
    expect(n).toContain("3 decisions on this domain");
    expect(n).not.toMatch(/decision \d of/);
  });

  it("never leaks null/undefined/NaN into the ordinal sentence", () => {
    for (const p of [{ nth: null, of: 4 }, { nth: 4, of: 4 }] as const) {
      expect(heldArchiveNote(title, "2026-07-24", p) ?? "").not.toMatch(/null|undefined|NaN/);
    }
  });

  it("agrees with the panel: `of` equals inc.35's `times` for the same rows", () => {
    const rows = [row(1, "2026-07-10"), row(2, "2026-07-18"), row(3, null)];
    const idx = heldFlagIndex(200, { flags: rows });
    const places = heldArchivePlaces(rows);
    if (idx.kind !== "read") throw new Error("expected read");
    expect(places.get(1)?.of).toBe(idx.judged.get("bigmailer.com")?.times);
  });
});


// ── Q69 inc.37 — the history follows the question onto the OPEN row ─────────

describe("an already-waiting row carries the same history", () => {
  const ok = (flags: unknown[]) => heldFlagIndex(200, { flags });
  const open = (domain: string) => ({ status: "open", title: heldDomainFlagTitle(domain) });
  const resolved = (domain: string, resolved_at?: unknown) => ({
    status: "resolved",
    title: heldDomainFlagTitle(domain),
    ...(resolved_at === undefined ? {} : { resolved_at }),
  });
  const text = (a: ReturnType<typeof flagAffordance>) => (a.kind === "already" ? a.text : "");

  it("says how many times he has already resolved the domain that came back", () => {
    // The whole point: an OPEN row means this one CAME BACK. It is the case
    // where the repeat matters most, and inc.33/35 said nothing about it.
    const a = flagAffordance(
      "bigmailer.com",
      ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24"), open("bigmailer.com")])
    );
    expect(a.kind).toBe("already");
    expect(text(a)).toMatch(/Already on Things to Address/);
    expect(text(a)).toMatch(/resolved this 2 times before/);
    expect(text(a)).toContain("2026-07-24");
    expect(text(a)).toMatch(/blocklist entry is the thing to change/);
  });

  it("keeps the panel's count and the waiting row's count identical", () => {
    const rows = [resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24")];
    const idx = ok(rows);
    if (idx.kind !== "read") throw new Error("expected read");
    const waiting = text(flagAffordance("bigmailer.com", ok([...rows, open("bigmailer.com")])));
    expect(waiting).toContain(`${idx.judged.get("bigmailer.com")?.times} times before`);
  });

  it("uses the same one-vs-many threshold as the button's note", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com", "2026-07-24"), open("bigmailer.com")]));
    expect(text(a)).toMatch(/already resolved this once on 2026-07-24/);
    expect(text(a)).not.toMatch(/times before/);
  });

  it("says 'earlier' rather than inventing a date on the waiting row too", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com", "nope"), open("bigmailer.com")]));
    expect(text(a)).toMatch(/earlier/);
    expect(text(a)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("never claims WHICH raise this is — a count is not a sequence", () => {
    // inc.36's rule: we know how many times he RESOLVED it, never how many
    // times it was RAISED (the open set collapses duplicates).
    const a = flagAffordance(
      "bigmailer.com",
      ok([resolved("bigmailer.com", "2026-07-24"), open("bigmailer.com"), open("bigmailer.com")])
    );
    expect(text(a)).not.toMatch(/second time|third time|this is the \d/i);
  });

  it("appends nothing when the domain has never been judged", () => {
    const a = flagAffordance("bigmailer.com", ok([open("bigmailer.com")]));
    expect(text(a)).toBe("Already on Things to Address — waiting on your decision.");
  });

  it("appends nothing when the ledger could not be read", () => {
    const a = flagAffordance("bigmailer.com", { kind: "unknown" }, flagOutcome(200, { ok: true }));
    expect(text(a)).toBe(flagOutcome(200, { ok: true }).text);
  });

  it("carries the history onto a row he flagged in THIS session", () => {
    // He just re-raised a domain he has resolved twice — that is the moment the
    // count is most worth knowing, not the moment to forget it.
    const a = flagAffordance(
      "bigmailer.com",
      ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24")]),
      flagOutcome(200, { ok: true })
    );
    expect(a.kind).toBe("already");
    expect(text(a)).toMatch(/still be there/);
    expect(text(a)).toMatch(/resolved this 2 times before/);
  });

  it("does not turn a FAILED post into a history lecture", () => {
    const a = flagAffordance("bigmailer.com", ok([resolved("bigmailer.com", "2026-07-24")]), flagOutcome(500, null));
    expect(a.kind).toBe("button");
  });

  it("never leaks NaN/undefined/null into the waiting sentence", () => {
    const a = flagAffordance(
      "bigmailer.com",
      ok([resolved("bigmailer.com"), resolved("bigmailer.com"), open("bigmailer.com")])
    );
    expect(text(a)).not.toMatch(/NaN|undefined|null/);
  });
});

// ── Q69 inc.38 — the LEDGER row stops reading like a first ask ──────────────

describe("the open ledger row carries the same prior-judgement history", () => {
  const title = heldDomainFlagTitle("bigmailer.com");
  const open = (domain = "bigmailer.com") => ({ id: 9, status: "open", title: heldDomainFlagTitle(domain) });
  const resolved = (resolved_at: unknown, domain = "bigmailer.com", id = 1) => ({
    id,
    status: "resolved",
    title: heldDomainFlagTitle(domain),
    ...(resolved_at === undefined ? {} : { resolved_at }),
  });

  it("tells the reviewer, ON THE ROW HE RESOLVES FROM, that he has decided this before", () => {
    // The surface with the Resolve control was the surface with the least
    // history: it said only "the sweep will raise it again", as if it never had.
    const rows = [resolved("2026-07-20", "bigmailer.com", 1), resolved("2026-07-24", "bigmailer.com", 2), open()];
    const c = heldRowCopy(title, heldPriorJudgements(rows))!;
    expect(c.hint).toMatch(/resolved this 2 times before/);
    expect(c.hint).toContain("2026-07-24");
    expect(c.hint).toMatch(/blocklist entry is the thing to change/);
  });

  it("is WORD-FOR-WORD the sentence the panel shows for the same rows", () => {
    // Two surfaces read minutes apart about one question; prose that differs
    // reads as two histories. Same function, so they cannot drift.
    const rows = [resolved("2026-07-20", "bigmailer.com", 1), resolved("2026-07-24", "bigmailer.com", 2), open()];
    const panel = flagAffordance("bigmailer.com", heldFlagIndex(200, { flags: rows }));
    const c = heldRowCopy(title, heldPriorJudgements(rows))!;
    const history = panel.kind === "already" ? panel.text.replace("Already on Things to Address — waiting on your decision.", "") : "";
    expect(history.trim().length).toBeGreaterThan(0);
    expect(c.hint.endsWith(history)).toBe(true);
  });

  it("uses the SAME one-vs-many threshold: a single decision gets the short line", () => {
    const c = heldRowCopy(title, heldPriorJudgements([resolved("2026-07-24"), open()]))!;
    expect(c.hint).toMatch(/already resolved this once on 2026-07-24/);
    expect(c.hint).not.toMatch(/times before/);
  });

  it("never claims how many times the question was RAISED — inc.36/37's no-ordinal rule", () => {
    // We know what he resolved; the open set collapses duplicates, so the number
    // of times it CAME UP is not ours to state.
    const rows = [resolved("2026-07-20", "bigmailer.com", 1), resolved("2026-07-24", "bigmailer.com", 2), open(), open()];
    const c = heldRowCopy(title, heldPriorJudgements(rows))!;
    expect(c.hint).not.toMatch(/third time|3rd time|times it has come up|raised/i);
  });

  it("says 'earlier' rather than inventing a date, and never leaks null/undefined/NaN", () => {
    for (const bad of [undefined, null, "", "last Tuesday", 20260724, {}]) {
      const c = heldRowCopy(title, heldPriorJudgements([resolved(bad), open()]))!;
      expect(c.hint).toMatch(/earlier/);
      expect(c.hint).not.toMatch(/null|undefined|NaN/);
    }
  });

  it("counts only THIS domain's decisions", () => {
    const rows = [resolved("2026-07-20", "other.com", 1), resolved("2026-07-24", "bigmailer.com", 2)];
    const c = heldRowCopy(title, heldPriorJudgements(rows))!;
    expect(c.hint).toMatch(/once on 2026-07-24/);
  });

  it("adds nothing when the ledger holds no decision on the domain", () => {
    expect(heldRowCopy(title, heldPriorJudgements([open()]))!.hint).toBe(heldRowCopy(title)!.hint);
    expect(heldRowCopy(title, new Map())!.hint).toBe(heldRowCopy(title)!.hint);
  });

  it("leaves the Overview digest's copy byte-identical when `prior` is omitted", () => {
    // The digest calls this for the badge alone (inc.32); a scan surface must
    // not grow a paragraph.
    expect(heldRowCopy(title)).toEqual(heldRowCopy(title, null));
    expect(heldRowCopy(title)!.hint).not.toMatch(/resolved this/);
  });

  it("still returns null for rows that are not held-domain findings", () => {
    expect(heldRowCopy("Invoice missing", heldPriorJudgements([resolved("2026-07-24")]))).toBeNull();
  });

  it("counts identically to heldFlagIndex — one tally, not two that agree today", () => {
    const rows = [resolved("2026-07-20", "bigmailer.com", 1), resolved(undefined, "bigmailer.com", 2), open()];
    const idx = heldFlagIndex(200, { flags: rows });
    if (idx.kind !== "read") throw new Error("expected read");
    expect(heldPriorJudgements(rows).get("bigmailer.com")).toEqual(idx.judged.get("bigmailer.com"));
    expect(heldPriorJudgements(rows).has("bigmailer.com")).toBe(true);
  });

  it("survives junk where the rows should be", () => {
    for (const junk of [null, undefined, {}, "rows", [null, 3, { title: 7 }]]) {
      expect(heldPriorJudgements(junk).size).toBe(0);
    }
  });
});

// ── Q69 inc.39 — the finding arrives pre-labelled as a repeat ───────────────

describe("the finding's repeat label", () => {
  const ok = (flags: unknown[]) => heldFlagIndex(200, { flags });
  const open = (domain: string) => ({ status: "open", title: heldDomainFlagTitle(domain) });
  const resolved = (domain: string, resolved_at?: unknown) => ({
    status: "resolved",
    title: heldDomainFlagTitle(domain),
    ...(resolved_at === undefined ? {} : { resolved_at }),
  });

  it("says nothing at all on a first sighting — that is what makes the label mean something", () => {
    expect(findingRepeatMark("bigmailer.com", ok([]))).toBeNull();
    expect(findingRepeatMark("bigmailer.com", ok([open("bigmailer.com")]))).toBeNull();
    expect(findingRepeatMark("bigmailer.com", ok([resolved("other.com", "2026-07-24")]))).toBeNull();
  });

  it("labels a domain resolved once, and names the count from the second time on", () => {
    expect(findingRepeatMark("bigmailer.com", ok([resolved("bigmailer.com", "2026-07-24")]))).toBe(
      "Resolved before"
    );
    expect(
      findingRepeatMark(
        "bigmailer.com",
        ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24")])
      )
    ).toBe("Resolved 2 times before");
  });

  it("prints the SAME number the trailing sentence prints — one history, not two", () => {
    // The label and the sentence sit on the same row. If they can disagree,
    // the row describes two different pasts (the inc.37/38 defect).
    const rows = [
      resolved("bigmailer.com", "2026-07-18"),
      resolved("bigmailer.com", "2026-07-20"),
      resolved("bigmailer.com", "2026-07-24"),
    ];
    const idx = ok(rows);
    if (idx.kind !== "read") throw new Error("expected read");
    const times = idx.judged.get("bigmailer.com")!.times;
    expect(findingRepeatMark("bigmailer.com", idx)).toBe(`Resolved ${times} times before`);
    const a = flagAffordance("bigmailer.com", idx);
    if (a.kind !== "button" || !a.judged) throw new Error("expected a judged button");
    expect(a.judged).toContain(`${times} times`);
  });

  it("carries the count onto the already-waiting row too — the label does not depend on the branch", () => {
    const idx = ok([
      resolved("bigmailer.com", "2026-07-20"),
      resolved("bigmailer.com", "2026-07-24"),
      open("bigmailer.com"),
    ]);
    expect(flagAffordance("bigmailer.com", idx).kind).toBe("already");
    expect(findingRepeatMark("bigmailer.com", idx)).toBe("Resolved 2 times before");
  });

  it("is a LABEL, not a second copy of the sentence — no date, no advice", () => {
    const mark = findingRepeatMark(
      "bigmailer.com",
      ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24")])
    )!;
    expect(mark).not.toContain("2026-07-24");
    expect(mark).not.toMatch(/blocklist/i);
    expect(mark).not.toMatch(/most recently|earlier/i);
  });

  it("never claims an ordinal — resolved counts are known, raised counts are not", () => {
    const mark = findingRepeatMark(
      "bigmailer.com",
      ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24"), open("bigmailer.com")])
    )!;
    expect(mark).not.toMatch(/\b(1st|2nd|3rd|4th|first|second|third)\b/i);
  });

  it("counts undated resolutions — under-reporting is the thing the count exists to prevent", () => {
    expect(
      findingRepeatMark("bigmailer.com", ok([resolved("bigmailer.com"), resolved("bigmailer.com")]))
    ).toBe("Resolved 2 times before");
  });

  it("stays silent when the ledger could not be read — an unknown history is not 'new'", () => {
    expect(findingRepeatMark("bigmailer.com", { kind: "unknown" } as HeldFlagIndex)).toBeNull();
    expect(findingRepeatMark("bigmailer.com", heldFlagIndex(500, null))).toBeNull();
  });

  it("matches the domain the way every other surface does — trimmed, case-insensitive", () => {
    const idx = ok([resolved("BigMailer.com", "2026-07-24")]);
    expect(findingRepeatMark("  BIGMAILER.COM  ", idx)).toBe("Resolved before");
  });

  it("survives a blank or junk domain rather than labelling nothing", () => {
    const idx = ok([resolved("bigmailer.com", "2026-07-24")]);
    for (const junk of ["", "   ", undefined as unknown as string, null as unknown as string]) {
      expect(findingRepeatMark(junk, idx)).toBeNull();
    }
  });
});

// ── Q69 inc.40 — the collapsed badge tells a new question from a returning one ──

describe("the collapsed badge's repeat marker", () => {
  const ok = (flags: unknown[]) => heldFlagIndex(200, { flags });
  const open = (domain: string) => ({ status: "open", title: heldDomainFlagTitle(domain) });
  const resolved = (domain: string, resolved_at?: unknown) => ({
    status: "resolved",
    title: heldDomainFlagTitle(domain),
    ...(resolved_at === undefined ? {} : { resolved_at }),
  });

  it("says nothing when every finding is a first sighting — a marker on every sweep means nothing", () => {
    expect(badgeRepeatMark(["bigmailer.com", "sendgrid.net"], ok([]))).toBeNull();
    expect(badgeRepeatMark(["bigmailer.com"], ok([open("bigmailer.com")]))).toBeNull();
    expect(badgeRepeatMark(["bigmailer.com"], ok([resolved("other.com", "2026-07-24")]))).toBeNull();
  });

  it("says nothing when there is nothing to mark", () => {
    expect(badgeRepeatMark([], ok([resolved("bigmailer.com", "2026-07-24")]))).toBeNull();
    expect(badgeRepeatMark(null, ok([resolved("bigmailer.com", "2026-07-24")]))).toBeNull();
    expect(badgeRepeatMark(undefined, ok([resolved("bigmailer.com", "2026-07-24")]))).toBeNull();
  });

  it("stays silent when the ledger could not be read — an unknown history is not 'all new'", () => {
    expect(badgeRepeatMark(["bigmailer.com"], { kind: "unknown" } as HeldFlagIndex)).toBeNull();
    expect(badgeRepeatMark(["bigmailer.com"], heldFlagIndex(500, null))).toBeNull();
  });

  it("uses inc.39's singular — and NO number — when the sweep found one thing", () => {
    // A bare count here would sit inches from "Resolved 2 times before" and read
    // as the number of trips rather than the number of findings.
    expect(
      badgeRepeatMark(
        ["bigmailer.com"],
        ok([resolved("bigmailer.com", "2026-07-20"), resolved("bigmailer.com", "2026-07-24")])
      )
    ).toBe("resolved before");
  });

  it("counts FINDINGS, not trips round the loop", () => {
    const idx = ok([
      resolved("bigmailer.com", "2026-07-18"),
      resolved("bigmailer.com", "2026-07-20"),
      resolved("bigmailer.com", "2026-07-24"),
      resolved("sendgrid.net", "2026-07-24"),
    ]);
    if (idx.kind !== "read") throw new Error("expected read");
    expect(idx.judged.get("bigmailer.com")!.times).toBe(3);
    // Three trips for one domain, two returning findings — the badge says two.
    expect(badgeRepeatMark(["bigmailer.com", "sendgrid.net", "mailchimp.com"], idx)).toBe(
      "2 of 3 resolved before"
    );
  });

  it("says ALL when the whole sweep is re-asking — that is the blocklist's problem, not Rob's", () => {
    const idx = ok([resolved("bigmailer.com", "2026-07-24"), resolved("sendgrid.net", "2026-07-24")]);
    expect(badgeRepeatMark(["bigmailer.com", "sendgrid.net"], idx)).toBe("all 2 resolved before");
  });

  it("counts one domain once, however many times the sweep lists it", () => {
    const idx = ok([resolved("bigmailer.com", "2026-07-24")]);
    expect(badgeRepeatMark(["bigmailer.com", "BigMailer.com ", " bigmailer.com"], idx)).toBe(
      "resolved before"
    );
    // The same repeat beside a genuinely new finding: one returning of two, not
    // three of two — a marker that can out-count its own total is nonsense on a
    // header nobody has opened yet.
    expect(
      badgeRepeatMark(["bigmailer.com", "BigMailer.com", "mailchimp.com"], idx)
    ).toBe("1 of 2 resolved before");
  });

  it("agrees with the finding labels — one history, not two that agree today", () => {
    const idx = ok([resolved("bigmailer.com", "2026-07-24"), resolved("sendgrid.net", "2026-07-24")]);
    const domains = ["bigmailer.com", "sendgrid.net", "mailchimp.com"];
    const labelled = domains.filter((d) => findingRepeatMark(d, idx) !== null).length;
    expect(badgeRepeatMark(domains, idx)).toBe(`${labelled} of ${domains.length} resolved before`);
  });

  it("never claims an ordinal — resolved counts are known, raised counts are not", () => {
    const idx = ok([resolved("bigmailer.com", "2026-07-24"), open("sendgrid.net")]);
    const mark = badgeRepeatMark(["bigmailer.com", "sendgrid.net"], idx)!;
    expect(mark).not.toMatch(/\b(1st|2nd|3rd|4th|first|second|third)\b/i);
    expect(mark).not.toMatch(/blocklist/i);
    expect(mark).not.toMatch(/2026-07-24|most recently|earlier/);
  });

  it("survives junk in the domain list rather than losing the marker", () => {
    const idx = ok([resolved("bigmailer.com", "2026-07-24")]);
    const domains = ["", "   ", null as unknown as string, 7 as unknown as string, "bigmailer.com"];
    expect(badgeRepeatMark(domains, idx)).toBe("resolved before");
  });
});

describe("the ledger header's repeat marker", () => {
  const held = (domain: string) => heldDomainFlagTitle(domain);
  const resolvedRow = (domain: string, resolved_at?: unknown) => ({
    status: "resolved",
    title: held(domain),
    ...(resolved_at === undefined ? {} : { resolved_at }),
  });
  const openRow = (domain: string) => ({ status: "open", title: held(domain) });

  it("says nothing when every open row is a first sighting", () => {
    const prior = heldPriorJudgements([openRow("bigmailer.com")]);
    expect(ledgerRepeatMark([held("bigmailer.com"), held("sendgrid.net")], prior)).toBeNull();
  });

  it("stays silent when there is no history to read — an unknown past is not 'all new'", () => {
    expect(ledgerRepeatMark([held("bigmailer.com")], null)).toBeNull();
    expect(ledgerRepeatMark([held("bigmailer.com")], undefined)).toBeNull();
    expect(ledgerRepeatMark([held("bigmailer.com")], new Map())).toBeNull();
  });

  it("says nothing when there are no open rows to mark", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    expect(ledgerRepeatMark([], prior)).toBeNull();
    expect(ledgerRepeatMark(null, prior)).toBeNull();
    expect(ledgerRepeatMark(undefined, prior)).toBeNull();
  });

  it("ignores the rows that can never have a history — proposals and ordinary findings", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    expect(
      ledgerRepeatMark(["New company domain: roofco.com", "Invoice missing", "CG registry conflict"], prior)
    ).toBeNull();
    // A mixed list counts only the held-domain row.
    expect(
      ledgerRepeatMark(["New company domain: roofco.com", held("bigmailer.com"), "Invoice missing"], prior)
    ).toBe("1 resolved before");
  });

  it("ALWAYS carries its number — the badge beside it counts a different population", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    // inc.39/40 drop the number when the total is the same population. Here the
    // open badge counts every row of every kind, so a bare "resolved before"
    // would read as belonging to that count.
    expect(ledgerRepeatMark([held("bigmailer.com")], prior)).toBe("1 resolved before");
  });

  it("never prints a fraction or an 'all' — two populations must not wear one fraction", () => {
    const prior = heldPriorJudgements([
      resolvedRow("bigmailer.com", "2026-07-24"),
      resolvedRow("sendgrid.net", "2026-07-24"),
    ]);
    const mark = ledgerRepeatMark(
      [held("bigmailer.com"), held("sendgrid.net"), "Invoice missing"],
      prior
    )!;
    expect(mark).toBe("2 resolved before");
    expect(mark).not.toMatch(/\bof\b|\ball\b/i);
  });

  it("counts ROWS, not trips round the loop", () => {
    const prior = heldPriorJudgements([
      resolvedRow("bigmailer.com", "2026-07-18"),
      resolvedRow("bigmailer.com", "2026-07-20"),
      resolvedRow("bigmailer.com", "2026-07-24"),
      resolvedRow("sendgrid.net", "2026-07-24"),
    ]);
    expect(prior.get("bigmailer.com")!.times).toBe(3);
    // Three trips for one domain, two returning rows — the header says two.
    expect(
      ledgerRepeatMark([held("bigmailer.com"), held("sendgrid.net"), held("mailchimp.com")], prior)
    ).toBe("2 resolved before");
  });

  it("counts one domain once, however the ledger cased or spaced it", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    expect(
      ledgerRepeatMark([held("BigMailer.com"), held(" bigmailer.com "), held("bigmailer.com")], prior)
    ).toBe("1 resolved before");
  });

  it("agrees with the rows it sits above — one history, not two that agree today", () => {
    const prior = heldPriorJudgements([
      resolvedRow("bigmailer.com", "2026-07-24"),
      resolvedRow("sendgrid.net"),
    ]);
    const titles = [held("bigmailer.com"), held("sendgrid.net"), held("mailchimp.com")];
    // The rows print their history through `heldRowCopy(title, prior)`; the
    // header must mark exactly as many rows as carry that sentence.
    const withHistory = titles.filter((t) => {
      const base = heldRowCopy(t)!.hint;
      return heldRowCopy(t, prior)!.hint !== base;
    }).length;
    expect(ledgerRepeatMark(titles, prior)).toBe(`${withHistory} resolved before`);
  });

  it("never claims an ordinal, a date, or blocklist advice — that lives on the row", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    const mark = ledgerRepeatMark([held("bigmailer.com")], prior)!;
    expect(mark).not.toMatch(/\b(1st|2nd|3rd|first|second|third)\b/i);
    expect(mark).not.toMatch(/blocklist/i);
    expect(mark).not.toMatch(/2026-07-24|most recently|earlier/);
  });

  it("survives junk titles rather than losing the marker", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    const titles = ["", "   ", null as unknown as string, 7 as unknown as string, held("bigmailer.com")];
    expect(ledgerRepeatMark(titles, prior)).toBe("1 resolved before");
  });
});

describe("the ledger ROW's repeat anchor", () => {
  const held = (domain: string) => heldDomainFlagTitle(domain);
  const resolvedRow = (domain: string, resolved_at?: unknown) => ({
    status: "resolved",
    title: held(domain),
    ...(resolved_at === undefined ? {} : { resolved_at }),
  });
  const openRow = (domain: string) => ({ status: "open", title: held(domain) });

  it("marks a returning row and says nothing on a first sighting", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    expect(rowRepeatMark(held("bigmailer.com"), prior)).toBe("Resolved before");
    expect(rowRepeatMark(held("sendgrid.net"), prior)).toBeNull();
  });

  it("counts trips, not rows — the number is this domain's own history", () => {
    const prior = heldPriorJudgements([
      resolvedRow("bigmailer.com", "2026-07-20"),
      resolvedRow("bigmailer.com", "2026-07-24"),
      resolvedRow("bigmailer.com", "2026-07-26"),
    ]);
    expect(rowRepeatMark(held("bigmailer.com"), prior)).toBe("Resolved 3 times before");
  });

  it("is inc.39's label character for character — one history, two surfaces", () => {
    // The panel finding and the ledger row can be on screen together. Two
    // wordings for one fact is how a rep ends up believing there are two.
    for (const times of [1, 2, 5]) {
      const rows = Array.from({ length: times }, () => resolvedRow("bigmailer.com", "2026-07-24"));
      const prior = heldPriorJudgements(rows);
      const idx = heldFlagIndex(200, { flags: rows });
      expect(rowRepeatMark(held("bigmailer.com"), prior)).toBe(
        findingRepeatMark("bigmailer.com", idx)
      );
    }
  });

  it("never carries a number the row's own sentence does not", () => {
    const prior = heldPriorJudgements([
      resolvedRow("bigmailer.com", "2026-07-20"),
      resolvedRow("bigmailer.com", "2026-07-24"),
    ]);
    const mark = rowRepeatMark(held("bigmailer.com"), prior)!;
    const hint = heldRowCopy(held("bigmailer.com"), prior)!.hint;
    expect(mark).toContain("2");
    expect(hint).toContain("2");
  });

  it("marks exactly the rows the header counted — never one more, never one fewer", () => {
    const prior = heldPriorJudgements([
      resolvedRow("bigmailer.com", "2026-07-24"),
      resolvedRow("mailchimp.com", "2026-07-25"),
      resolvedRow("mailchimp.com", "2026-07-26"),
      openRow("sendgrid.net"),
    ]);
    const titles = [
      held("bigmailer.com"),
      held("sendgrid.net"),
      held("mailchimp.com"),
      "New company domain: roofco.com",
      "Invoice missing",
    ];
    const marked = titles.filter((t) => rowRepeatMark(t, prior) !== null).length;
    expect(marked).toBe(2);
    expect(ledgerRepeatMark(titles, prior)).toBe(`${marked} resolved before`);
  });

  it("stays silent on the rows that can never have a history", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    expect(rowRepeatMark("New company domain: bigmailer.com", prior)).toBeNull();
    expect(rowRepeatMark("Invoice missing", prior)).toBeNull();
    // The title contract is the ONLY way in. A row whose title happens to read
    // as the domain itself is still not a held-domain row, and marking it would
    // put a history Rob never decided onto someone else's finding.
    expect(rowRepeatMark("bigmailer.com", prior)).toBeNull();
    expect(rowRepeatMark("  BigMailer.com ", prior)).toBeNull();
    expect(rowRepeatMark("Blocked domain still held: ", prior)).toBeNull();
  });

  it("stays silent when there is no history to read — an unknown past is not 'new'", () => {
    expect(rowRepeatMark(held("bigmailer.com"), null)).toBeNull();
    expect(rowRepeatMark(held("bigmailer.com"), undefined)).toBeNull();
    expect(rowRepeatMark(held("bigmailer.com"), new Map())).toBeNull();
  });

  it("carries no ordinal, no date and no blocklist advice — that lives in the sentence", () => {
    const prior = heldPriorJudgements([
      resolvedRow("bigmailer.com", "2026-07-24"),
      resolvedRow("bigmailer.com", "2026-07-26"),
    ]);
    const mark = rowRepeatMark(held("bigmailer.com"), prior)!;
    expect(mark).not.toMatch(/\b(1st|2nd|3rd|first|second|third)\b/i);
    expect(mark).not.toMatch(/blocklist/i);
    expect(mark).not.toMatch(/2026-07-2\d|most recently|earlier/);
  });

  it("matches the title's domain however it is cased or padded", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    expect(rowRepeatMark("Blocked domain still held:  BigMailer.COM  ", prior)).toBe("Resolved before");
  });

  it("survives junk titles rather than throwing on a ledger render", () => {
    const prior = heldPriorJudgements([resolvedRow("bigmailer.com", "2026-07-24")]);
    for (const junk of [null, undefined, 7, {}, [], ""]) {
      expect(rowRepeatMark(junk as unknown as string, prior)).toBeNull();
    }
  });
});

describe("the ARCHIVE row's place anchor (inc.43)", () => {
  const held = (domain: string) => heldDomainFlagTitle(domain);
  const row = (id: number, resolved_at: string | null, t = held("bigmailer.com"), status = "resolved") => ({
    id,
    title: t,
    status,
    resolved_at,
  });

  it("says which trip this was when the decisions can be ordered", () => {
    const places = heldArchivePlaces([row(1, "2026-07-10"), row(2, "2026-07-18"), row(3, "2026-07-24")]);
    expect(archiveRepeatMark(held("bigmailer.com"), places.get(2))).toBe("Decision 2 of 3");
  });

  it("says how many but never invents which when the rows cannot be ordered", () => {
    const places = heldArchivePlaces([row(1, "2026-07-10"), row(2, null)]);
    const mark = archiveRepeatMark(held("bigmailer.com"), places.get(1))!;
    expect(mark).toBe("One of 2 decisions");
    expect(mark).not.toMatch(/\b(1|2)(st|nd)\b|first|second/i);
  });

  it("is silent on a lone decision — the whole history is the row itself", () => {
    const places = heldArchivePlaces([row(1, "2026-07-10")]);
    expect(archiveRepeatMark(held("bigmailer.com"), places.get(1))).toBeNull();
  });

  it("falls silent exactly where the note's history clause does", () => {
    for (const place of [null, undefined, { nth: 1, of: 1 }, { nth: 2, of: 3 }, { nth: null, of: 4 }]) {
      const noteHasHistory = /decision|decisions on this domain/.test(
        heldArchiveNote(held("bigmailer.com"), "2026-07-24", place) ?? ""
      );
      expect(archiveRepeatMark(held("bigmailer.com"), place) !== null).toBe(noteHasHistory);
    }
  });

  it("prints the same numbers as the sentence it sits above", () => {
    const place = { nth: 2, of: 5 };
    const note = heldArchiveNote(held("bigmailer.com"), "2026-07-24", place)!;
    expect(note).toContain("decision 2 of 5");
    expect(archiveRepeatMark(held("bigmailer.com"), place)).toBe("Decision 2 of 5");
  });

  it("agrees with the OPEN row's count on the same domain — one history, not two", () => {
    const rows = [row(1, "2026-07-10"), row(2, "2026-07-18"), row(3, "2026-07-24")];
    const of = heldArchivePlaces(rows).get(1)!.of;
    const times = heldPriorJudgements(rows).get("bigmailer.com")!.times;
    expect(of).toBe(times);
    expect(rowRepeatMark(held("bigmailer.com"), heldPriorJudgements(rows))).toBe(`Resolved ${times} times before`);
    expect(archiveRepeatMark(held("bigmailer.com"), heldArchivePlaces(rows).get(1))).toBe(`Decision 1 of ${of}`);
  });

  it("does not claim ancestors the open badge would — an archive row IS one of the decisions", () => {
    expect(archiveRepeatMark(held("bigmailer.com"), { nth: 1, of: 3 })).not.toMatch(/before/i);
  });

  it("only a held-domain title gets a history — the title contract is the only way in", () => {
    for (const t of ["New company proposed: bigmailer.com", "bigmailer.com", "Missing phone number", "Blocked domain still held: "]) {
      expect(archiveRepeatMark(t, { nth: 2, of: 3 })).toBeNull();
    }
  });

  it("survives junk rather than throwing on an archive render", () => {
    for (const junk of [null, undefined, 7, {}, [], ""]) {
      expect(archiveRepeatMark(junk as unknown as string, { nth: 1, of: 2 })).toBeNull();
    }
    expect(archiveRepeatMark(held("bigmailer.com"), { nth: 1, of: 2 })).not.toMatch(/null|undefined|NaN/);
  });
});

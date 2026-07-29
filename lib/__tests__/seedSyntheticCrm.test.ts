// Q71 Phase 2 item 5 — the CRM half of the synthetic seed.
//
// GRADED BY BROADER RULES THAN THE GENERATOR'S OWN, deliberately: a suite that
// re-states the generator's constraints only proves the generator ran. These
// assert the properties the DEMO needs (populated, internally consistent, no
// real anchors) and the properties the PII guard needs (nothing that could be a
// real person), each checked against the committed file, not just the in-memory
// object.
import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs generator, no types by design (it is the CLI too).
import { buildCrm, buildNetwork, describeCrmDrift, serializeCrm, SEED } from "../../scripts/seed-synthetic.mjs";

const committedPath = path.join(process.cwd(), "data", "crm.json");
const readCommitted = () => fs.readFile(committedPath, "utf8");

interface Deal {
  id: string;
  personId?: string;
  orgId?: string;
  stage: string;
  value?: number;
  keyDates: Record<string, string | undefined>;
  createdAt: string;
}
interface Activity {
  id: string;
  personId?: string;
  orgId?: string;
  dealId?: string;
  occurredAt: string;
}
interface Task {
  id: string;
  dealId?: string;
  activityId?: string;
  status: string;
}
interface Crm {
  __synthetic?: boolean;
  deals: Deal[];
  activities: Activity[];
  tasks: Task[];
}

const crm = (): Crm => buildCrm() as Crm;

describe("synthetic CRM seed — determinism", () => {
  it("two builds are byte-identical", () => {
    expect(serializeCrm(buildCrm())).toBe(serializeCrm(buildCrm()));
  });

  it("a different seed produces a different file", () => {
    expect(serializeCrm(buildCrm(`${SEED}/other`))).not.toBe(serializeCrm(buildCrm()));
  });

  it("carries no clock and no network in its source", async () => {
    const src = (await fs.readFile(path.join(process.cwd(), "scripts", "seed-synthetic.mjs"), "utf8"))
      // Strip comments first — the file DISCUSSES Date.now() at length, and a
      // scan that can be tripped by its own documentation is a scan nobody trusts.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/Date\.now\(/);
    expect(src).not.toMatch(/\bfetch\(/);
  });
});

describe("synthetic CRM seed — the demo is populated, which is the whole point", () => {
  it("has deals, activities and tasks", () => {
    const c = crm();
    expect(c.deals.length).toBeGreaterThan(0);
    expect(c.activities.length).toBeGreaterThan(0);
    expect(c.tasks.length).toBeGreaterThan(0);
  });

  it("spans the pipeline including both terminal stages", () => {
    const stages = new Set(crm().deals.map((d) => d.stage));
    // A demo missing `lost`/`stalled` teaches the viewer those columns don't render.
    for (const s of ["new_lead", "quote_sent", "signed", "paid", "stalled", "lost"])
      expect(stages).toContain(s);
  });

  it("every deal carries money, so the pipeline panel is never a row of blanks", () => {
    for (const d of crm().deals) expect(typeof d.value).toBe("number");
  });

  it("declares itself synthetic", () => {
    expect(crm().__synthetic).toBe(true);
  });
});

describe("synthetic CRM seed — structural invariants (the 0005 checks)", () => {
  it("every deal has at least one of personId/orgId", () => {
    for (const d of crm().deals) expect(Boolean(d.personId) || Boolean(d.orgId)).toBe(true);
  });

  it("no activity carries BOTH personId and orgId", () => {
    for (const a of crm().activities) expect(Boolean(a.personId) && Boolean(a.orgId)).toBe(false);
  });

  it("every activity has an anchor", () => {
    for (const a of crm().activities)
      expect(Boolean(a.personId) || Boolean(a.orgId) || Boolean(a.dealId)).toBe(true);
  });

  it("ids are unique across each collection", () => {
    const c = crm();
    for (const rows of [c.deals, c.activities, c.tasks])
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});

describe("synthetic CRM seed — no dangling references", () => {
  it("every deal anchor exists in the SAME run's network", () => {
    const ids = new Set((buildNetwork().people as { id: string }[]).map((p) => p.id));
    for (const d of crm().deals) {
      if (d.personId) expect(ids).toContain(d.personId);
      if (d.orgId) expect(ids).toContain(d.orgId);
    }
  });

  it("every activity and task points at a deal that exists", () => {
    const c = crm();
    const dealIds = new Set(c.deals.map((d) => d.id));
    const activityIds = new Set(c.activities.map((a) => a.id));
    for (const a of c.activities) if (a.dealId) expect(dealIds).toContain(a.dealId);
    for (const t of c.tasks) {
      if (t.dealId) expect(dealIds).toContain(t.dealId);
      if (t.activityId) expect(activityIds).toContain(t.activityId);
    }
  });

  it("an activity's anchor matches its deal's anchor", () => {
    const c = crm();
    const byId = new Map(c.deals.map((d) => [d.id, d]));
    for (const a of c.activities) {
      const d = a.dealId ? byId.get(a.dealId) : undefined;
      if (!d) continue;
      // Two rows disagreeing about who a call was with is the exact data defect
      // this dashboard exists to surface — the demo must not model it.
      expect(a.personId ?? null).toBe(d.personId ?? null);
      expect(a.orgId ?? null).toBe(d.orgId ?? null);
    }
  });
});

describe("synthetic CRM seed — money dates are monotonic", () => {
  it("never records paid before signed, or signed before quoted", () => {
    for (const d of crm().deals) {
      const { quoted, signed, invoiced, paid } = d.keyDates;
      if (signed && quoted) expect(signed >= quoted).toBe(true);
      if (invoiced && signed) expect(invoiced >= signed).toBe(true);
      if (paid && invoiced) expect(paid >= invoiced).toBe(true);
      // A `paid` with nothing signed would train the eye to ignore the column.
      if (paid) expect(Boolean(signed)).toBe(true);
    }
  });

  it("lost and stalled deals never carry a paid date", () => {
    for (const d of crm().deals)
      if (d.stage === "lost" || d.stage === "stalled") expect(d.keyDates.paid).toBeUndefined();
  });
});

describe("synthetic CRM seed — the committed file", () => {
  it("matches the generator (drift guard, clean)", async () => {
    expect(describeCrmDrift(await readCommitted())).toBeNull();
  });

  it("reports a hand-edit with the fix command and the divergent line", async () => {
    const text = await readCommitted();
    const mutated = text.replace(/"stage": "paid"/, '"stage": "hand_edited"');
    expect(mutated).not.toBe(text); // never a vacuous injection
    const drift = describeCrmDrift(mutated) as string | null;
    expect(drift).not.toBeNull();
    expect(drift).toContain("node scripts/seed-synthetic.mjs");
    expect(drift).toContain("hand_edited");
  });

  it("holds no address outside example.com and no phone at all", async () => {
    const text = await readCommitted();
    const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    expect(emails.filter((e) => !e.endsWith("@example.com"))).toEqual([]);
    // Broader than any format the generator emits: any 10-digit NANP shape.
    const phones = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) ?? [];
    expect(phones.filter((p) => !p.includes("555"))).toEqual([]);
  });

  it("names nobody from the real ledger", async () => {
    const text = (await readCommitted()).toLowerCase();
    for (const name of ["acheson", "caleb", "trent", "stavros", "homeclone", "proplogix", "omega", "gulf"])
      expect(text).not.toContain(name);
  });
});

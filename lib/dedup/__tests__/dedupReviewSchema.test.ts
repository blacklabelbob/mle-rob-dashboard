import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { collectDedupRows } from "../run";
import { dedupClosedBy } from "../resolutionNote";

// Q84 inc.50 — the migration is only a pin if something fails when the code
// drifts from it. Parsed, not eyeballed (the 0021 precedent).
//
// The three CHECK lists in 0034 are the database's copy of three TS vocabularies.
// Nothing enforced that they agree, which is how `dedup_review` reached inc.49
// with its status words living in comments only.

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0034_dedup_review.sql"),
  "utf8",
);

function checkList(anchor: string): string[] {
  const start = SQL.indexOf(anchor);
  if (start < 0) throw new Error(`anchor not found: ${anchor}`);
  const open = SQL.indexOf("(", start + anchor.length);
  const close = SQL.indexOf(")", open);
  return SQL.slice(open + 1, close)
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

const STATUSES = checkList("check (status in");

/** Every source that writes a `status` onto a dedup_review row. */
const WRITERS = [
  "lib/dedup/detector.ts",
  "lib/dedup/merge.ts",
  "app/api/admin/dedup/route.ts",
];

describe("0034 migration ↔ the dedup ladders", () => {
  it("status CHECK is exactly the vocabulary dedupClosedBy branches on", () => {
    expect(STATUSES).toEqual(["open", "dismissed", "resolved"]);
    // Not just the same words — the same MEANINGS. `open` is the only one the
    // reader treats as not-closed; the other two must each name a closer.
    expect(dedupClosedBy("open", null)).toBeNull();
    expect(dedupClosedBy("dismissed", null)).toBe("reviewer");
    expect(dedupClosedBy("resolved", "merged: a → b")).toBe("merge");
    expect(dedupClosedBy("resolved", "auto: signals no longer present")).toBe("detector");
  });

  it("no writer sets a status the CHECK would reject", () => {
    // The failure this catches is a FUTURE one: a fifth caller (a script, a
    // second button, a backfill) inventing `status: "merged"` or `"ignored"`.
    // Today it would insert fine and land in queueView's `open` bucket wearing
    // the wrong meaning; once 0034 is applied it would be rejected by Postgres,
    // and this test says so before the deploy rather than after it.
    for (const file of WRITERS) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      const written = [...src.matchAll(/\bstatus:\s*"([a-z_]+)"/g)].map((m) => m[1]);
      expect(written.length).toBeGreaterThan(0); // the grep still finds the writers
      for (const value of written) expect(STATUSES).toContain(value);
    }
  });

  it("kind and confidence CHECKs cover everything the detector can emit", () => {
    // Driven through the real collector rather than restating the TS unions:
    // an email match on people and a name-only match on orgs, so one run emits
    // both kinds and both confidences.
    const rows = collectDedupRows({
      people: [
        { id: "p1", name: "Jane Doe", email: "j@x.com" },
        { id: "p2", name: "Jane D", email: "J@X.com" },
      ],
      orgs: [
        { id: "o1", name: "Acme, LLC." },
        { id: "o2", name: "acme llc" },
      ],
    });

    const kinds = new Set(rows.map((r) => r.kind));
    const confidences = new Set(rows.map((r) => r.confidence));
    expect(kinds).toEqual(new Set(["person", "org"]));
    expect(confidences).toEqual(new Set(["high", "review"]));

    // As sets: membership in a CHECK list is the meaning, order is not. (The
    // status assertion above IS ordered, because that list is written
    // open → dismissed → resolved to read as the row's life.)
    expect(new Set(checkList("check (kind in"))).toEqual(kinds);
    expect(new Set(checkList("check (confidence in"))).toEqual(confidences);
  });
});

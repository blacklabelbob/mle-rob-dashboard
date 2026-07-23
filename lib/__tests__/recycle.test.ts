// PRD Task 5.4 (inc.1): dead-lead recycle detector — seeded stale contact
// flags; fresh / signed / lit / demo / already-tagged / unprovable-date
// contacts never do. Tag format pinned so the cron write has one source.
import { describe, expect, it } from "vitest";
import type { Activity } from "../types";
import {
  findRecycleCandidates,
  hasRecycleTag,
  lastTouchDay,
  withRecycleTag,
  RECYCLE_STALE_DAYS,
  type RecyclablePerson,
} from "../leads/recycle";

const TODAY = "2026-07-22";

const person = (
  o: Partial<RecyclablePerson> & { id: string }
): RecyclablePerson => ({
  name: o.id,
  verticalId: "v-roofing",
  status: "warm",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...o,
});

const touch = (
  o: Partial<Activity> & { id: string; occurredAt: string }
): Activity => ({
  type: "note",
  source: "manual",
  sourceContext: {},
  bookProtected: false,
  createdAt: o.occurredAt,
  ...o,
});

describe("findRecycleCandidates (Task 5.4)", () => {
  it("flags a warm contact whose last activity is 200 days stale", () => {
    const out = findRecycleCandidates(
      [person({ id: "p-stale" })],
      [touch({ id: "a1", personId: "p-stale", occurredAt: "2026-01-03T10:00:00Z" })],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      personId: "p-stale",
      lastTouch: "2026-01-03",
      daysStale: 200,
    });
    expect(out[0].reason).toContain("recycle_candidate");
  });

  it("exactly 180 days of silence qualifies; 179 does not", () => {
    const at = (d: string) => [touch({ id: "a", personId: "p", occurredAt: d })];
    expect(
      findRecycleCandidates([person({ id: "p" })], at("2026-01-23T00:00:00Z"), TODAY)
    ).toHaveLength(1); // 180d
    expect(
      findRecycleCandidates([person({ id: "p" })], at("2026-01-24T00:00:00Z"), TODAY)
    ).toHaveLength(0); // 179d
    expect(RECYCLE_STALE_DAYS).toBe(180);
  });

  it("never flags signed people or lit status, however stale", () => {
    const old = [
      touch({ id: "a1", personId: "p-signed", occurredAt: "2025-01-01T00:00:00Z" }),
      touch({ id: "a2", personId: "p-lit", occurredAt: "2025-01-01T00:00:00Z" }),
    ];
    const out = findRecycleCandidates(
      [
        person({ id: "p-signed", signed: true }),
        person({ id: "p-lit", status: "lit" }),
      ],
      old,
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("excludes demo-* rows and already-tagged contacts", () => {
    const out = findRecycleCandidates(
      [
        person({ id: "demo-jake" }),
        person({ id: "p-tagged", notes: "met at expo [recycle_candidate 2026-06-01]" }),
      ],
      [
        touch({ id: "a1", personId: "demo-jake", occurredAt: "2025-01-01T00:00:00Z" }),
        touch({ id: "a2", personId: "p-tagged", occurredAt: "2025-01-01T00:00:00Z" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("a contact with no provable touch date is conservatively skipped", () => {
    expect(findRecycleCandidates([person({ id: "p-blank" })], [], TODAY)).toHaveLength(0);
  });

  it("keyDates and createdAt anchor the clock when no activities exist", () => {
    const fresh = person({ id: "p-quoted", keyDates: { quoted: "2026-07-01" } });
    const stale = person({ id: "p-old", createdAt: "2025-06-01T00:00:00Z" });
    const out = findRecycleCandidates([fresh, stale], [], TODAY);
    expect(out.map((c) => c.personId)).toEqual(["p-old"]);
  });

  it("an activity anchored to the person's org counts as a touch", () => {
    const p = person({ id: "p-orgd", orgId: "org-1", createdAt: "2025-06-01T00:00:00Z" });
    const out = findRecycleCandidates(
      [p],
      [touch({ id: "a1", orgId: "org-1", occurredAt: "2026-07-10T00:00:00Z" })],
      TODAY
    );
    expect(out).toHaveLength(0); // org touch is recent → not dead
    expect(lastTouchDay(p, [])).toBe("2025-06-01");
  });

  it("orders most-stale first, stable by id; rejects malformed today", () => {
    const out = findRecycleCandidates(
      [
        person({ id: "p-b", createdAt: "2025-02-01T00:00:00Z" }),
        person({ id: "p-a", createdAt: "2025-02-01T00:00:00Z" }),
        person({ id: "p-older", createdAt: "2025-01-01T00:00:00Z" }),
      ],
      [],
      TODAY
    );
    expect(out.map((c) => c.personId)).toEqual(["p-older", "p-a", "p-b"]);
    expect(() => findRecycleCandidates([], [], "22/07/2026")).toThrow();
  });

  it("tag helpers: append format + detection round-trip", () => {
    const tagged = withRecycleTag("cold expo lead", TODAY);
    expect(tagged).toBe("cold expo lead [recycle_candidate 2026-07-22]");
    expect(withRecycleTag(undefined, TODAY)).toBe("[recycle_candidate 2026-07-22]");
    expect(hasRecycleTag(tagged)).toBe(true);
    expect(hasRecycleTag("no tag here")).toBe(false);
  });
});

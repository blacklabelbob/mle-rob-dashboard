import { describe, expect, it } from "vitest";
import {
  ORIGIN_ID,
  ORIGIN_LEGACY_SLUG,
  isOriginId,
  resolveOriginId,
} from "@/lib/records/origin";

describe("isOriginId", () => {
  it("accepts both spellings of Rob", () => {
    expect(isOriginId(ORIGIN_ID)).toBe(true);
    expect(isOriginId(ORIGIN_LEGACY_SLUG)).toBe(true);
  });

  it("is false for anyone else, and for absence", () => {
    expect(isOriginId("P-1002")).toBe(false);
    expect(isOriginId("caleb-green")).toBe(false);
    expect(isOriginId(null)).toBe(false);
    expect(isOriginId(undefined)).toBe(false);
    // An empty id is not an identity — the same rule resolveRecord holds.
    expect(isOriginId("")).toBe(false);
  });
});

describe("resolveOriginId", () => {
  it("resolves post-0031 prod rows to the record number", () => {
    expect(resolveOriginId(["P-1001", "P-1002", "P-1018"])).toBe(ORIGIN_ID);
  });

  it("resolves pre-migration rows (and fixtures) to the legacy slug", () => {
    expect(resolveOriginId(["rob-acheson", "caleb-green"])).toBe(ORIGIN_LEGACY_SLUG);
  });

  // The case that decides whether the walk terminates: after 0031 BOTH spellings
  // can be in scope (the id is P-1001, the legacy_slug is still rob-acheson), and
  // the FK columns point at the id. Preferring the slug here would restore the
  // exact broken_root the renumber caused.
  it("prefers the record number when both are present", () => {
    expect(resolveOriginId(["rob-acheson", "P-1001"])).toBe(ORIGIN_ID);
    expect(resolveOriginId(["P-1001", "rob-acheson"])).toBe(ORIGIN_ID);
  });

  // A graph with no Rob must report "cannot reach the origin" rather than
  // electing whichever node it happened to see first.
  it("falls back to the canonical id when the origin is absent", () => {
    expect(resolveOriginId([])).toBe(ORIGIN_ID);
    expect(resolveOriginId(["stray-co", "P-1099"])).toBe(ORIGIN_ID);
  });

  it("reads any iterable, including a Set of node ids", () => {
    expect(resolveOriginId(new Set(["P-1002", "P-1001"]))).toBe(ORIGIN_ID);
  });
});

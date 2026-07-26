import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FILTER_TARGETS } from "../filters/ast";
import { MAX_JSON_BYTES } from "../filters/parse";
import {
  MAX_SHARE_LINK_LENGTH,
  MAX_VIEW_NAME_LENGTH,
  SAVED_VIEW_SCOPES,
  decodeShareLink,
  encodeShareLink,
  normalizeViewName,
  parseSavedViewPayload,
  parseSavedViewRow,
  type SavedViewPayload,
} from "../filters/savedViews";

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0019_saved_views.sql"),
  "utf8",
);

/** Parsed, not eyeballed — the entityAccess.test.ts / readModelSql.test.ts precedent. */
function checkList(anchor: string): string[] {
  const start = SQL.indexOf(anchor);
  if (start === -1) throw new Error(`anchor not found in 0019: ${anchor}`);
  const body = SQL.slice(start + anchor.length);
  return [...body.slice(0, body.indexOf(")")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const TREE = { op: "lit" as const, lit: { lit: "person.status", value: "lit" } };

function payload(over: Partial<SavedViewPayload> = {}) {
  return { target: "person", name: "Unlit people", filter: TREE, ...over };
}

describe("0019 <-> lib parity", () => {
  it("target CHECK matches FILTER_TARGETS", () => {
    expect(checkList("check (target in (")).toEqual([...FILTER_TARGETS]);
  });

  it("scope CHECK matches SAVED_VIEW_SCOPES", () => {
    expect(checkList("check (scope in (")).toEqual([...SAVED_VIEW_SCOPES]);
  });

  it("the name length bound in SQL is the one the parser enforces", () => {
    expect(SQL).toContain(`between 1 and ${MAX_VIEW_NAME_LENGTH}`);
  });

  it("the JSONB size ceiling in SQL is the parser's MAX_JSON_BYTES", () => {
    // A row storable but unreadable is a view that saves and then 400s on open.
    expect(SQL).toContain(`octet_length(v::text) <= ${MAX_JSON_BYTES}`);
  });

  it("RLS is enabled — the anon key ships in the client bundle", () => {
    expect(SQL).toContain("alter table saved_views enable row level security");
  });

  it("name uniqueness is TWO partial indexes, not one composite (NULL is distinct)", () => {
    expect(SQL).toContain("where scope = 'personal'");
    expect(SQL).toContain("where scope = 'team'");
  });

  it("no share token column exists — a link carries the filter, not a reference", () => {
    expect(SQL).not.toMatch(/^\s*(share_token|token|slug)\s/m);
  });
});

describe("parseSavedViewPayload", () => {
  it("accepts a well-formed view and returns only grammar keys", () => {
    const v = parseSavedViewPayload({ ...payload(), evil: 1 });
    expect(Object.keys(v).sort()).toEqual(["filter", "name", "target"]);
  });

  it("trims the name the way the unique index does", () => {
    expect(parseSavedViewPayload(payload({ name: "  My quotes  " })).name).toBe("My quotes");
    expect(normalizeViewName("  My Quotes ")).toBe("my quotes");
  });

  it("rejects an unknown target rather than building a FROM clause from it", () => {
    expect(() => parseSavedViewPayload(payload({ target: "users" as never }))).toThrow(
      /unknown target/,
    );
  });

  it("rejects a blank or oversized name", () => {
    expect(() => parseSavedViewPayload(payload({ name: "   " }))).toThrow(/blank/);
    expect(() =>
      parseSavedViewPayload(payload({ name: "x".repeat(MAX_VIEW_NAME_LENGTH + 1) })),
    ).toThrow(/longer than/);
  });

  it("delegates the tree to parseExpr — an unknown literal is refused here, not at Postgres", () => {
    expect(() =>
      parseSavedViewPayload(payload({ filter: { op: "lit", lit: { lit: "person.evil", value: 1 } } as never })),
    ).toThrow(/unknown literal/);
  });
});

describe("parseSavedViewRow", () => {
  const row = { id: "v1", ...payload(), scope: "personal", owner_id: "rob", team_id: null };

  it("accepts a personal row", () => {
    expect(parseSavedViewRow(row)).toMatchObject({ id: "v1", scope: "personal", team_id: null });
  });

  it("accepts a team row", () => {
    expect(
      parseSavedViewRow({ ...row, scope: "team", team_id: "sales" }),
    ).toMatchObject({ scope: "team", team_id: "sales" });
  });

  it("enforces 0019's scope/id pairing on the read path too", () => {
    expect(() => parseSavedViewRow({ ...row, scope: "team" })).toThrow(/no team_id/);
    expect(() => parseSavedViewRow({ ...row, team_id: "sales" })).toThrow(/carries a team_id/);
  });

  it("rejects a row with no owner", () => {
    expect(() => parseSavedViewRow({ ...row, owner_id: "  " })).toThrow(/owner_id/);
  });
});

describe("share links", () => {
  it("round-trips a view", () => {
    const token = encodeShareLink(payload());
    expect(decodeShareLink(token)).toEqual(payload());
  });

  it("round-trips a non-ASCII name (btoa alone would throw above U+00FF)", () => {
    const v = payload({ name: "Clientes — señales 🚧" });
    expect(decodeShareLink(encodeShareLink(v))).toEqual(v);
  });

  it("emits url-safe characters only — no +, / or = to be re-encoded in a query string", () => {
    const token = encodeShareLink(payload({ name: "a?b/c+d=e ffff" }));
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects standard base64 rather than silently translating it", () => {
    expect(() => decodeShareLink("aGVsbG8+")).toThrow(/base64url/);
  });

  it("rejects a link that decodes to bytes that are not UTF-8 or not JSON", () => {
    expect(() => decodeShareLink("_____w")).toThrow(/not decodable|does not contain JSON/);
  });

  it("rejects an oversized link BEFORE decoding it", () => {
    expect(() => decodeShareLink("A".repeat(MAX_SHARE_LINK_LENGTH + 1))).toThrow(
      /longer than/,
    );
  });

  it("rejects an empty or non-string link", () => {
    expect(() => decodeShareLink("")).toThrow(/empty/);
    expect(() => decodeShareLink(null)).toThrow(/must be a string/);
  });

  it("a tampered link is refused, not compiled — the payload is a query, not a grant", () => {
    const tampered = encodeShareLink({
      ...payload(),
      filter: { op: "lit", lit: { lit: "person.status", value: "lit" } },
    });
    // Flip the payload to an unknown operator and re-encode by hand, as an attacker would.
    const evil = Buffer.from(
      JSON.stringify({ target: "person", name: "x", filter: { op: "exec", args: [] } }),
      "utf8",
    )
      .toString("base64url");
    expect(decodeShareLink(tampered).target).toBe("person");
    expect(() => decodeShareLink(evil)).toThrow(/unknown operator/);
  });
});

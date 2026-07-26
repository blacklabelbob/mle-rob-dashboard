/**
 * Q67 inc.3 — the typed accessor over `saved_views`
 * (supabase/migrations/0019_saved_views.sql) plus the share-link codec.
 *
 * Design ported (not code-copied — Macro is AGPL-3.0) from the 2026-07-25 teardown,
 * 02-crm.md §9.2 B6.
 *
 * Pure and stateless per CR-3: no network, no Date.now(). Nothing here fetches; a caller
 * hands it a row it already read, or a string it already took off a URL.
 *
 * The one idea in this file: **a saved view and a share link are the same object.** A row
 * is `{ target, name, filter }` in Postgres; a link is `{ target, name, filter }`
 * base64url'd into the URL. So there is exactly one validator, `parseSavedViewPayload`,
 * and both doors go through it. A second copy of these rules for links would be a second
 * place for them to drift — which is how "the shared link shows different rows than the
 * saved view" bugs get written.
 *
 * A share link is a bearer of a QUERY, never of DATA. Opening one still reads the
 * underlying tables through whatever policy guards them (Q66/Q64); the link grants no
 * access it did not already have. That is why it needs no token and no row.
 */

import { FILTER_TARGETS, type Expr, type FilterTarget } from "./ast";
import { FilterParseError, MAX_JSON_BYTES, parseExpr } from "./parse";

/** personal = one person's view; team = shared with a team. Mirrors 0019's CHECK. */
export const SAVED_VIEW_SCOPES = ["personal", "team"] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];

/** Mirrors 0019's `length(btrim(name)) between 1 and 120`. */
export const MAX_VIEW_NAME_LENGTH = 120;

/** A row of `saved_views`, exactly as the table stores it. */
export type SavedView = {
  id: string;
  target: FilterTarget;
  name: string;
  filter: Expr;
  scope: SavedViewScope;
  owner_id: string;
  team_id: string | null;
};

/**
 * The part that travels: what a link carries and what a row is about. `id`, `scope` and
 * the ids are row bookkeeping and deliberately do NOT travel — a link that carried
 * `owner_id` would invite a receiver to store it back as their own provenance.
 */
export type SavedViewPayload = {
  target: FilterTarget;
  name: string;
  filter: Expr;
};

export function isFilterTarget(v: unknown): v is FilterTarget {
  return typeof v === "string" && (FILTER_TARGETS as readonly string[]).includes(v);
}

export function isSavedViewScope(v: unknown): v is SavedViewScope {
  return typeof v === "string" && (SAVED_VIEW_SCOPES as readonly string[]).includes(v);
}

function fail(msg: string): never {
  throw new FilterParseError(msg);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalise a view name the way 0019's unique indexes do (`lower(btrim(name))`), so the
 * duplicate a rep sees rejected in the UI is the same duplicate Postgres rejects.
 */
export function normalizeViewName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Validate an untrusted `{ target, name, filter }` — from a JSONB row, a request body, or
 * a decoded share link — into a payload safe to hand to `compile()`.
 *
 * Rebuilt field by field, never cast: a cast carries `__proto__` and every extra key off
 * the wire straight into the rest of the system.
 */
export function parseSavedViewPayload(input: unknown): SavedViewPayload {
  if (!isRecord(input)) fail("saved view must be an object");

  if (!isFilterTarget(input.target)) {
    fail(`saved view has unknown target ${JSON.stringify(input.target)}`);
  }
  if (typeof input.name !== "string") fail("saved view is missing a `name`");

  const name = input.name.trim();
  if (name.length < 1) fail("saved view name is blank");
  if (name.length > MAX_VIEW_NAME_LENGTH) {
    fail(`saved view name longer than ${MAX_VIEW_NAME_LENGTH} characters`);
  }

  // parseExpr owns the tree: unknown literals, unknown operators, depth and node count.
  return { target: input.target, name, filter: parseExpr(input.filter) };
}

/**
 * What a row carries beyond the travelling payload: who owns it and who it is shared
 * with. This is `saved_views` minus `id` — i.e. exactly what an INSERT needs.
 */
export type SavedViewOwnership = {
  scope: SavedViewScope;
  owner_id: string;
  team_id: string | null;
};

export type SavedViewInsert = SavedViewPayload & SavedViewOwnership;

/**
 * The ownership half of a row, validated once for both the read path and the write path.
 *
 * One copy on purpose: a rule enforced on read but not on write is a row the app can
 * store and then refuse to open, and Q67's whole shape is "two doors, one validator".
 */
function parseSavedViewOwnership(row: Record<string, unknown>, what: string): SavedViewOwnership {
  if (!isSavedViewScope(row.scope)) {
    fail(`${what} has unknown scope ${JSON.stringify(row.scope)}`);
  }
  if (typeof row.owner_id !== "string" || row.owner_id.trim().length === 0) {
    fail(`${what} has no owner_id`);
  }

  const teamId = row.team_id == null ? null : row.team_id;
  if (teamId !== null && (typeof teamId !== "string" || teamId.trim().length === 0)) {
    fail(`${what} has a blank team_id`);
  }

  // The same pairing 0019's `saved_views_scope_ids` enforces. Checked again here because
  // a row can also arrive from a seed, a backfill, or a hand-written insert.
  if (row.scope === "team" && teamId === null) fail("team view has no team_id");
  if (row.scope === "personal" && teamId !== null) fail("personal view carries a team_id");

  return { scope: row.scope, owner_id: row.owner_id.trim(), team_id: teamId?.trim() ?? null };
}

/**
 * Validate a full `saved_views` row. Used on the read path, because a row written before
 * a literal was renamed is exactly as untrusted as a stranger's URL.
 */
export function parseSavedViewRow(row: unknown): SavedView {
  if (!isRecord(row)) fail("saved view row must be an object");
  const payload = parseSavedViewPayload(row);

  if (typeof row.id !== "string" || row.id.length === 0) fail("saved view row has no id");
  const ownership = parseSavedViewOwnership(row, "saved view row");

  return { id: row.id, ...payload, ...ownership };
}

/**
 * Validate a create request body into the columns 0019 wants.
 *
 * `owner_id` is REQUIRED off the wire and never defaulted. There are no user records yet
 * (Q64/Q6 own that), and a route that invented an owner would be inventing an authorship
 * model Rob has not decided — the same line Q66 drew when it shipped SELECT policies and
 * deliberately no write policies. `id`, `created_at` and `updated_at` are the database's
 * to assign and are ignored if a caller sends them.
 */
export function parseSavedViewInsert(input: unknown): SavedViewInsert {
  if (!isRecord(input)) fail("saved view must be an object");
  const payload = parseSavedViewPayload(input);
  return { ...payload, ...parseSavedViewOwnership(input, "saved view") };
}

/* ------------------------------------------------------------------------------------ *
 * Share links — the same object, base64url'd.
 * ------------------------------------------------------------------------------------ */

/**
 * Base64url ceiling matching the parser's byte ceiling: base64 is 4 bytes out per 3 in,
 * so the encoded string is checked BEFORE it is decoded. Decoding a megabyte in order to
 * then reject it is work an anonymous URL should never be able to buy.
 */
export const MAX_SHARE_LINK_LENGTH = Math.ceil((MAX_JSON_BYTES * 4) / 3);

/** Strict alphabet: base64URL only. `+` and `/` are rejected rather than translated. */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // Padding is stripped: `=` is percent-encoded in a query string by half the clients
  // that touch it, and it carries no information a decoder needs.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Encode a view into the string that goes in the URL.
 *
 * UTF-8 first, then base64 — `btoa` alone throws on any character above U+00FF, so a
 * view named "Clientes — señales" would fail to share while an ASCII one worked.
 */
export function encodeShareLink(view: SavedViewPayload): string {
  const json = JSON.stringify({
    target: view.target,
    name: view.name,
    filter: view.filter,
  });
  if (json.length > MAX_JSON_BYTES) {
    fail(`share payload larger than ${MAX_JSON_BYTES} bytes`);
  }
  return bytesToBase64Url(new TextEncoder().encode(json));
}

/**
 * Decode and validate a share link. Throws `FilterParseError` on anything malformed, so a
 * route maps every failure mode to one 400.
 */
export function decodeShareLink(token: unknown): SavedViewPayload {
  if (typeof token !== "string") fail("share link must be a string");
  if (token.length === 0) fail("share link is empty");
  if (token.length > MAX_SHARE_LINK_LENGTH) {
    fail(`share link longer than ${MAX_SHARE_LINK_LENGTH} characters`);
  }
  if (!BASE64URL_RE.test(token)) fail("share link is not base64url");

  let json: string;
  try {
    // `fatal` rejects invalid UTF-8 instead of silently seeding U+FFFD into a view name.
    json = new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(token));
  } catch {
    fail("share link is not decodable");
  }

  if (json.length > MAX_JSON_BYTES) fail(`share payload larger than ${MAX_JSON_BYTES} bytes`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail("share link does not contain JSON");
  }
  return parseSavedViewPayload(parsed);
}

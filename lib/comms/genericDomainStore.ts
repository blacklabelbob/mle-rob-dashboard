import { createClient } from "@supabase/supabase-js";

// Q69 inc.24 — the loader for migration 0023's `generic_email_domains`, which
// fills `buildGraphIndex(data, extraGenericDomains)`: a seam that has existed
// since inc.1 and has never been supplied by anything.
//
// THE FLOOR IS THE CODE, THE TABLE IS ADDITIONS. `GENERIC_EMAIL_DOMAINS` is
// always applied by `genericDomainSet`; these rows are unioned on top. So an
// empty table, absent env, or a failed read can only ever mean "no extras" —
// never "nothing is generic", which is the failure mode that would let a company
// claim `gmail.com` and anchor every consumer address on earth to it.
//
// A read failure therefore CANNOT lose or misfile mail, and cannot create a
// company: rung 6 only ever PROPOSES, so the worst outcome is one reviewable
// flag queued for a domain Rob had blocked. That is why this returns the error
// for the caller to log loudly rather than throwing and taking the message down
// (the contract inc.22/inc.23 pinned: 200 so n8n never retry-loops).

export interface ExtraGenericDomains {
  domains: string[];
  /** Rows present in the table that are not usable domains, with the reason. */
  skipped: { value: string; reason: string }[];
  /** Set when the table could not be read at all; `domains` is then empty. */
  error?: string;
}

const EMPTY: ExtraGenericDomains = { domains: [], skipped: [] };

/**
 * Normalize whatever sits in the table into domains the ladder can match.
 *
 * Pure (CR-3): no clock, no network. Every rejection below is a value that
 * would otherwise sit in the table LOOKING blocked while matching nothing:
 *
 *  • an address (`billing@gmail.com`) — blocking a whole domain because one
 *    address was pasted is over-broad, and keeping it as-is matches nothing.
 *    Refused, not silently narrowed to its domain half: the row is wrong, and a
 *    counted refusal is visible where a guess is not.
 *  • a bare label (`gmail`) or `.com` — no interior dot, matches nothing.
 *  • anything with a scheme, path, port or whitespace — same.
 *
 * Case and surrounding whitespace ARE normalized: those are typing, not intent.
 */
export function normalizeExtraDomains(values: unknown[]): ExtraGenericDomains {
  const domains: string[] = [];
  const skipped: { value: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") {
      skipped.push({ value: String(raw), reason: "not a string" });
      continue;
    }
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    if (value.includes("@")) {
      skipped.push({ value, reason: "looks like an address, not a domain" });
      continue;
    }
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(value)) {
      skipped.push({ value, reason: "not a bare host" });
      continue;
    }
    if (value.indexOf(".") < 1) {
      skipped.push({ value, reason: "no interior dot" });
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    domains.push(value);
  }
  return { domains, skipped };
}

/**
 * Read the extras table. Returns `EMPTY` (no extras, no error) when Supabase env
 * is absent — file-store dev and tests are legitimately extras-free, and the
 * hardcoded floor still applies there.
 */
export async function loadExtraGenericDomains(
  env: NodeJS.ProcessEnv = process.env
): Promise<ExtraGenericDomains> {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return EMPTY;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("generic_email_domains").select("domain");
  if (error) return { domains: [], skipped: [], error: error.message };
  return normalizeExtraDomains((data ?? []).map((r) => (r as { domain: unknown }).domain));
}

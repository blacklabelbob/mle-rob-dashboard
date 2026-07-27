import { normalizeExtraDomains } from "./genericDomainStore";

// Q69 inc.25 — the decision behind the reviewer's "block this domain" click.
//
// inc.24 built the table and the read path; the table was writable only by
// service key, so "block a bulk sender without a deploy" was still half a
// promise. This is the other half, and every rule lives here rather than in the
// route so the route cannot drift away from it.
//
// TWO THINGS THIS REFUSES TO DO, both of which would be a button that lies:
//
//  • Guess a wrong row into shape. `billing@roofco.com` is not narrowed to its
//    domain half — blocking a whole company off one pasted address is
//    over-broad, and the row as typed matches nothing forever. inc.24 pinned
//    that at read time and in DB check constraints; the same answer has to come
//    back at the door, with the reason, before the row exists.
//  • Report a removal it cannot perform. The ~90 hardcoded domains are the
//    FLOOR (`GENERIC_EMAIL_DOMAINS` is always unioned in), so deleting a row
//    for `gmail.com` would return success and change nothing — the floor cannot
//    be lowered from the database, by design. That is refused and said out loud
//    instead.
//
// Pure (CR-3): no clock, no network, no Supabase client.

export type AddPlan =
  | { kind: "add"; domain: string }
  /** Already generic via the hardcoded floor — nothing to write, nothing broken. */
  | { kind: "already-in-floor"; domain: string; detail: string }
  | { kind: "refused"; value: string; reason: string; detail: string };

export type RemovePlan =
  | { kind: "remove"; domain: string }
  /** In the code floor: a row delete cannot unblock it. Never reported as done. */
  | { kind: "refused"; value: string; reason: string; detail: string };

function readOne(raw: unknown): { domain: string } | { reason: string; value: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { reason: "empty", value: typeof raw === "string" ? raw : String(raw) };
  }
  const out = normalizeExtraDomains([raw]);
  if (out.domains.length === 1) return { domain: out.domains[0] };
  const skipped = out.skipped[0];
  return { reason: skipped?.reason ?? "not a bare host", value: skipped?.value ?? raw.trim() };
}

const DETAIL: Record<string, (v: string) => string> = {
  empty: () => "Give a domain to block, e.g. mailchimp.com.",
  "looks like an address, not a domain": (v) =>
    `"${v}" is an email address. Blocking its whole domain off one address is too broad — if you do mean the domain, enter just the part after the @.`,
  "no interior dot": (v) => `"${v}" is not a domain — it needs a dot, e.g. ${v}.com.`,
  "not a bare host": (v) => `"${v}" is not a bare domain — no @, scheme, port, path or spaces.`,
  "not a string": (v) => `"${v}" is not text.`,
};

function detailFor(reason: string, value: string): string {
  return (DETAIL[reason] ?? ((v: string) => `"${v}" is not a usable domain (${reason}).`))(value);
}

export function planGenericDomainAdd(raw: unknown, floor: Set<string>): AddPlan {
  const read = readOne(raw);
  if ("reason" in read) {
    return { kind: "refused", value: read.value, reason: read.reason, detail: detailFor(read.reason, read.value) };
  }
  if (floor.has(read.domain)) {
    return {
      kind: "already-in-floor",
      domain: read.domain,
      detail: `${read.domain} is already treated as generic and always will be — it is in the built-in list, so no company can claim it. Nothing to add.`,
    };
  }
  return { kind: "add", domain: read.domain };
}

export function planGenericDomainRemove(raw: unknown, floor: Set<string>): RemovePlan {
  const read = readOne(raw);
  if ("reason" in read) {
    return { kind: "refused", value: read.value, reason: read.reason, detail: detailFor(read.reason, read.value) };
  }
  if (floor.has(read.domain)) {
    return {
      kind: "refused",
      value: read.domain,
      reason: "in-code-floor",
      detail: `${read.domain} is in the built-in generic list, not the editable one. Removing a row here would not unblock it — the built-in floor cannot be lowered from the database. It needs a code change.`,
    };
  }
  return { kind: "remove", domain: read.domain };
}

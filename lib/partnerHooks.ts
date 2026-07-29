// Q75 — where automations live, measured before it is decided.
//
// Rob framed it as a versus: (A) automation housed with the tools, in this
// repo, or (B) partners keep it on their own hub and we connect to it like a
// third-party API. The repo already answered half of that seven times over —
// every partner automation running today reaches us through an inbound
// webhook — so the open question is not "which model" but "why is the
// connection recipe re-invented per partner".
//
// This file is that recipe, declared per hook and checked against the routes
// on disk. A partner-facing contract kept in prose is stale the first time a
// route is added (CR-3), and the failure mode is not cosmetic: an undeclared
// hook is an inbound door nobody wrote down.
//
// Deliberately an inventory + a gate, not a refactor. Nothing here changes a
// route's behaviour; it pins the shape those routes already share so the
// decision in Q75's DoD is made against a number instead of a memory.

export type PartnerHook = {
  /** Directory under app/api/webhooks — the URL a partner POSTs to. */
  route: string;
  /** Shared-secret header the partner must send. */
  header: string;
  /** Env var holding the expected secret. Unset = the door is bolted (503). */
  secretEnv: string;
  /** Who calls it, in the partner's own words — not our module name. */
  caller: string;
  /**
   * Partner-facing spec a hub owner can satisfy WITHOUT reading this repo.
   * `null` is the honest state for most hooks today and is what makes the gap
   * countable; see `undocumentedHooks`.
   */
  payloadDoc: string | null;
};

/**
 * Every inbound door, as it exists on 2026-07-29.
 *
 * Order matches the routes on disk. Adding a webhook route without adding a
 * row here fails the suite by name — that is the point.
 */
export const PARTNER_HOOKS: PartnerHook[] = [
  {
    route: "aidre-call",
    header: "x-aidre-secret",
    secretEnv: "AIDRE_WEBHOOK_SECRET",
    caller: "AIDRE receptionist (partner-hosted voice product)",
    payloadDoc: "docs/plans/AIDRE-CALL-PAYLOAD-SPEC.md",
  },
  {
    route: "n8n-email",
    header: "x-n8n-secret",
    secretEnv: "N8N_EMAIL_WEBHOOK_SECRET",
    caller: "n8n cloud — Gmail sweep",
    payloadDoc: null,
  },
  {
    route: "n8n-error",
    header: "x-n8n-secret",
    secretEnv: "N8N_EMAIL_WEBHOOK_SECRET",
    caller: "n8n cloud — workflow failure notifier",
    payloadDoc: null,
  },
  {
    route: "phase-signal",
    header: "x-phase-signal-secret",
    secretEnv: "PHASE_SIGNAL_WEBHOOK_SECRET",
    caller: "partner tools reporting a Blueprint component LIVE",
    payloadDoc: "docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md",
  },
  {
    route: "twilio-recording",
    header: "x-twilio-signature",
    secretEnv: "TWILIO_AUTH_TOKEN",
    caller: "Twilio (recording-complete callback)",
    payloadDoc: null,
  },
  {
    route: "vapi",
    header: "x-vapi-secret",
    secretEnv: "VAPI_WEBHOOK_SECRET",
    caller: "Vapi (call lifecycle events)",
    payloadDoc: null,
  },
  {
    route: "voice-law",
    header: "x-n8n-secret",
    secretEnv: "N8N_EMAIL_WEBHOOK_SECRET",
    caller: "n8n cloud — voice-law monitor",
    payloadDoc: null,
  },
];

export type HookFile = {
  /** Directory name under app/api/webhooks. */
  route: string;
  source: string;
};

/**
 * The two answers Rob asked for by name — what happens when the partner's hub
 * is down, and when a key rotates — are the same two status codes in every
 * route we have. They are checked, not assumed, because a new hook that skips
 * either one is the foolproof-ness regression this item is about:
 *
 *  - 503 when the secret env is unset: an unconfigured door is inert, never
 *    open. This is also what "partner hub is down / not yet wired" looks like
 *    from our side.
 *  - 403 on a bad secret: a rotated key is rejected loudly rather than
 *    half-accepted, so the partner sees the break immediately.
 */
const REQUIRED_STATUSES = [
  { code: 403, why: "reject a rotated/wrong secret" },
  { code: 503, why: "stay inert while unconfigured" },
];

/**
 * Does the route actually read the declared header?
 *
 * Some routes read it through an exported constant (`PHASE_SIGNAL_HEADER`)
 * rather than a literal, so a literal-only check would force those routes to
 * inline their header just to satisfy a test. Accepted instead when the
 * literal lives in the shared library AND the route reads *some* header
 * identifier — narrower than "trust the declaration", wider than "must be
 * inline".
 */
export function headerIsRead(
  source: string,
  libHaystack: string,
  header: string,
): boolean {
  const literal = `"${header}"`;
  if (source.includes(literal)) return true;
  return libHaystack.includes(literal) && /headers\.get\(\s*[A-Za-z_]/.test(source);
}

export type HookAudit = {
  declared: PartnerHook[];
  files: HookFile[];
  /** Concatenated lib/ sources — where header constants and env reads live. */
  libHaystack: string;
  /** Repo-relative doc paths that exist on disk. */
  existingDocs: string[];
};

/**
 * Every way the declared contract can be a lie, as plain strings.
 *
 * Empty = the inventory matches the doors. Anything else names the route, so
 * a red suite reads as an instruction rather than a diff.
 */
export function hookBreaches(audit: HookAudit): string[] {
  const out: string[] = [];
  const onDisk = new Set(audit.files.map((f) => f.route));
  const seen = new Set<string>();

  for (const hook of audit.declared) {
    if (seen.has(hook.route)) {
      out.push(`${hook.route}: declared twice in PARTNER_HOOKS`);
      continue;
    }
    seen.add(hook.route);

    if (!onDisk.has(hook.route)) {
      // A rename leaves this behind, and a phantom door is worse than a
      // missing one: it reads as "audited" forever.
      out.push(`${hook.route}: declared but no such webhook route on disk`);
      continue;
    }

    const file = audit.files.find((f) => f.route === hook.route)!;
    if (!headerIsRead(file.source, audit.libHaystack, hook.header)) {
      out.push(`${hook.route}: declares header ${hook.header} but the route never reads it`);
    }
    if (!audit.libHaystack.includes(hook.secretEnv) && !file.source.includes(hook.secretEnv)) {
      out.push(`${hook.route}: declares secret env ${hook.secretEnv}, which appears nowhere in code`);
    }
    for (const { code, why } of REQUIRED_STATUSES) {
      if (!file.source.includes(`status: ${code}`)) {
        out.push(`${hook.route}: no ${code} response — must ${why}`);
      }
    }
    if (hook.payloadDoc && !audit.existingDocs.includes(hook.payloadDoc)) {
      out.push(`${hook.route}: payloadDoc ${hook.payloadDoc} does not exist`);
    }
  }

  for (const route of onDisk) {
    if (!seen.has(route)) {
      out.push(`${route}: inbound webhook route with no PARTNER_HOOKS entry — undeclared door`);
    }
  }

  return out;
}

/**
 * The gap Q75's DoD has to close: hooks a partner cannot wire up without
 * reading this repo. Pinned in the test so it can only shrink deliberately —
 * writing one recipe is the next increment, and this is how it gets scored.
 */
export function undocumentedHooks(declared: PartnerHook[]): string[] {
  return declared.filter((h) => h.payloadDoc === null).map((h) => h.route);
}

/**
 * How many distinct secret headers a partner integrator has to learn.
 *
 * This is the real cost of the current shape: the routes agree on behaviour
 * (403/503) and disagree on vocabulary, so "connect a new automation" means
 * re-reading a route each time instead of following one contract.
 */
export function distinctHeaders(declared: PartnerHook[]): string[] {
  return [...new Set(declared.map((h) => h.header))].sort();
}

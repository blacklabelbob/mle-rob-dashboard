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

/**
 * The ONE recipe (Q75 inc.2). Every door is specified in this single file, so a
 * hub owner reads one page instead of seven routes — that was the actual defect
 * inc.1 measured, and this is the fix it scores against.
 */
export const PARTNER_CONTRACT = "docs/partners/PARTNER-WEBHOOK-CONTRACT.md";

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
   * `## <heading>` under which PARTNER_CONTRACT specifies this door.
   *
   * Required by the type, which is deliberate: a door cannot be added in code
   * and left undocumented. What makes that non-vacuous is `contractBreaches`,
   * which reads the contract on disk — a section that exists but never names
   * the header or secret env the route actually reads is still a lie.
   */
  contractAnchor: string;
  /**
   * Optional deeper per-hook spec, linked FROM the contract rather than
   * replacing it. Existence is checked; a link to a deleted file is a breach.
   */
  deepSpec: string | null;
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
    contractAnchor: "aidre-call",
    deepSpec: "docs/plans/AIDRE-CALL-PAYLOAD-SPEC.md",
  },
  {
    route: "n8n-email",
    header: "x-n8n-secret",
    secretEnv: "N8N_EMAIL_WEBHOOK_SECRET",
    caller: "n8n cloud — Gmail sweep",
    contractAnchor: "n8n-email",
    deepSpec: null,
  },
  {
    route: "n8n-error",
    header: "x-n8n-secret",
    secretEnv: "N8N_EMAIL_WEBHOOK_SECRET",
    caller: "n8n cloud — workflow failure notifier",
    contractAnchor: "n8n-error",
    deepSpec: null,
  },
  {
    route: "phase-signal",
    header: "x-phase-signal-secret",
    secretEnv: "PHASE_SIGNAL_WEBHOOK_SECRET",
    caller: "partner tools reporting a Blueprint component LIVE",
    contractAnchor: "phase-signal",
    deepSpec: "docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md",
  },
  {
    route: "twilio-recording",
    header: "x-twilio-signature",
    secretEnv: "TWILIO_AUTH_TOKEN",
    caller: "Twilio (recording-complete callback)",
    contractAnchor: "twilio-recording",
    deepSpec: null,
  },
  {
    route: "vapi",
    header: "x-vapi-secret",
    secretEnv: "VAPI_WEBHOOK_SECRET",
    caller: "Vapi (call lifecycle events)",
    contractAnchor: "vapi",
    deepSpec: null,
  },
  {
    route: "voice-law",
    header: "x-n8n-secret",
    secretEnv: "N8N_EMAIL_WEBHOOK_SECRET",
    caller: "n8n cloud — voice-law monitor",
    contractAnchor: "voice-law",
    deepSpec: null,
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
    if (hook.deepSpec && !audit.existingDocs.includes(hook.deepSpec)) {
      out.push(`${hook.route}: deepSpec ${hook.deepSpec} does not exist`);
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
 * Split PARTNER_CONTRACT into its `## ` sections, keyed by heading.
 *
 * The contract is parsed rather than trusted because the whole value of one
 * shared recipe is that it stays true: a heading is cheap to keep and a body is
 * easy to let rot, so the body is what gets checked.
 */
export function contractSections(doc: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = doc.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    out.set(heading, nl === -1 ? "" : part.slice(nl + 1));
  }
  return out;
}

/**
 * Ways the ONE recipe can be a lie, as plain strings — same convention as
 * `hookBreaches`: empty is the pass, and every entry names its route.
 *
 * The bar is what a hub owner needs and cannot guess: which header carries the
 * secret, and which env we set on our side (so "have you configured it yet?"
 * has one answer). Prose is not audited; the two facts a partner would have to
 * come ask for are.
 */
export function contractBreaches(doc: string, declared: PartnerHook[]): string[] {
  const out: string[] = [];
  const sections = contractSections(doc);

  // The two universal answers Rob named. Stated once for all doors, so they
  // must appear in the shared preamble — not only inside per-hook sections.
  for (const code of REQUIRED_STATUSES) {
    if (!doc.includes(String(code.code))) {
      out.push(`contract: never states the ${code.code} rule — must ${code.why}`);
    }
  }

  for (const hook of declared) {
    const body = sections.get(hook.contractAnchor);
    if (body === undefined) {
      out.push(`${hook.route}: no "## ${hook.contractAnchor}" section in ${PARTNER_CONTRACT}`);
      continue;
    }
    if (!body.includes(hook.header)) {
      out.push(`${hook.route}: contract section never names its header ${hook.header}`);
    }
    if (!body.includes(hook.secretEnv)) {
      out.push(`${hook.route}: contract section never names its secret env ${hook.secretEnv}`);
    }
    if (hook.deepSpec && !body.includes(hook.deepSpec)) {
      out.push(`${hook.route}: contract section never links its deeper spec ${hook.deepSpec}`);
    }
  }

  return out;
}

/**
 * The gap Q75's DoD had to close: doors a partner cannot wire up without
 * reading this repo. Derived from the contract on disk, never from a field —
 * a hook is documented when the page actually specifies it.
 *
 * Was five of seven on inc.1 (`n8n-email`, `n8n-error`, `twilio-recording`,
 * `vapi`, `voice-law`); inc.2 wrote the one recipe and it is now zero. Pinned
 * in the test so it can only grow by somebody's deliberate choice.
 */
export function undocumentedHooks(doc: string, declared: PartnerHook[]): string[] {
  const sections = contractSections(doc);
  return declared.filter((h) => !sections.has(h.contractAnchor)).map((h) => h.route);
}

/**
 * A door as it is visible FROM THE PAGE — the integrator's side of the glass.
 *
 * `PARTNER_HOOKS` is what we know; this is what a hub owner can learn without
 * our repository. Q75 inc.3's worked example is driven off this type on
 * purpose: if the tool a partner runs were fed from `PARTNER_HOOKS`, the
 * exercise would prove nothing about the page.
 */
export type ContractDoor = {
  door: string;
  header: string;
  secretEnv: string;
  /** twilio-recording is the one form-encoded door; the page says so, so we read it. */
  formEncoded: boolean;
};

const HEADER_LINE = /\*\*Header:\*\*\s*`([^`]+)`/;
const SECRET_LINE = /\*\*Secret env \(our side\):\*\*\s*`([^`]+)`/;

/**
 * Parse the doors out of PARTNER_CONTRACT.
 *
 * A `## ` section is a door when it states a header — which is also the rule an
 * integrator applies by eye, so prose sections ("The universal rules", "Adding
 * an eighth door") are skipped by the same test that skips them for a human.
 */
export function contractDoors(doc: string): ContractDoor[] {
  const out: ContractDoor[] = [];
  for (const [heading, body] of contractSections(doc)) {
    const header = body.match(HEADER_LINE)?.[1];
    if (!header) continue;
    out.push({
      door: heading,
      header,
      secretEnv: body.match(SECRET_LINE)?.[1] ?? "",
      formEncoded: /form-encoded/.test(body),
    });
  }
  return out;
}

/**
 * The base URL a partner POSTs to, read off the page's own example block.
 *
 * Returned without a trailing slash, or null when the page stops stating it —
 * which is a breach, not a default: guessing our hostname is exactly the kind
 * of question this page exists to stop.
 */
export function contractBaseUrl(doc: string): string | null {
  const m = doc.match(/POST\s+(https?:\/\/[^\s/]+)\/api\/webhooks\//);
  return m ? m[1] : null;
}

/**
 * Ways the page can be false in the facts a partner ACTS on (Q75 inc.3).
 *
 * `contractBreaches` walks code → page ("is this door written down?"). This
 * walks page → code ("is what a partner reads here true?"), because the worked
 * example made the difference concrete: an integrator never sees
 * `PARTNER_HOOKS`, so a header typo on the page costs them a support round
 * trip while every code-side check stays green.
 */
export function doorParityBreaches(doc: string, declared: PartnerHook[]): string[] {
  const out: string[] = [];
  const byAnchor = new Map(declared.map((h) => [h.contractAnchor, h]));

  if (!contractBaseUrl(doc)) {
    out.push("contract: no POST base URL on the page — a partner cannot address a door");
  }

  for (const door of contractDoors(doc)) {
    const hook = byAnchor.get(door.door);
    if (!hook) {
      out.push(`${door.door}: page specifies a door that is in no PARTNER_HOOKS row`);
      continue;
    }
    if (door.header !== hook.header) {
      out.push(
        `${door.door}: page tells partners to send ${door.header}, code reads ${hook.header}`,
      );
    }
    if (door.secretEnv !== hook.secretEnv) {
      out.push(
        `${door.door}: page names secret env ${door.secretEnv || "(none)"}, code uses ${hook.secretEnv}`,
      );
    }
  }

  for (const hook of declared) {
    if (!contractDoors(doc).some((d) => d.door === hook.contractAnchor)) {
      out.push(`${hook.route}: has no machine-readable Header line on the page`);
    }
  }

  return out;
}

const QUESTIONS_HEADING = "What this page still does not answer";

/**
 * The questions an integrator still has to ask us, as the page itself admits
 * them (Q75 inc.3's DoD: *count* them).
 *
 * Written down rather than remembered because this number is the item's score:
 * the recipe is finished when a hub owner can connect without a conversation,
 * and an honest list of what still forces one is the only way to tell how far
 * off that is. Pinned in the suite so it shrinks by decision and never grows
 * by drift.
 */
export function openQuestions(doc: string): string[] {
  const body = contractSections(doc).get(QUESTIONS_HEADING);
  if (body === undefined) return [];
  return [...body.matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gm)].map((m) => m[1].trim());
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

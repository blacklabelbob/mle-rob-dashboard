// Q69 inc.26 — what the reviewer is TOLD after clicking block / unblock.
//
// inc.25 built the door (`/api/admin/generic-domains`) and was explicit about
// what was still missing: nothing in the UI opens it. This is the contract for
// the control that does — kept out of the component (CR-3) so the sentence a
// human reads is unit-testable and cannot drift from the route's answers.
//
// THE ONE RULE: the panel may only say what the route actually reported.
// The route deliberately answers `200 { added: false }` in two cases — the
// domain is in the built-in floor, or the row already existed — and a panel
// that reads `r.ok` alone would render both as "blocked!" and refresh a list
// that gained nothing. Every branch below therefore carries `changed`, which is
// the ONLY thing allowed to trigger a refetch, and a tone that disagrees with
// success whenever nothing happened.
//
// Pure: no clock, no fetch, no DOM.

export type PanelTone = "ok" | "info" | "warn" | "error";

export type ClaimLink = { id: string; name: string; href: string };

/**
 * Q69 inc.27 — the forward-only footnote. A block stops the NEXT email from
 * claiming a company; it does not undo the org an earlier one already made.
 * When the route reports an existing claim (or that it could not check), the
 * panel carries it alongside the outcome instead of letting a green "blocked!"
 * imply the CRM is now clean.
 */
export type PanelClaim = { kind: "claimed" | "unknown"; text: string; links: ClaimLink[] };

export type PanelOutcome = {
  text: string;
  tone: PanelTone;
  /** True only when the stored blocklist actually changed. Drives refetch. */
  changed: boolean;
  /** Present only when the route said something about an existing claim. */
  claim?: PanelClaim;
};

/** A parsed JSON response body, or nothing at all when the request never landed. */
export type PanelBody = Record<string, unknown> | null | undefined;
type Body = PanelBody;

function str(body: Body, key: string): string {
  const v = body?.[key];
  return typeof v === "string" ? v : "";
}

/**
 * The request never came back. This is NOT "nothing happened" — the write may
 * have landed. Same distinction ThingsToAddress draws for a dropped PATCH: the
 * reviewer is asked to reload, not to re-click, because a blind retry is how a
 * domain gets blocked twice or unblocked after it was blocked.
 */
function dropped(verb: string): PanelOutcome {
  return {
    text: `The request never came back, so ${verb} may or may not have been saved. Reload to see the current list.`,
    tone: "error",
    changed: false,
  };
}

/**
 * Read the route's advisory claim block. Anything malformed is dropped rather
 * than half-rendered — a claim sentence with no text, or a link list we cannot
 * trust, is worse than none. `none` never reaches here (the route omits it).
 */
export function claimFrom(body: Body): PanelClaim | undefined {
  const raw = body?.claim;
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const kind = c.kind === "claimed" || c.kind === "unknown" ? c.kind : null;
  const text = typeof c.text === "string" ? c.text : "";
  if (!kind || !text) return undefined;
  const links = Array.isArray(c.links)
    ? (c.links as unknown[]).filter(
        (l): l is ClaimLink =>
          !!l &&
          typeof l === "object" &&
          typeof (l as ClaimLink).id === "string" &&
          typeof (l as ClaimLink).name === "string" &&
          typeof (l as ClaimLink).href === "string"
      )
    : [];
  return { kind, text, links };
}

export function addOutcome(status: number | null, body: Body): PanelOutcome {
  if (status === null) return dropped("this block");

  if (status === 200) {
    const domain = str(body, "domain");
    const claim = claimFrom(body);
    if (body?.added === true) {
      return {
        text: `${domain} is now treated as generic — no company will claim it.`,
        tone: "ok",
        changed: true,
        ...(claim ? { claim } : {}),
      };
    }
    // added:false is a real answer, not a failure: the outcome asked for is
    // already true. Info, never "ok" — nothing was written, so nothing refetches.
    return {
      text: str(body, "detail") || `${domain} was already blocked.`,
      tone: "info",
      changed: false,
      ...(claim ? { claim } : {}),
    };
  }

  // 422 refused / 500 write-failed / 503 no-database all write their own
  // human-readable sentence; show it verbatim rather than a status code the
  // reviewer cannot act on. Amber for "fix what you typed", red for "the write
  // failed" — the second one is not the reviewer's mistake.
  const detail = str(body, "detail") || str(body, "error");
  return {
    text: detail || `Nothing was blocked (${status}).`,
    tone: status === 422 ? "warn" : "error",
    changed: false,
  };
}

export function removeOutcome(status: number | null, body: Body): PanelOutcome {
  if (status === null) return dropped("this unblock");

  if (status === 200) {
    const domain = str(body, "domain");
    if (body?.removed === true) {
      return { text: `${domain} unblocked — it can be claimed by a company again.`, tone: "ok", changed: true };
    }
    return { text: str(body, "detail") || `${domain} was not on your blocklist.`, tone: "info", changed: false };
  }

  const detail = str(body, "detail") || str(body, "error");
  return {
    // 409 is the floor refusing: retyping cannot fix it, so it is a standing
    // fact (amber), not a red failure the reviewer should retry.
    text: detail || `Nothing was unblocked (${status}).`,
    tone: status === 500 ? "error" : "warn",
    changed: false,
  };
}

export type BlocklistRow = { domain: string; note: string | null; added_by: string | null; created_at: string };

export type BlocklistView =
  | { kind: "ready"; rows: BlocklistRow[]; floorCount: number; notice: "" }
  /** Reached the route, but the extras could not be read. Never render "none". */
  | { kind: "unreadable"; rows: []; floorCount: number; notice: string };

/**
 * An empty list and an unreadable list look identical on screen unless the
 * panel refuses to conflate them. "No extra domains blocked" is a claim about
 * the database; we only get to make it from a successful read — otherwise the
 * reviewer adds a domain that is already there, or assumes their blocks were
 * lost. The route hands us `readable` precisely so this stays honest.
 */
export function blocklistView(status: number | null, body: Body): BlocklistView {
  if (status === null) {
    return {
      kind: "unreadable",
      rows: [],
      floorCount: 0,
      notice: "Couldn't reach the blocklist. The built-in generic domains still apply.",
    };
  }
  const floorCount = typeof body?.floorCount === "number" ? body.floorCount : 0;
  const rows = Array.isArray(body?.added) ? (body.added as BlocklistRow[]) : null;
  if (status === 200 && body?.readable === true && rows) {
    return { kind: "ready", rows, floorCount, notice: "" };
  }
  return {
    kind: "unreadable",
    rows: [],
    floorCount,
    notice:
      str(body, "detail") ||
      "Couldn't read the domains you've added. The built-in generic domains still apply.",
  };
}

/** The floor, stated once so the panel never implies the list is only the rows. */
export function floorCaption(floorCount: number): string {
  if (floorCount <= 0) return "Built-in generic domains always apply and cannot be removed here.";
  return `Plus ${floorCount} built-in generic domains (gmail.com, outlook.com, …) that always apply and cannot be removed here.`;
}

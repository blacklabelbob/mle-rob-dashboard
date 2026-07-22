// PRD Task 1.11 — AIDRE/AIVA lead-intake payload envelope, shipped AS CODE
// per CR-3 (Q25/Q27/Q29/Q30 precedent: Sales "spec" tasks live as a pure,
// unit-tested module; prose narrates in docs/plans/LEAD-INTAKE-PAYLOAD-SPEC.md,
// code is canonical). This is the schema "handed to Engineering for Task 5.1":
// the body `POST /api/leads` accepts from AIDRE / AIVA (per-product bearer
// tokens pick which product is even ALLOWED to claim itself — the token check
// itself is 5.1's job, not this module's).
//
// Task 1.11's field list, verbatim → where each lives here:
//   product      → `product` ("aidre" | "aiva")
//   source       → `source_context` (Task 1.15's typed shapes, validated by
//                  composing parseIntakeSourceContext — one rule source)
//   company      → `company` (free text; 5.1 matches/creates the org)
//   vertical     → `vertical` (free text; 5.1 maps to the vertical registry,
//                  falling back to the product's home vertical)
//   demo dates   → `demo.requested_at` / `demo.scheduled_for` (ISO strings)
//   assigned rep → `assigned_rep` (free text until Phase-4 profiles — same
//                  dated deviation as 0005's owner_id/assigned_to columns)
//   stage=New Lead → NOT a payload field. The server opens the deal at
//                  INTAKE_STAGE ("new_lead") unconditionally; a client-supplied
//                  `stage` key REJECTS the whole payload (same smuggling
//                  posture as the /deals stage-only patch gate in lib/crm.ts).
//
// Pure: no clock, no I/O. Date fields are validated as ISO-8601 strings via
// Date.parse on the literal value (deterministic — no `now` involved).

import {
  parseIntakeSourceContext,
  WORKED_EXAMPLES,
  type IntakeSourceContext,
} from "./sourceContext";

export const INTAKE_PRODUCTS = ["aidre", "aiva"] as const;
export type IntakeProduct = (typeof INTAKE_PRODUCTS)[number];

/** The stage every intake deal opens at. Server-pinned — never client-supplied. */
export const INTAKE_STAGE = "new_lead" as const;

/** Who the lead IS — name plus at least one way to reach them. */
export interface IntakeContact {
  name: string;
  /** At least one of email/phone is required — a lead nobody can reach isn't a lead. */
  email?: string;
  phone?: string;
  /** Their role at the company, when known (e.g. "Owner", "Office manager"). */
  role?: string;
}

/** Demo dates, both optional and independent (requested ≠ booked). */
export interface IntakeDemo {
  /** When the prospect ASKED for a demo (ISO-8601). */
  requested_at?: string;
  /** When a demo is actually BOOKED for (ISO-8601). */
  scheduled_for?: string;
}

export interface LeadIntakePayload {
  product: IntakeProduct;
  contact: IntakeContact;
  /** Company name, free text — Task 5.1 matches or creates the org record. */
  company?: string;
  /** Vertical, free text (e.g. "roofing") — 5.1 maps to the registry. */
  vertical?: string;
  /** Task 1.15 source detail — REQUIRED: every intake lead says where it came from. */
  source_context: IntakeSourceContext;
  demo?: IntakeDemo;
  /** Rep to route to, free text until Phase-4 profiles. Omit → Task 1.14 routing decides. */
  assigned_rep?: string;
}

export type LeadIntakeParseResult =
  | { ok: true; payload: LeadIntakePayload }
  | { ok: false; errors: string[] };

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isIsoDateString = (v: unknown): boolean =>
  isNonEmptyString(v) && !Number.isNaN(Date.parse(v));

/**
 * Validate a `POST /api/leads` body against Task 1.11's envelope.
 * Reports EVERY problem (same contract as Tasks 1.9 and 1.15) so a 401-passed
 * 400 body doubles as integration fix-it instructions for the AIDRE/AIVA side.
 * Unknown extra keys are permitted (additive evolution) with ONE exception:
 * `stage` — intake always opens at INTAKE_STAGE, so a payload trying to set
 * it is refused outright rather than silently ignored.
 */
export function parseLeadIntake(raw: unknown): LeadIntakeParseResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["payload must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if ("stage" in obj) {
    errors.push(`stage: not accepted — intake always opens at "${INTAKE_STAGE}"`);
  }
  if (!isNonEmptyString(obj.product) || !(INTAKE_PRODUCTS as readonly string[]).includes(obj.product)) {
    errors.push(`product must be one of: ${INTAKE_PRODUCTS.join(", ")}`);
  }

  const contact = obj.contact as Record<string, unknown> | undefined;
  if (contact === null || typeof contact !== "object" || Array.isArray(contact)) {
    errors.push("contact: object with { name, email and/or phone } required");
  } else {
    if (!isNonEmptyString(contact.name)) errors.push("contact.name: non-empty string required");
    if (!isNonEmptyString(contact.email) && !isNonEmptyString(contact.phone)) {
      errors.push("contact: at least one of email/phone required");
    }
  }

  if (!("source_context" in obj)) {
    errors.push("source_context: required (Task 1.15 shape — every lead says where it came from)");
  } else {
    const sc = parseIntakeSourceContext(obj.source_context);
    if (!sc.ok) errors.push(...sc.errors.map((e) => `source_context.${e}`));
  }

  const demo = obj.demo as Record<string, unknown> | undefined;
  if (demo !== undefined) {
    if (demo === null || typeof demo !== "object" || Array.isArray(demo)) {
      errors.push("demo: object with optional { requested_at, scheduled_for } expected");
    } else {
      for (const field of ["requested_at", "scheduled_for"] as const) {
        if (demo[field] !== undefined && !isIsoDateString(demo[field])) {
          errors.push(`demo.${field}: ISO-8601 date string required`);
        }
      }
    }
  }

  for (const field of ["company", "vertical", "assigned_rep"] as const) {
    if (obj[field] !== undefined && !isNonEmptyString(obj[field])) {
      errors.push(`${field}: non-empty string when present`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, payload: obj as unknown as LeadIntakePayload };
}

// ── Worked examples — one per product, test-pinned valid forever ────────────
// AIDRE/AIVA integrators import these instead of copying doc snippets; the
// source_context values reuse Task 1.15's own pinned examples so the two
// specs can never drift apart.

export const INTAKE_WORKED_EXAMPLES: Record<IntakeProduct, LeadIntakePayload> = {
  // AIDRE lead: missed-call receptionist demo, born from an email reply.
  aidre: {
    product: "aidre",
    contact: {
      name: "Dale Hutchins",
      email: "owner@peakridgeroofing.com",
      phone: "+18135550142",
      role: "Owner",
    },
    company: "Peak Ridge Roofing",
    vertical: "roofing",
    source_context: WORKED_EXAMPLES.email_reply,
    demo: { requested_at: "2026-07-20T14:05:00Z", scheduled_for: "2026-07-24T15:00:00Z" },
  },
  // AIVA lead: avatar web-chat demo request via the site form; no rep named —
  // routing (Task 1.14) decides.
  aiva: {
    product: "aiva",
    contact: {
      name: "Marisol Vega",
      email: "marisol@suncoasttitleco.com",
      role: "Operations manager",
    },
    company: "Suncoast Title Co",
    vertical: "real-estate-title",
    source_context: WORKED_EXAMPLES.web_form,
    demo: { requested_at: "2026-07-21T18:30:00Z" },
  },
};

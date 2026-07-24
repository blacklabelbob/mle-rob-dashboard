// PRD Task MC.8 (base 8.3): the read-model data contract — the six views the
// Mission-Control panels (MC.12) read, plus the SELECT-only `dashboard_ro`
// role. Contract is CODE per CR-3; `docs/data-contract.md` is GENERATED from
// this module (scripts/gen-data-contract.mjs) and a test fails the suite if
// the committed doc drifts from the registry. There is no hand-edited copy of
// these tables anywhere.
//
// Honest coverage, same posture as MC.2/MC.3: a read model whose source data
// does not exist yet says so. It does NOT get a view that returns zero rows
// and reads like a working feature — two of the six are structurally
// unbuildable today and are named as such, with the task that unblocks them.
//
// Column truth gate: every `source` below is a real column on a real table,
// verified against supabase/migrations/*.sql and live introspection on
// 2026-07-24. `SOURCE_COLUMNS` pins that set, and a test asserts every read
// model column resolves into it — an invented field fails the build, which is
// the whole point of writing the contract as code instead of prose.

export type ReadModelId =
  | "rm_pipeline"
  | "rm_esign_status"
  | "rm_action_items"
  | "rm_delivery_phases"
  | "rm_invoices_ar"
  | "rm_nudge_activity";

export type ReadModelCoverage =
  /** Source tables exist; the view can be created and will return real rows. */
  | "buildable_now"
  /** Source tables exist and the view is correct, but prod holds zero rows today. */
  | "buildable_empty"
  /** No backing store exists in Postgres — a view is structurally impossible. */
  | "blocked_no_source";

export type ReadModelColumn = {
  name: string;
  /** `table.column` — must resolve in SOURCE_COLUMNS. */
  source: string;
  note?: string;
};

export type ReadModel = {
  id: ReadModelId;
  label: string;
  purpose: string;
  sourceTables: readonly string[];
  columns: readonly ReadModelColumn[];
  coverage: ReadModelCoverage;
  coverageNote: string;
  /** Queue/PRD item that unblocks it. Null when nothing is blocking. */
  unblockedBy: string | null;
};

/** Real columns, per supabase/migrations + live introspection 2026-07-24.
 *  Only the tables the read models touch are listed. */
export const SOURCE_COLUMNS: Record<string, readonly string[]> = {
  deals: [
    "id", "person_id", "org_id", "vertical_id", "owner_id", "name", "stage",
    "value", "routing_lane", "referral_sourced", "key_dates", "estimate",
    "book_protected", "notes", "created_at", "updated_at",
  ],
  tasks: [
    "id", "activity_id", "deal_id", "person_id", "assigned_to", "title",
    "detail", "status", "due_date", "book_protected", "created_at", "updated_at",
  ],
  documents: [
    "id", "person_id", "org_id", "deal_id", "title", "phase", "storage_path",
    "sha256_at_upload", "sha256_signed", "signed_path", "version", "status",
    "supersedes_id", "created_by", "created_at", "updated_at",
    "countersigned_at", "countersigner_name", "countersigner_title",
    "countersigner_email", "countersigned_path", "sha256_countersigned",
  ],
  signature_requests: [
    "id", "document_id", "token_hash", "expires_at", "channel", "sent_to",
    "signer_name", "signer_email", "signer_ip", "signer_user_agent",
    "consent_at", "viewed_at", "signed_at", "voided_at", "sha256_at_sign",
    "presend_answers", "status", "signer_type", "created_at", "updated_at",
  ],
  signature_events: ["id", "request_id", "type", "at", "ip", "meta"],
  people: ["id", "name", "business", "email", "phone", "org_id", "status", "assigned_rep"],
  orgs: ["id", "name", "business", "email", "phone", "status", "assigned_rep"],
};

/** Read models never expose these, whatever the panel asks for: single-use
 *  token material, raw signer forensics, and file digests are audit-chain
 *  internals, not dashboard data. Pinned by test. */
export const NEVER_EXPOSED: readonly string[] = [
  "signature_requests.token_hash",
  "signature_requests.signer_ip",
  "signature_requests.signer_user_agent",
  "signature_requests.sha256_at_sign",
  "documents.sha256_at_upload",
  "documents.sha256_signed",
  "documents.sha256_countersigned",
];

export const READ_MODELS: readonly ReadModel[] = [
  {
    id: "rm_pipeline",
    label: "Pipeline",
    purpose:
      "One row per deal with its stage, owner and value — the MC.12 Pipeline panel and every stage-count KPI read this, never the deals table directly.",
    sourceTables: ["deals", "people", "orgs"],
    columns: [
      { name: "deal_id", source: "deals.id" },
      { name: "deal_name", source: "deals.name" },
      { name: "stage", source: "deals.stage", note: "canonical ladder — Task 1.6" },
      { name: "value", source: "deals.value", note: "dollars; COMPED deals are $0 by Rob's 7/23 ruling, render as COMPED not $0" },
      { name: "owner", source: "deals.owner_id", note: "free text until Phase-4 profiles" },
      { name: "person_id", source: "deals.person_id" },
      { name: "org_id", source: "deals.org_id" },
      { name: "counterparty_name", source: "people.name", note: "coalesced with orgs.name — a deal anchors to exactly one" },
      { name: "vertical_id", source: "deals.vertical_id" },
      { name: "routing_lane", source: "deals.routing_lane" },
      { name: "stage_entered_at", source: "deals.updated_at", note: "proxy; the precise value is the latest status_change activity (Task 4.7)" },
      { name: "created_at", source: "deals.created_at" },
    ],
    coverage: "buildable_now",
    coverageNote: "deals is live with real rows on prod.",
    unblockedBy: null,
  },
  {
    id: "rm_esign_status",
    label: "E-sign status",
    purpose:
      "One row per agreement with where it sits in the signature ladder — the Onboarding/E-sign panel. Joins the request to its document so a panel never has to reconstruct the pair.",
    sourceTables: ["documents", "signature_requests"],
    columns: [
      { name: "document_id", source: "documents.id" },
      { name: "title", source: "documents.title" },
      { name: "phase", source: "documents.phase" },
      { name: "document_status", source: "documents.status" },
      { name: "person_id", source: "documents.person_id" },
      { name: "org_id", source: "documents.org_id" },
      { name: "deal_id", source: "documents.deal_id" },
      { name: "request_id", source: "signature_requests.id" },
      { name: "request_status", source: "signature_requests.status" },
      { name: "signer_name", source: "signature_requests.signer_name" },
      { name: "signer_email", source: "signature_requests.signer_email" },
      { name: "signer_type", source: "signature_requests.signer_type" },
      { name: "sent_at", source: "signature_requests.created_at" },
      { name: "viewed_at", source: "signature_requests.viewed_at" },
      { name: "signed_at", source: "signature_requests.signed_at" },
      { name: "expires_at", source: "signature_requests.expires_at" },
      { name: "countersigned_at", source: "documents.countersigned_at" },
    ],
    coverage: "buildable_empty",
    coverageNote:
      "Schema is live (migrations 0008/0009/0010) but prod holds ZERO documents and ZERO signature_requests as of 2026-07-24 — the one real agreement to date went out before the flow shipped (MC.6 §2). The view is correct and will populate on first send; a panel built on it must render an empty state, not a broken one.",
    unblockedBy: null,
  },
  {
    id: "rm_action_items",
    label: "Action items",
    purpose:
      "Open work with an owner and a due date, split ours-vs-theirs by assignee — the Action Items panel and the overdue alerting in MC.14.",
    sourceTables: ["tasks"],
    columns: [
      { name: "task_id", source: "tasks.id" },
      { name: "title", source: "tasks.title" },
      { name: "detail", source: "tasks.detail" },
      { name: "status", source: "tasks.status" },
      { name: "due_date", source: "tasks.due_date" },
      { name: "assigned_to", source: "tasks.assigned_to", note: "free text until Phase-4 profiles; ours-vs-theirs is derived from it" },
      { name: "deal_id", source: "tasks.deal_id", note: "nullable — a deal delete strands the task (the orphan path Task 3.7 watches)" },
      { name: "person_id", source: "tasks.person_id" },
      { name: "created_at", source: "tasks.created_at" },
    ],
    coverage: "buildable_now",
    coverageNote: "tasks is live.",
    unblockedBy: null,
  },
  {
    id: "rm_delivery_phases",
    label: "Delivery phases",
    purpose:
      "Per-customer Phase 1-3 Blueprint with each phase's component checklist and its live/not-live state.",
    sourceTables: [],
    columns: [],
    coverage: "blocked_no_source",
    coverageNote:
      "No phase/component store exists. `documents.phase` is a label on one PDF and `people.phase_one` is free text — neither is a component checklist, and inventing a view over them would fake a feature. The phase model itself is unbuilt.",
    unblockedBy: "Q40 (customer Phase 1-3 model + component completion webhook)",
  },
  {
    id: "rm_invoices_ar",
    label: "Invoices / AR",
    purpose: "Issued invoices, amounts, due dates and aging buckets.",
    sourceTables: [],
    columns: [],
    coverage: "blocked_no_source",
    coverageNote:
      "GATE G3 (MC.7, 2026-07-23) settled this: the ONLY live invoicing store is `invoice-ledger.csv` in the contracts repo — Supabase has no invoice/AR table (all 12 backup tables checked; invoices/invoice/ar/ledger/payments/billing all 404 on REST). A SQL view is structurally impossible, so the AR panel reads a CSV-diff ingestion, not this contract. Named here rather than silently dropped.",
    unblockedBy: "MC.9 invoicing leg (scheduled CSV diff → a real table)",
  },
  {
    id: "rm_nudge_activity",
    label: "Nudge activity",
    purpose:
      "Every reminder actually sent on a signature request — the audit trail behind the hourly nudge ladder, so 'did we chase this?' is answerable without reading n8n logs.",
    sourceTables: ["signature_events", "signature_requests"],
    columns: [
      { name: "event_id", source: "signature_events.id" },
      { name: "request_id", source: "signature_events.request_id" },
      { name: "event_type", source: "signature_events.type", note: "filtered to nudge/sent/resent — the delivery rungs" },
      { name: "occurred_at", source: "signature_events.at" },
      { name: "meta", source: "signature_events.meta", note: "rung + channel written by the nudge cron" },
      { name: "document_id", source: "signature_requests.document_id" },
      { name: "request_status", source: "signature_requests.status" },
    ],
    coverage: "buildable_empty",
    coverageNote:
      "signature_events is live and append-only (DB trigger, service role included), but with zero requests on prod there are zero nudge events today. The hourly ladder (n8n CxFUrjo29NiYMofS) writes these the moment a real request exists.",
    unblockedBy: null,
  },
];

/** The SELECT-only role the dashboard connects as. Kept here so the doc, the
 *  migration and the negative test all quote ONE definition. */
export const DASHBOARD_RO_ROLE = {
  name: "dashboard_ro",
  grants: ["SELECT on each rm_* view"],
  denies: ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "any base-table access"],
  rationale:
    "A read panel that can write is a read panel that will eventually write. The role holds no base-table grant at all, so even a compromised panel query cannot reach `deals` or `people` directly — it can only see what a view chose to expose.",
} as const;

export function getReadModel(id: ReadModelId): ReadModel {
  const found = READ_MODELS.find((m) => m.id === id);
  if (!found) throw new Error(`unknown read model: ${id}`);
  return found;
}

/** True when the view can actually be created against today's schema. */
export function isCreatable(model: ReadModel): boolean {
  return model.coverage !== "blocked_no_source";
}

const COVERAGE_LABEL: Record<ReadModelCoverage, string> = {
  buildable_now: "✅ buildable now",
  buildable_empty: "🟡 buildable, zero rows today",
  blocked_no_source: "⛔ blocked — no backing store",
};

/** Renders `docs/data-contract.md`. The committed doc is compared against this
 *  output by a test, so prose and registry cannot drift. */
export function renderDataContractMarkdown(): string {
  const lines: string[] = [];
  lines.push("# Read-model data contract (PRD Task MC.8)");
  lines.push("");
  lines.push(
    "> **Generated file — do not hand-edit.** Source of truth is `lib/readModel/contract.ts`;",
  );
  lines.push(
    "> regenerate with `node scripts/gen-data-contract.mjs`. A vitest check fails if this file drifts.",
  );
  lines.push("");
  lines.push(
    "The Mission-Control panels (MC.12) read these views and nothing else. Two of the six have no backing store today and say so here rather than shipping an empty view that reads like a working feature.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| View | Coverage | Source tables | Unblocked by |");
  lines.push("| --- | --- | --- | --- |");
  for (const m of READ_MODELS) {
    lines.push(
      `| \`${m.id}\` | ${COVERAGE_LABEL[m.coverage]} | ${
        m.sourceTables.length ? m.sourceTables.map((t) => `\`${t}\``).join(", ") : "—"
      } | ${m.unblockedBy ?? "—"} |`,
    );
  }
  lines.push("");
  for (const m of READ_MODELS) {
    lines.push(`## \`${m.id}\` — ${m.label}`);
    lines.push("");
    lines.push(m.purpose);
    lines.push("");
    lines.push(`**Coverage:** ${COVERAGE_LABEL[m.coverage]} — ${m.coverageNote}`);
    if (m.unblockedBy) lines.push(`\n**Unblocked by:** ${m.unblockedBy}`);
    lines.push("");
    if (m.columns.length === 0) {
      lines.push("_No columns — the view is not creatable against today's schema._");
      lines.push("");
      continue;
    }
    lines.push("| Column | Source | Note |");
    lines.push("| --- | --- | --- |");
    for (const c of m.columns) {
      lines.push(`| \`${c.name}\` | \`${c.source}\` | ${c.note ?? ""} |`);
    }
    lines.push("");
  }
  lines.push(`## Role \`${DASHBOARD_RO_ROLE.name}\``);
  lines.push("");
  lines.push(DASHBOARD_RO_ROLE.rationale);
  lines.push("");
  lines.push(`- **Granted:** ${DASHBOARD_RO_ROLE.grants.join("; ")}`);
  lines.push(`- **Denied:** ${DASHBOARD_RO_ROLE.denies.join(", ")}`);
  lines.push("");
  lines.push("## Never exposed");
  lines.push("");
  lines.push(
    "No read model exposes these — single-use token material, signer forensics and file digests are audit-chain internals, not dashboard data:",
  );
  lines.push("");
  for (const f of NEVER_EXPOSED) lines.push(`- \`${f}\``);
  lines.push("");
  return lines.join("\n");
}

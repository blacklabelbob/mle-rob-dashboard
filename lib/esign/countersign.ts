// Q47 countersign planner (walkthrough step 5, MLE side). Pure: no clock, no
// network, no Next imports (CR-3) — callers execute the returned intents and
// pass `now` in. The rule the rest of the flow depends on: a countersignature
// is an INTERNAL step that can never change the counterparty's binding state,
// so this module never touches document.status (see 0010 migration header).

import { buildEvent, type SignatureEventRow } from "./events";
import type { DocumentStatus } from "./status";

export interface CountersignDoc {
  id: string;
  status: DocumentStatus;
  signed_path: string | null;
  countersigned_at: string | null;
}

export type CountersignState =
  | "not_signed" // counterparty hasn't signed — nothing to countersign yet
  | "awaiting" // signed by them, waiting on MLE
  | "complete"; // both parties on the paper

export function countersignState(doc: CountersignDoc): CountersignState {
  if (doc.countersigned_at) return "complete";
  return doc.status === "signed" ? "awaiting" : "not_signed";
}

// The chip copy the record page renders. Honest by construction: it can only
// say "fully executed" when a countersigned_at fact exists on the row.
export function countersignLabel(doc: CountersignDoc): string {
  switch (countersignState(doc)) {
    case "complete":
      return "fully executed";
    case "awaiting":
      return "signed · awaiting your countersignature";
    default:
      return doc.status;
  }
}

export interface CountersignInput {
  name: string; // printed name of the MLE representative
  title: string; // their authority ("Managing Member", …) — appears on the paper
  email?: string | null;
  ip?: string | null;
}

export interface CountersignPlan {
  // Patch for the documents row. `status` is deliberately absent.
  documentPatch: {
    countersigned_at: string;
    countersigner_name: string;
    countersigner_title: string;
    countersigner_email: string | null;
  };
  // Appended to the SIGNER's request so one chain carries the whole story.
  event: SignatureEventRow;
  // The signer-stamped PDF the server must re-stamp with the second signature.
  stampSourcePath: string;
}

/**
 * Plan a countersignature. Refuses — rather than silently no-oping — on every
 * state that would produce a lie on the paper.
 */
export function planCountersign(
  doc: CountersignDoc,
  requestId: string,
  input: CountersignInput,
  now: string
): CountersignPlan {
  const state = countersignState(doc);
  if (state === "not_signed") {
    throw new Error(
      `esign countersign: document ${doc.id} is '${doc.status}' — the other party has not signed yet`
    );
  }
  if (state === "complete") {
    // Idempotency guard: a double-submit must not overwrite the original
    // countersigner or re-date an executed agreement.
    throw new Error(`esign countersign: document ${doc.id} is already countersigned`);
  }
  if (!doc.signed_path) {
    throw new Error(
      `esign countersign: document ${doc.id} is signed but has no stored signed copy to stamp`
    );
  }
  const name = input.name.trim();
  const title = input.title.trim();
  if (!name) throw new Error("esign countersign: printed name required");
  if (!title) throw new Error("esign countersign: signer title/authority required");
  if (!requestId) throw new Error("esign countersign: request_id required");
  if (Number.isNaN(Date.parse(now))) throw new Error(`esign countersign: bad timestamp ${now}`);

  return {
    documentPatch: {
      countersigned_at: now,
      countersigner_name: name,
      countersigner_title: title,
      countersigner_email: input.email?.trim() || null,
    },
    event: buildEvent(requestId, "countersigned", now, {
      ip: input.ip ?? null,
      meta: { document_id: doc.id, countersigner_name: name, countersigner_title: title },
    }),
    stampSourcePath: doc.signed_path,
  };
}

// Certificate line for the audit page — mirrors the signer block so a court
// reading the certificate sees both parties in the same shape.
export function countersignCertificateLines(doc: CountersignDoc & {
  countersigner_name?: string | null;
  countersigner_title?: string | null;
}): string[] {
  if (!doc.countersigned_at) return [];
  return [
    `MLE representative: ${doc.countersigner_name ?? "(unrecorded)"}${
      doc.countersigner_title ? `, ${doc.countersigner_title}` : ""
    }`,
    `Countersigned (server-stamped): ${doc.countersigned_at}`,
  ];
}

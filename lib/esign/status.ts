// Q47 e-sign status machines, as data (CR-3: the walkthrough's chip ladder
// draft→sent→viewed→signed lives HERE, not in route prose). Enum arrays are
// gate-tested against the 0008 DDL in lib/esign/__tests__ so schema drift
// fails the suite (lib/crm.ts precedent).

export const DOCUMENT_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "signed",
  "voided",
  "archived",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const REQUEST_STATUSES = [
  "pending",
  "viewed",
  "signed",
  "voided",
  "expired",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// Forward ladder + the two exits. `sent→signed` is legal on purpose: signing
// implies viewing, and a race between the view logger and the sign POST must
// never strand a signature. Nothing leaves `signed` (a signed agreement is
// immutable history; superseding = new version, not a status edit). `archived`
// is reached only via the version-archival rule below.
export const DOC_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  draft: ["sent", "voided", "archived"],
  sent: ["viewed", "signed", "voided", "archived"],
  viewed: ["signed", "voided", "archived"],
  signed: [],
  voided: ["archived"],
  archived: [],
};

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return (DOC_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: DocumentStatus, to: DocumentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`esign status: illegal transition ${from} → ${to}`);
  }
}

// Version-archival rule (walkthrough step 7): a resend with CHANGED answers
// bumps to a new document version — the old document is auto-archived and its
// open links voided. Pure planner: callers execute the returned intents.
export interface ArchivePlan {
  archiveDocumentId: string;
  voidRequestIds: string[];
}

export function archiveOnNewVersion(
  oldDoc: { id: string; status: DocumentStatus },
  openRequests: { id: string; status: RequestStatus }[]
): ArchivePlan {
  if (oldDoc.status === "signed") {
    // A signed agreement is never archived by a resend — superseding a signed
    // contract is a human/legal decision, not a popup side effect.
    throw new Error(`esign: refusing to auto-archive signed document ${oldDoc.id}`);
  }
  return {
    archiveDocumentId: oldDoc.id,
    voidRequestIds: openRequests
      .filter((r) => r.status === "pending" || r.status === "viewed")
      .map((r) => r.id),
  };
}

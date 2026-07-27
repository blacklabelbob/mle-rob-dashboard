// Core data model for The Network.
// Every field Rob asked for on the people ledger lives on Person.

export type NodeStatus = "lit" | "warm" | "unlit";
// lit   = signed / paying / actively referring
// warm  = in conversation, quoted, or personally close
// unlit = known about, not yet activated

export type PhaseOneStatus = "not-started" | "in-progress" | "complete";

export type NodeType =
  | "mle-admin"
  | "partner"
  | "lead"
  | "client"
  | "connector"
  | "vertical-anchor"
  | "rep-candidate";
// How a node grows the network: clients pay, connectors open doors,
// vertical-anchors
// (e.g. payment processing) touch every business in a territory.

export interface KeyDates {
  met?: string; // ISO dates
  quoted?: string;
  signed?: string;
  invoiced?: string;
  paid?: string;
  phaseOneComplete?: string;
}

export interface Estimate {
  estRevenue: number; // probable aggregate revenue ($) incl. doors they open
  estNewNodes: number; // probable new people/businesses they bring in
  probability: number; // 0..1 that the above materializes
  reasoning: string;
  source: "heuristic" | "claude";
  estimatedAt: string;
}

export interface Person {
  id: string;
  name: string;
  business?: string;
  role?: string;
  nodeType?: NodeType;
  entityKind?: "person" | "company";
  verticalId: string;
  phone?: string;
  email?: string;
  website?: string;
  referredById?: string; // person who opened this door
  relationship?: string; // how referrer knows them ("best friend", "his rep", ...)
  status: NodeStatus;
  quotedAmount?: number; // $
  signed: boolean;
  meetingVideoUrl?: string;
  transcriptUrl?: string;
  keyDates: KeyDates;
  phaseOne: PhaseOneStatus;
  description?: string; // free text Rob types; feeds the AI estimator
  estimate?: Estimate;
  // Q63: Phase 2 ROI estimator inputs, persisted per record so the rep's typed
  // Est Investment survives the tab closing. Deliberately NOT the same thing as
  // `estimate` above — that one scores a person's network value; this one is the
  // client's 91-day ROI guarantee. Shape: Phase2Estimate in lib/roi/automations.ts
  // (imported as a type only where needed, to keep lib/types.ts dependency-free).
  phase2Estimate?: import("@/lib/roi/automations").Phase2Estimate;
  // §8 increment 8a: which delivery components have been reported live, keyed by
  // the webhook's `componentId` slug. Optional and READ-ONLY for now — the column
  // does not exist yet, so every record reads `undefined` and the tracker renders
  // an honestly dark board rather than guessing progress from other fields.
  // Deliberately absent from adminEdit's FIELD_MAP until the column lands: a
  // mapping without a column turns every save into a 400.
  phaseComponents?: import("@/lib/phases/blueprint").ComponentLiveMap;
  notes?: string;
  assignedRep?: string; // Phase 6
  orgId?: string; // person→org link (Task 2.2, backfilled by backfill-org-links.mjs)
}

export interface Edge {
  id: string;
  fromId: string; // referrer / connector
  toId: string;
  relationship?: string;
  suggested?: boolean; // AI-suggested connection (dashed in graph)
}

export interface Vertical {
  id: string;
  name: string;
  color: string; // cluster color in the graph
}

export type ProjectCategory = "revenue-system" | "product-build" | "internal";
export type CoreTheme =
  | "sign-the-agreement"
  | "get-paid-fast"
  | "reduce-all-friction";

export interface WillItem {
  item: string;
  due?: string;
  done: boolean;
}

export interface ProjectResource {
  label: string;
  url: string;
}

export interface Project {
  id: string;
  name: string;
  category: ProjectCategory;
  theme: CoreTheme;
  completion: number; // 0..100
  owner: "Rob" | "Will" | "Max";
  summary?: string;
  link?: string;
  resources?: ProjectResource[]; // deliverables/docs Rob opens from the card (cost models, PRDs, demos)
  willItems?: WillItem[]; // things owed by Will → reminders
  updatedAt: string;
}

// ── CRM core (Task 2.2, rides migration 0005_crm_core.sql) ──────────────────
// Field lists are pinned to the 0005 DDL by lib/__tests__/crm.test.ts — if a
// column is added/renamed there, the gate test fails until these move too.

// orgs mirrors people verbatim minus entity_kind (0003_orgs_split); orgId is
// the person→org link, so it has no org-side counterpart either.
export type Org = Omit<Person, "entityKind" | "orgId">;

// Task 1.6 DRAFT stage list — not Rob-locked; 0005 uses the same check
// constraint, one cheap ALTER + this union when he locks it.
export type DealStage =
  | "new_lead"
  | "contacted"
  | "meeting_booked"
  | "meeting_held"
  | "quote_sent"
  | "negotiating"
  | "signed"
  | "invoiced"
  | "paid"
  | "delivering"
  | "stalled"
  | "lost";

export type RoutingLane = "auto_close" | "rep" | "bounty_hunter" | "booker";

export interface Deal {
  id: string;
  personId?: string; // ≥1 of personId/orgId enforced by 0005 check
  orgId?: string;
  verticalId?: string;
  ownerId?: string; // free text until Phase-4 profiles (D-002 step 9)
  name: string;
  stage: DealStage;
  value?: number;
  routingLane?: RoutingLane;
  referralSourced: boolean;
  keyDates: KeyDates;
  estimate?: Estimate; // carried short-term per D-002 step 10
  bookProtected: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType = "call" | "email" | "meeting" | "note" | "status_change";
export type ActivitySource = "manual" | "n8n" | "api" | "aidre" | "dialer";

export interface Activity {
  id: string;
  personId?: string; // ≤1 of personId/orgId, ≥1 anchor incl. dealId (0005 checks)
  orgId?: string;
  dealId?: string;
  createdBy?: string; // free text until Phase-4 profiles
  type: ActivityType;
  source: ActivitySource;
  sourceContext: Record<string, unknown>; // Task 1.15 differentiator
  summary?: string;
  actionItems?: unknown;
  buyingSignals?: unknown;
  recordingUrl?: string;
  transcriptUrl?: string; // becomes a transcripts FK at Task 7.4
  bookProtected: boolean;
  occurredAt: string;
  createdAt: string;
}

export type TaskStatus = "open" | "done" | "cancelled";

export interface Task {
  id: string;
  activityId?: string;
  dealId?: string;
  personId?: string;
  assignedTo?: string; // free text until Phase-4 profiles
  title: string;
  detail?: string;
  status: TaskStatus;
  dueDate?: string; // ISO date
  bookProtected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkData {
  people: Person[];
  edges: Edge[];
  verticals: Vertical[];
  projects: Project[];
}

// Derived, used across pages
export interface NetworkStats {
  totalPeople: number;
  litCount: number;
  warmCount: number;
  unlitCount: number;
  signedCount: number;
  pipelineQuoted: number; // sum of quoted, unsigned
  signedValue: number; // sum of quoted where signed AND keyDates.signed present (verified)
  disputedSignedValue: number; // signed=true but no signed date — excluded from rollups, shown flagged
  estNetworkValue: number; // sum of probability-weighted estimates
}
